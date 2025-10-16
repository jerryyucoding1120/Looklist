// supabase-client.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Optionally configure via <meta> tags or window.ENV
function getMeta(name) {
  const el = document.querySelector(`meta[name="${name}"]`);
  return el?.content || null;
}

const SUPABASE_URL =
  (typeof window !== 'undefined' && window.ENV?.SUPABASE_URL) ||
  getMeta('supabase-url') ||
  'https://YOUR_PROJECT.supabase.co';

const SUPABASE_ANON_KEY =
  (typeof window !== 'undefined' && window.ENV?.SUPABASE_ANON_KEY) ||
  getMeta('supabase-anon-key') ||
  'YOUR_SUPABASE_ANON_KEY';

// Persistent client (like "Remember me")
export const spLocal = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'looklist-auth-local',
  },
  global: { headers: { 'x-client-info': 'looklist-merchant' } },
});

// Session-only client (clears when tab/browser closes)
export const spSession = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'looklist-auth-session',
  },
  global: { headers: { 'x-client-info': 'looklist-merchant' } },
});

// Default: persistent
export const sb = spLocal;
