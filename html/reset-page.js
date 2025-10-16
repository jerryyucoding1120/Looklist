// reset-page.js
import { getAuthClients, resetPasswordForEmail, signOut } from './auth.js';

const requestForm = document.getElementById('request-form');
const resetForm = document.getElementById('reset-form');
const requestStatus = document.getElementById('request-status');
const resetStatus = document.getElementById('reset-status');
const requestPanel = document.getElementById('request-panel');
const resetPanel = document.getElementById('reset-panel');
const requestEmailInput = document.getElementById('req-email');
const newPassInput = document.getElementById('new-pass');
const confirmPassInput = document.getElementById('new-pass2');

// ---- Helpers ----

function setStatus(el, type, message) {
  if (!el) return;
  el.textContent = message || '';
  el.className = `status ${type}`;
}

function showRequestPanel() {
  if (requestPanel) requestPanel.hidden = false;
  if (resetPanel) resetPanel.hidden = true;
}

function showResetPanel() {
  if (requestPanel) requestPanel.hidden = true;
  if (resetPanel) resetPanel.hidden = false;
}

function getRecoveryTokens() {
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  return {
    access_token: hashParams.get('access_token'),
    refresh_token: hashParams.get('refresh_token'),
  };
}

async function establishRecoverySession() {
  const { spLocal } = await getAuthClients();

  // If a session already exists, just return it
  const { data: current } = await spLocal.auth.getSession();
  if (current?.session) {
    return spLocal;
  }

  // Parse tokens from hash
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");

  if (accessToken && refreshToken) {
    const { data, error } = await spLocal.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) {
      console.error("[Reset] Failed to set recovery session:", error);
      return null;
    }

    // Clear hash so it doesn't get reused
    window.history.replaceState({}, document.title, window.location.pathname);
    return spLocal;
  }

  return null;
}


// ---- Form Handlers ----

async function handleRequestSubmit(event) {
  event.preventDefault();
  const email = requestEmailInput?.value.trim().toLowerCase();
  if (!email) {
    setStatus(requestStatus, 'error', 'Please enter your email.');
    return;
  }

  setStatus(requestStatus, 'info', 'Sending reset email…');
  try {
    // ⚡ redirectTo must be your reset page
    const redirectTo = window.location.origin + window.location.pathname;
    await resetPasswordForEmail(email, redirectTo);

    setStatus(
      requestStatus,
      'success',
      'If that email exists, we sent a reset link. Please check your inbox.'
    );
    requestForm?.reset();
  } catch (error) {
    console.error('[Reset] request error', error);
    setStatus(requestStatus, 'error', error.message || 'Unable to send reset email.');
  }
}

async function handleResetSubmit(event) {
  event.preventDefault();

  const password = newPassInput?.value || '';
  const confirmPassword = confirmPassInput?.value || '';

  if (password.length < 8) {
    setStatus(resetStatus, 'error', 'Password must be at least 8 characters.');
    return;
  }
  if (password !== confirmPassword) {
    setStatus(resetStatus, 'error', 'Passwords do not match.');
    return;
  }

  setStatus(resetStatus, 'info', 'Updating your password…');

  try {
    const client = await establishRecoverySession();
    if (!client) {
      setStatus(resetStatus, 'error', 'Reset link expired. Please request a new one.');
      return;
    }

    const { error } = await client.auth.updateUser({ password });
    if (error) throw error;

    setStatus(resetStatus, 'success', 'Password updated! Redirecting…');
    setTimeout(async () => {
      await signOut();
      window.location.assign('signin.html');
    }, 1200);
  } catch (error) {
    console.error('[Reset] update error', error);
    setStatus(resetStatus, 'error', error.message || 'Unable to update password.');
  }
}

// ---- Init ----

async function initResetPage() {
  const { access_token, refresh_token } = getRecoveryTokens();
  if (access_token && refresh_token) {
    // Came here from Supabase recovery link
    showResetPanel();
    setStatus(resetStatus, 'info', 'Enter your new password.');
  } else {
    // Default to request form
    showRequestPanel();
  }

  requestForm?.addEventListener('submit', handleRequestSubmit);
  resetForm?.addEventListener('submit', handleResetSubmit);
}

if (requestForm || resetForm) {
  initResetPage();
}
