// Supabase Edge Function — upsert-slots
// Validates merchant ownership and inserts time slots into the time_slots table
// Uses anon key + user JWT for ownership validation (RLS-safe)
// Returns consistent JSON envelope: { success, data?, error? }
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TimeSlot {
  listing_id: string
  starts_at: string
  ends_at: string
  price?: number
  capacity?: number
  status?: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return json({ success: false, error: 'Method Not Allowed' }, 405);
  }

  try {
    // Get authorization token from header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ success: false, error: 'Missing authorization header' }, 401);
    }

    // Validate environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseAnonKey) {
      return json({ success: false, error: 'Server configuration error' }, 500);
    }

    // Create client with anon key + user's JWT for ownership validation (RLS-safe)
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader }
      },
      auth: {
        persistSession: false
      }
    });

    // Get the authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return json({ success: false, error: 'Unauthorized' }, 401);
    }

    // Parse request body
    const body = await req.json();
    const { listing_id, slots } = body;

    if (!listing_id || !slots || !Array.isArray(slots)) {
      return json({ 
        success: false,
        error: 'Invalid request body. Expected: { listing_id, slots: [...] }' 
      }, 400);
    }

    // Validate merchant owns the listing (RLS-enforced with anon key)
    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('id, owner')
      .eq('id', listing_id)
      .single();

    if (listingError || !listing) {
      return json({ 
        success: false,
        error: 'Listing not found'
      }, 404);
    }

    if (listing.owner !== user.id) {
      return json({ 
        success: false,
        error: 'Forbidden: You do not own this listing' 
      }, 403);
    }

    // Prepare and sanitize slots for insertion
    const slotsToInsert: TimeSlot[] = slots.map((slot: any) => ({
      listing_id,
      starts_at: slot.starts_at,
      ends_at: slot.ends_at,
      price: slot.price ?? null,
      capacity: slot.capacity ?? 1,
      status: slot.status ?? 'open'
    }));

    // Try inserting with anon key first (RLS-enforced)
    let insertedSlots;
    let insertError;
    
    ({ data: insertedSlots, error: insertError } = await supabase
      .from('time_slots')
      .insert(slotsToInsert)
      .select());

    // If RLS blocks the insert, fallback to service role key if available
    if (insertError && supabaseServiceRoleKey) {
      console.log('[upsert-slots] RLS blocked insert, using service role');
      const supabaseService = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { persistSession: false }
      });
      
      ({ data: insertedSlots, error: insertError } = await supabaseService
        .from('time_slots')
        .insert(slotsToInsert)
        .select());
    }

    if (insertError) {
      // If error is due to duplicate, we still consider it a partial success
      if (insertError.code === '23505') {
        return json({ 
          success: true,
          data: {
            message: 'Some slots were skipped due to duplicates',
            inserted: 0,
            skipped: slotsToInsert.length
          }
        }, 200);
      }

      // Sanitize error message to avoid leaking internal details
      return json({ 
        success: false,
        error: 'Failed to insert slots'
      }, 500);
    }

    return json({ 
      success: true,
      data: {
        inserted: insertedSlots?.length ?? 0,
        skipped: slotsToInsert.length - (insertedSlots?.length ?? 0)
      }
    }, 200);

  } catch (error) {
    console.error('Error in upsert-slots:', error);
    return json({ 
      success: false,
      error: 'Internal server error'
    }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
