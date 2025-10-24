// supabase-client.js
// Single source of truth for Supabase client configuration.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Optionally configure via <meta> tags or window.ENV
function getMeta(name) {
  const el = document.querySelector(`meta[name="${name}"]`);
  return el?.content || null;
}

const SUPABASE_URL =
  (typeof window !== 'undefined' && window.ENV?.SUPABASE_URL) ||
  getMeta('supabase-url') ||
  'https://enkibawrpiqfnzhtifsf.supabase.co';

const SUPABASE_ANON_KEY =
  (typeof window !== 'undefined' && window.ENV?.SUPABASE_ANON_KEY) ||
  getMeta('supabase-anon-key') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVua2liYXdycGlxZm56aHRpZnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg0NzQ5MTMsImV4cCI6MjA3NDA1MDkxM30.m3Bu116Bau6iCJ-BqJZX9fYuKSRX_8-WgblsDwutkfI';

// Export for debugging - consumers can check which project is in use
export const __SUPABASE_URL = SUPABASE_URL;

// Log resolved config once for debugging
if (!window.__supabaseClientLogged) {
  const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];
  console.log(`[supabase-client] Using project: ${projectRef}`);
  window.__supabaseClientLogged = true;
}

// Persistent client (like "Remember me")
export const spLocal = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Session-only client (clears when tab/browser closes)
export const spSession = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Default: persistent
export const sb = spLocal;
