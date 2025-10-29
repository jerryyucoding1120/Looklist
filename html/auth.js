/* Shared Supabase auth for all pages (static-site friendly)
   - Automatically switches "Sign in" to "Sign out" after login
   - Fills [data-auth="user-name"] with user name/email
   - Exposes helpers for init, sign-in/out, password flows, signup, and URL session handling
*/

const SUPABASE_JS_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
const SUPABASE_URL = 'https://rgzdgeczrncuxufkyuxf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVua2liYXdycGlxZm56aHRpZnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg0NzQ5MTMsImV4cCI6MjA3NDA1MDkxM30.m3Bu116Bau6iCJ-BqJZX9fYuKSRX_8-WgblsDwutkfI';

let spLocal;
let spSession;
let supabaseScriptPromise;
let urlSessionPromise;

const FLOW_TYPE_KEY = 'looklist.auth.flowType';
let inMemoryFlowType = null;

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

function storageFromWindow(key) {
  try {
    const target = window[key];
    if (!target) return memoryStorage;
    const testKey = '__looklist_auth__test__';
    target.setItem(testKey, '1');
    target.removeItem(testKey);
    return target;
  } catch (error) {
    console.warn(`[auth] Falling back to in-memory storage for ${key}`, error);
    return memoryStorage;
  }
}

const localPersist = () => storageFromWindow('localStorage');
const sessionPersist = () => storageFromWindow('sessionStorage');

function toAbsoluteUrl(path) {
  if (!path) return window.location.href;
  try {
    if (/^https?:\/\//i.test(path)) return path;
    const url = new URL(window.location.href);
    url.hash = '';
    url.search = '';
    const segments = url.pathname.split('/');
    segments.pop();
    url.pathname = `${segments.join('/')}/${path}`.replace(/\/+/g, '/');
    return url.toString();
  } catch (error) {
    console.warn('[auth] Unable to build absolute URL, returning original path', error);
    return path;
  }
}

async function loadSupabase() {
  if (window.supabase?.createClient) return;
  if (!supabaseScriptPromise) {
    supabaseScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SUPABASE_JS_URL;
      script.async = true;
      script.onload = resolve;
      script.onerror = (event) => {
        supabaseScriptPromise = undefined;
        reject(event);
      };
      document.head.appendChild(script);
    });
  }
  await supabaseScriptPromise;
}

async function ensureClientsReady() {
  if (spLocal && spSession) {
    return { spLocal, spSession };
  }

  await loadSupabase();
  const createClient = window.supabase.createClient;

  spLocal = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      storage: localPersist(),
      /* 
      autoRefreshToken: true,
      */
      detectSessionInUrl: false,
    },
  });

  spSession = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      storage: sessionPersist(),
      /* 1
      autoRefreshToken: true,
      */
      detectSessionInUrl: false,
    },
  });

  return { spLocal, spSession };
}

function normaliseAuthError(error, fallbackMessage) {
  if (!error) return new Error(fallbackMessage || 'Unknown auth error');
  if (typeof error === 'string') return new Error(error);
  if (error.message) return new Error(error.message);
  return new Error(fallbackMessage || 'Unknown auth error');
}

function rememberFlowType(type) {
  if (!type) return;
  inMemoryFlowType = type;
  try {
    sessionPersist().setItem(FLOW_TYPE_KEY, type);
  } catch (error) {
    memoryStorage.setItem(FLOW_TYPE_KEY, type);
  }
}

function readStoredFlowType() {
  if (inMemoryFlowType) return inMemoryFlowType;
  try {
    const stored = sessionPersist().getItem(FLOW_TYPE_KEY);
    if (stored) {
      inMemoryFlowType = stored;
      return stored;
    }
  } catch (error) {
    // ignore storage errors and fall through
  }
  return getTypeFromLocation();
}

