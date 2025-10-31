// Supabase Edge Function — upsert-slots
// Validates merchant ownership and inserts time slots into the time_slots table
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

interface TimeSlot {
  listing_id: string
  starts_at: string
  ends_at: string
  price?: number
  capacity?: number
  status?: string
}

Deno.serve(async (req) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { 
      status: 405,
      headers: { 'content-type': 'application/json' }
    });
  }

  try {
    // Get authorization token from header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { 'content-type': 'application/json' }
      });
    }

    // Create Supabase client with service role for RLS bypass when needed
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    }

    // Create client with user's JWT for ownership validation
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
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
      return new Response(JSON.stringify({ error: 'Unauthorized', details: userError?.message }), {
        status: 401,
        headers: { 'content-type': 'application/json' }
      });
    }

    // Parse request body
    const body = await req.json();
    const { listing_id, slots } = body;

    if (!listing_id || !slots || !Array.isArray(slots)) {
      return new Response(JSON.stringify({ 
        error: 'Invalid request body. Expected: { listing_id, slots: [...] }' 
      }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    }

    // Validate merchant owns the listing
    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('id, owner')
      .eq('id', listing_id)
      .single();

    if (listingError || !listing) {
      return new Response(JSON.stringify({ 
        error: 'Listing not found',
        details: listingError?.message
      }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }

    if (listing.owner !== user.id) {
      return new Response(JSON.stringify({ 
        error: 'Forbidden: You do not own this listing' 
      }), {
        status: 403,
        headers: { 'content-type': 'application/json' }
      });
    }

    // Prepare slots for insertion
    const slotsToInsert: TimeSlot[] = slots.map((slot: any) => ({
      listing_id,
      starts_at: slot.starts_at,
      ends_at: slot.ends_at,
      price: slot.price ?? null,
      capacity: slot.capacity ?? 1,
      status: slot.status ?? 'open'
    }));

    // Insert slots (duplicates will be skipped by unique index)
    const { data: insertedSlots, error: insertError } = await supabase
      .from('time_slots')
      .insert(slotsToInsert)
      .select();

    if (insertError) {
      // If error is due to duplicate, we still consider it a partial success
      if (insertError.code === '23505') {
        return new Response(JSON.stringify({ 
          success: true,
          message: 'Some slots were skipped due to duplicates',
          inserted: 0,
          skipped: slotsToInsert.length
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ 
        error: 'Failed to insert slots',
        details: insertError.message,
        code: insertError.code
      }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ 
      success: true,
      inserted: insertedSlots?.length ?? 0,
      skipped: slotsToInsert.length - (insertedSlots?.length ?? 0)
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in upsert-slots:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
});
