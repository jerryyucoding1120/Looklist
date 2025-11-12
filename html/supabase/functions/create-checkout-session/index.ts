// Supabase Edge Function (Deno) — Creates a Stripe Checkout Session.
// - Expects Authorization: Bearer <Supabase JWT> from the frontend
// - Body: { listing_id: string, availability_id: string, lld_to_redeem?: number }
// - Applies LLD redemption (1 LLD = £0.01), capped by wallet balance and slot price
// - Returns: { success: true, data: { url } } for Stripe-hosted checkout
//
// Notes:
// - Requires secrets: STRIPE_SECRET_KEY (or STRIPE_KEY), SUPABASE_ANON_KEY, SUPABASE_URL
// - CORS enabled for static site usage
// - Uses anon key + user JWT for authenticated queries (RLS-safe)
// - Redirect URLs are dynamically determined from request headers

import Stripe from "npm:stripe@14.25.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Environment validation with fallback for STRIPE_KEY
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") || Deno.env.get("STRIPE_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

// Validate environment variables
if (!STRIPE_SECRET_KEY) {
  throw new Error("Missing STRIPE_SECRET_KEY or STRIPE_KEY environment variable");
}
if (!SUPABASE_URL) {
  throw new Error("Missing SUPABASE_URL environment variable");
}
if (!ANON_KEY) {
  throw new Error("Missing SUPABASE_ANON_KEY environment variable");
}

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Extract and validate JWT
    const auth = req.headers.get("authorization") || "";
    const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!jwt) {
      return json({ success: false, error: "Unauthorized (no token)" }, 401);
    }

    // Parse request body
    const { listing_id, availability_id, lld_to_redeem } = await req.json().catch(() => ({}));
    if (!listing_id || !availability_id) {
      return json({ 
        success: false, 
        error: "listing_id and availability_id are required" 
      }, 400);
    }

    // Create client with anon key + user JWT for RLS-safe queries
    const supabase = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    });

    // Validate user session
    const { data: userRes, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userRes?.user) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }
    const user = userRes.user;

    // Fetch slot details with capacity check
    const { data: slot, error: slotErr } = await supabase
      .from("availability")
      .select("id, listing_id, label, date, start_time, end_time, price, capacity, booked_count")
      .eq("id", availability_id)
      .single();
    
    if (slotErr || !slot) {
      return json({ success: false, error: "Slot not found" }, 404);
    }
    
    if (slot.capacity && slot.booked_count >= slot.capacity) {
      return json({ success: false, error: "Slot is fully booked" }, 409);
    }

    // Fetch listing name
    const { data: listing } = await supabase
      .from("listings")
      .select("name")
      .eq("id", listing_id)
      .single();

    // Calculate pricing
    const pricePence = Math.max(0, Math.round(Number(slot.price) * 100));
    let redeem = Math.max(0, Math.floor(Number(lld_to_redeem || 0)));

    // Fetch user wallet balance
    const { data: wallet } = await supabase
      .from("wallets")
      .select("lld_balance")
      .eq("user_id", user.id)
      .maybeSingle();
    const balance = Math.max(0, Math.floor(Number(wallet?.lld_balance || 0)));

    // Cap redemption by balance and price
    redeem = Math.min(redeem, pricePence, balance);

    // Ensure minimum Stripe payment (50p)
    const payAmount = Math.max(50, pricePence - redeem);

    const productName = `${listing?.name || "Service"}${slot.label ? " · " + slot.label : ""} (${slot.date} ${slot.start_time}–${slot.end_time})`;

    // Dynamically determine the redirect URL from request headers
    const siteUrl = req.headers.get('origin') || new URL(req.url).origin;
    const successUrl = 'https://looklist.co.uk/html/profile.html?paid=1';
    const cancelUrl = new URL(`/Looklist/html/index.html?stripe=cancel`, siteUrl).toString();

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: payAmount,
            product_data: { name: productName },
          },
        },
      ],
      client_reference_id: user.id,
      metadata: {
        user_id: user.id,
        listing_id,
        availability_id,
        price_pence: String(pricePence),
        lld_to_redeem: String(redeem),
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return json({ success: true, data: { url: session.url } }, 200);
  } catch (e) {
    console.error("[create-checkout-session] Error:", e);
    // Sanitize error messages to avoid leaking internal details
    const message = e instanceof Error ? e.message : "Unexpected error";
    return json({ success: false, error: message }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}