function clearStoredAuthFlowType() {
  inMemoryFlowType = null;
  try {
    sessionPersist().removeItem(FLOW_TYPE_KEY);
  } catch (error) {
    memoryStorage.removeItem(FLOW_TYPE_KEY);
  }
}

function getTypeFromLocation() {
  if (typeof window === 'undefined') return null;
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const searchParams = new URLSearchParams(window.location.search);
  return hashParams.get('type') || searchParams.get('type') || null;
}

function clearAuthParamsFromUrl() {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  try {
    const url = new URL(window.location.href);
    const searchParams = new URLSearchParams(url.search);
    ['code', 'access_token', 'refresh_token', 'expires_in', 'token_type', 'provider_token', 'error_description', 'error_code', 'state']
      .forEach((param) => searchParams.delete(param));
    searchParams.delete('type');
    url.search = searchParams.toString() ? `?${searchParams.toString()}` : '';
    url.hash = '';
    window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
  } catch (error) {
    console.warn('[auth] Failed to clean auth parameters from URL', error);
  }
}

async function handleAuthFromUrl() {
  if (typeof window === 'undefined') return null;
  if (urlSessionPromise) return urlSessionPromise;

  urlSessionPromise = (async () => {
    const { spLocal } = await ensureClientsReady();
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const searchParams = new URLSearchParams(window.location.search);

    const errorDescription = searchParams.get('error_description') || hashParams.get('error_description');
    if (errorDescription) {
      console.warn('[auth] Redirect reported error:', errorDescription);
    }

    const hasHashTokens = hashParams.has('access_token') && hashParams.has('refresh_token');
    const hasCode = searchParams.has('code');
    const type = hashParams.get('type') || searchParams.get('type') || null;

    if (type) rememberFlowType(type);
    if (!hasHashTokens && !hasCode) {
      return null;
    }

    try {
      if (hasHashTokens) {
        const tokens = {
          access_token: hashParams.get('access_token'),
          refresh_token: hashParams.get('refresh_token'),
        };
        if (hashParams.has('expires_in')) {
          const ttl = Number(hashParams.get('expires_in'));
          if (!Number.isNaN(ttl)) tokens.expires_in = ttl;
        }
        if (hashParams.has('token_type')) {
          tokens.token_type = hashParams.get('token_type');
        }
        const { data, error } = await spLocal.auth.setSession(tokens);
        if (error) throw error;
        return { ...data, source: 'hash', type };
      }
      const code = searchParams.get('code');
      const { data, error } = await spLocal.auth.exchangeCodeForSession(code);
      if (error) throw error;
      return { ...data, source: 'query', type };
    } finally {
      clearAuthParamsFromUrl();
    }
  })().catch((error) => {
    console.error('[auth] Unable to process auth parameters from URL', error);
    return { error };
  });

  return urlSessionPromise;
}

async function getBestSession() {
  const { spLocal, spSession } = await ensureClientsReady();
  const [local, session] = await Promise.allSettled([
    spLocal.auth.getSession(),
    spSession.auth.getSession(),
  ]);

  if (local.status === 'fulfilled' && local.value?.data?.session) {
    return { session: local.value.data.session, source: 'local' };
  }
  if (session.status === 'fulfilled' && session.value?.data?.session) {
    return { session: session.value.data.session, source: 'session' };
  }

  return { session: null, source: null };
}

export async function getAuthClients() {
  return ensureClientsReady();
}

export async function authInit(options = {}) {
  const {
    requireAuth = false,
    redirectTo = 'signin.html',
    onSession,
    onNoSession,
  } = options;

  const urlResult = await handleAuthFromUrl();
  const { session, source } = await getBestSession();
  const user = session?.user ?? null;
  const flowType = urlResult?.type || readStoredFlowType();

  if (user) {
    onSession?.(user, { session, source, flowType, urlResult });
  } else {
    onNoSession?.({ flowType, urlResult });
    if (requireAuth) {
      window.setTimeout(() => {
        window.location.assign(toAbsoluteUrl(redirectTo));
      }, 50);
    }
  }

  return { user, session, source, flowType, urlResult };
}

