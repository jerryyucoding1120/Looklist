// Supabase Edge Function — bookings-demo
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  return new Response(JSON.stringify({ ok: true, id: crypto.randomUUID() }), {
    headers: { 'content-type': 'application/json' }
  });
});
