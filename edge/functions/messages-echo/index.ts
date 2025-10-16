// Supabase Edge Function — messages-echo
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  const json = await req.json().catch(()=>({}));
  return new Response(JSON.stringify({ ok: true, echo: json }), {
    headers: { 'content-type': 'application/json' }
  });
});