export async function signInWithEmailPassword(arg1, arg2, arg3) {
  let email;
  let password;
  let remember = true;

  if (typeof arg1 === 'object' && arg1 !== null && !Array.isArray(arg1)) {
    ({ email, password, remember = true } = arg1);
  } else {
    email = arg1;
    password = arg2;
    if (typeof arg3 === 'boolean') {
      remember = arg3;
    } else if (typeof arg3 === 'object' && arg3 !== null) {
      ({ remember = remember } = arg3);
    }
  }

  if (!email || !password) {
    throw new Error('Email and password are required');
  }

  const { spLocal, spSession } = await ensureClientsReady();
  const client = remember ? spLocal : spSession;

  const { data, error } = await client.auth.signInWithPassword({
    email: String(email).trim().toLowerCase(),
    password,
  });

  if (error) {
    throw normaliseAuthError(error, 'Failed to sign in');
  }

  return { ...data, remember };
}

export async function signUpWithEmailPassword({
  email,
  password,
  fullName,
  role = 'client',
  metadata = {},
} = {}) {
  if (!email || !password) {
    throw new Error('Email and password are required');
  }

  const { spLocal } = await ensureClientsReady();
  const dataPayload = {
    role,
    ...metadata,
  };
  if (fullName) {
    dataPayload.full_name = fullName;
  }

  const { data, error } = await spLocal.auth.signUp({
    email: String(email).trim().toLowerCase(),
    password,
    options: {
      data: dataPayload,
    },
  });

  if (error) {
    throw normaliseAuthError(error, 'Failed to sign up');
  }

  return data;
}

export async function signOut({ scope = 'global' } = {}) {
  const { spLocal, spSession } = await ensureClientsReady();
  await Promise.allSettled([
    spLocal.auth.signOut({ scope }),
    spSession.auth.signOut({ scope }),
  ]);
  clearStoredAuthFlowType();
}

export async function resetPasswordForEmail(email, redirectTo = 'reset.html') {
  if (!email) throw new Error('Email is required');
  const { spLocal } = await ensureClientsReady();

  const { data, error } = await spLocal.auth.resetPasswordForEmail(
    String(email).trim().toLowerCase(),
    {
      redirectTo: toAbsoluteUrl(redirectTo),
    }
  );

  if (error) {
    throw normaliseAuthError(error, 'Failed to send reset email');
  }

  return data;
}

export async function updateUserPassword(newPassword) {
  if (!newPassword) throw new Error('Password is required');
  const { spLocal } = await ensureClientsReady();

  const { data, error } = await spLocal.auth.updateUser({ password: newPassword });

  if (error) {
    throw normaliseAuthError(error, 'Failed to update password');
  }

  return data;
}

export async function onAuthStateChange(callback) {
  if (typeof callback !== 'function') {
    throw new Error('callback must be a function');
  }

  const { spLocal, spSession } = await ensureClientsReady();
  const subscriptions = [];

  const register = (client, storage) => {
    const { data } = client.auth.onAuthStateChange((event, session) => {
      callback(event, session, storage);
      if (event === 'PASSWORD_RECOVERY') {
        rememberFlowType('recovery');
      }
      if (event === 'SIGNED_OUT') {
        clearStoredAuthFlowType();
      }
    });
    subscriptions.push(data.subscription);
  };

  register(spLocal, 'local');
  register(spSession, 'session');

  return () => {
    subscriptions.forEach((subscription) => {
      try {
        subscription.unsubscribe();
      } catch (error) {
        console.warn('[auth] Failed to unsubscribe from auth listener', error);
      }
    });
  };
}

export function getLastAuthFlowType() {
  return readStoredFlowType();
}

export { toAbsoluteUrl as resolveAppUrl, clearStoredAuthFlowType };
