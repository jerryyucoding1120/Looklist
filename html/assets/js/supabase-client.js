// supabase-client.js
// ⚠️ SINGLE SOURCE OF TRUTH FOR SUPABASE CLIENT CONFIGURATION ⚠️
// 
// This file is the ONLY place where createClient() should be called.
// All other files must import { sb } from this file or its re-export shims.
//
// DO NOT create new Supabase client instances elsewhere - it causes:
//  - Session/auth conflicts between pages
//  - Missing Authorization headers on Edge Function calls
//  - Stripe checkout errors ("You did not provide an API key")
//
// See AUTH.md for full documentation.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Optionally configure via <meta> tags or window.ENV
function getMeta(name) {
  const el = document.querySelector(`meta[name="${name}"]`);
  return el?.content || null;
}

const SUPABASE_URL =
  (typeof window !== 'undefined' && window.ENV?.SUPABASE_URL) ||
  getMeta('supabase-url') ||
  'https://rgzdgeczrncuxufkyuxf.supabase.co';

const SUPABASE_ANON_KEY =
  (typeof window !== 'undefined' && window.ENV?.SUPABASE_ANON_KEY) ||
  getMeta('supabase-anon-key') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnemRnZWN6cm5jdXh1Zmt5dXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxOTI3MTAsImV4cCI6MjA3MTc2ODcxMH0.dYt-MxnGZZqQ-pUilyMzcqSJjvlCNSvUCYpVJ6TT7dU';

// Export for debugging - consumers can check which project is in use
export const __SUPABASE_URL = SUPABASE_URL;

// In-memory storage fallback for when localStorage/sessionStorage are unavailable
const memoryStorage = (() => {
  let store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
})();

// Helper to get storage with fallback
function storageFromWindow(key) {
  try {
    const target = window[key];
    if (!target) return memoryStorage;
    const testKey = '__looklist_supabase__test__';
    target.setItem(testKey, '1');
    target.removeItem(testKey);
    return target;
  } catch (error) {
    console.warn(`[supabase-client] Falling back to in-memory storage for ${key}`, error);
    return memoryStorage;
  }
}

const localPersist = () => storageFromWindow('localStorage');
const sessionPersist = () => storageFromWindow('sessionStorage');

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
    storage: localPersist(), // Custom storage with fallback
    autoRefreshToken: true,
    detectSessionInUrl: false, // Manual URL handling via auth.js
  },
});

// Session-only client (clears when tab/browser closes)
export const spSession = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    storage: sessionPersist(), // Custom storage with fallback
    autoRefreshToken: true,
    detectSessionInUrl: false, // Manual URL handling via auth.js
  },
});

// Default export: persistent client (recommended for most use cases)
// Use this for all database queries, storage operations, and Edge Function calls.
// This ensures consistent session state and automatic JWT attachment.
export const sb = spLocal;
