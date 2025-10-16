// Shared Supabase client for merchant modules.
// Usage: import { sb } from './supabase-client.js';

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

function getMeta(name) {
  const el = document.querySelector(`meta[name="${name}"]`);
  return el?.content || null;
}

// Prefer meta tags when present (e.g., merchant/index.html), fallback to known values.
const SUPABASE_URL = getMeta('supabase-url') || 'https://rgzdgeczrncuxufkyuxf.supabase.co';
const SUPABASE_ANON_KEY =
  getMeta('supabase-anon-key') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnemRnZWN6cm5jdXh1Zmt5dXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxOTI3MTAsImV4cCI6MjA3MTc2ODcxMH0.dYt-MxnGZZqQ-pUilyMzcqSJjvlCNSvUCYpVJ6TT7dU';

// Persist session in localStorage so it survives reload/redirects.
export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    storage: window.localStorage,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});