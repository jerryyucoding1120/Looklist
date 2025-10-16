import { sb } from './supabase-client.js';

/** Wait for a session to settle (hash or code flow) up to timeoutMs. */
async function waitForSession(timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data: { session } } = await sb.auth.getSession();
    if (session) return session;
    await new Promise(r => setTimeout(r, 120));
  }
  return null;
}

/** Redirect unauthenticated users to signin (../signin.html?next=...) */
export async function requireUser({ waitMs = 3000 } = {}) {
  let { data: { session } } = await sb.auth.getSession();
  if (!session) session = await waitForSession(waitMs);
  if (session) {
    const { data: { user } } = await sb.auth.getUser();
    return user || null;
  }

  // If no session, bounce to signin
  const here = new URL(location.href);
  const signInUrl = new URL('../signin.html', here);
  signInUrl.searchParams.set('next', here.pathname + here.search + here.hash);
  location.replace(signInUrl.toString());
  return null;
}

/** Sign out */
export async function signOut() {
  await sb.auth.signOut();
  const url = new URL('../signin.html', location.href);
  location.replace(url.toString());
}

/** Login helper */
export async function signInWithEmailPassword(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);

  const urlParams = new URLSearchParams(window.location.search);
  const next = urlParams.get('next') || 'listings.html';
  window.location.href = next;
}
