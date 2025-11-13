// signin-page.js
import {
  authInit,
  clearStoredAuthFlowType,
  getLastAuthFlowType,
  resolveAppUrl,
  signInWithEmailPassword,
  signOut,
} from './auth.js';

const form = document.getElementById('signin-form');
const statusEl = document.getElementById('signin-status');
const emailInput = document.getElementById('signin-email');
const passwordInput = document.getElementById('signin-password');
const rememberInput = document.getElementById('remember-me');
const emailErrorEl = document.getElementById('signin-email-error');
const passwordErrorEl = document.getElementById('signin-password-error');
let formBusy = false;

function setStatus(type, message) {
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.className = `status ${type}`;
}

function clearFieldErrors() {
  if (emailErrorEl) {
    emailErrorEl.textContent = '';
    emailErrorEl.hidden = true;
  }
  if (passwordErrorEl) {
    passwordErrorEl.textContent = '';
    passwordErrorEl.hidden = true;
  }
}

function setFieldError(el, message) {
  if (!el) return;
  el.textContent = message;
  el.hidden = !message;
}

function updateAuthLinks(user) {
  const authLinks = document.querySelectorAll('[data-auth="signin"]');
  authLinks.forEach((link) => {
    if (!link) return;
    if (user) {
      link.textContent = 'Sign Out';
      link.setAttribute('href', '#');
      link.onclick = (event) => {
        event.preventDefault();
        signOut();
      };
    } else {
      link.textContent = 'Sign in';
      link.setAttribute('href', 'signin.html');
      link.onclick = null;
    }
  });
}

function setFormBusy(busy) {
  if (!form) return;
  formBusy = busy;
  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.disabled = busy;
    submitButton.textContent = busy ? 'Signing in...' : 'Sign in';
  }
}

function validate() {
  clearFieldErrors();
  let valid = true;

  const emailValue = emailInput?.value.trim();
  if (!emailValue) {
    setFieldError(emailErrorEl, 'Email is required.');
    valid = false;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
    setFieldError(emailErrorEl, 'Please enter a valid email address.');
    valid = false;
  }

  if (!passwordInput?.value) {
    setFieldError(passwordErrorEl, 'Password is required.');
    valid = false;
  }

  return valid;
}

/**
 * Validate and sanitize the next parameter to prevent open redirect
 * Only allows relative paths within the application
 */
function getSafeNextPage() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const next = urlParams.get('next');
    
    if (!next) return 'index.html';
    
    // Only allow relative paths (no protocol, no domain, no absolute paths)
    if (next.includes('://') || next.startsWith('//') || next.startsWith('http')) {
      console.warn('[Signin] Blocked suspicious next parameter:', next);
      return 'index.html';
    }
    
    // Remove any potential path traversal
    const normalized = next.replace(/\.\./g, '').replace(/^\/+/, '');
    
    // Only allow HTML files in the current directory
    if (!normalized.match(/^[a-zA-Z0-9_-]+\.html$/)) {
      console.warn('[Signin] Invalid next parameter format:', next);
      return 'index.html';
    }
    
    return normalized;
  } catch (e) {
    console.error('[Signin] Error parsing next parameter:', e);
    return 'index.html';
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  if (formBusy) return;

  if (!validate()) {
    setStatus('error', 'Please fix the highlighted fields.');
    return;
  }

  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  const remember = Boolean(rememberInput?.checked);

  try {
    setFormBusy(true);
    setStatus('info', 'Signing you in...');
    const { user } = await signInWithEmailPassword({ email, password, remember });
    updateAuthLinks(user);
    clearStoredAuthFlowType();
    setStatus('success', 'Signed in. Redirecting...');
    
    // Get safe validated next page
    const nextPage = getSafeNextPage();
    
    window.setTimeout(() => {
      window.location.assign(resolveAppUrl(nextPage));
    }, 600);
  } catch (error) {
    console.error('[Signin] submit error', error);
    setStatus('error', error.message || 'Failed to sign in.');
  } finally {
    setFormBusy(false);
  }
}

async function init() {
  try {
    const { user, flowType } = await authInit({
      onSession: (currentUser) => updateAuthLinks(currentUser),
      onNoSession: () => updateAuthLinks(null),
    });

    const contextType = flowType || getLastAuthFlowType();
    if (!user && contextType === 'recovery') {
      setStatus('info', 'Password updated. Sign in with your new password.');
      clearStoredAuthFlowType();
    }

    if (!user) {
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.get('reset') === '1') {
          setStatus('success', 'Password updated. Sign in with your new password.');
          url.searchParams.delete('reset');
          const nextSearch = url.searchParams.toString();
          const nextUrl = url.pathname + (nextSearch ? `?${nextSearch}` : '') + url.hash;
          window.history.replaceState({}, document.title, nextUrl);
        }
      } catch (navError) {
        console.warn('[Signin] Unable to clean reset query flag', navError);
      }
    }

    if (user) {
      // Get safe validated next page
      const nextPage = getSafeNextPage();
      
      setStatus('success', 'You are already signed in. Redirecting...');
      window.setTimeout(() => {
        window.location.assign(resolveAppUrl(nextPage));
      }, 500);
      return;
    }

    form?.addEventListener('submit', handleSubmit);
  } catch (error) {
    console.error('[Signin] init error', error);
    setStatus('error', error.message || 'Unable to initialise sign in.');
  }
}

if (form) {
  init();
}
