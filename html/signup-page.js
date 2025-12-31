import {
  authInit,
  resolveAppUrl,
  signOut,
  signUpWithEmailPassword,
} from './auth.js';

console.log('🔥 LIVE signup-page.js LOADED');

/* ------------------ DOM REFERENCES ------------------ */
const form = document.getElementById('signup-form');
const statusEl = document.getElementById('signup-status');
const nameInput = document.getElementById('signup-name');
const emailInput = document.getElementById('signup-email');
const passwordInput = document.getElementById('signup-password');
const confirmInput = document.getElementById('signup-password-confirm');
const roleInputs = document.querySelectorAll('input[name="role"]');

const errors = {
  name: document.getElementById('signup-name-error'),
  email: document.getElementById('signup-email-error'),
  password: document.getElementById('signup-password-error'),
  confirm: document.getElementById('signup-password-confirm-error'),
};

let formBusy = false;

/* ------------------ UI HELPERS ------------------ */
function setStatus(type, message) {
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.className = `status ${type}`;
}

function updateAuthLinks(user) {
  const authLinks = document.querySelectorAll('[data-auth="signin"]');
  authLinks.forEach((link) => {
    if (!link) return;
    if (user) {
      link.textContent = 'Sign Out';
      link.href = '#';
      link.onclick = (e) => {
        e.preventDefault();
        signOut();
      };
    } else {
      link.textContent = 'Sign in';
      link.href = 'signin.html';
      link.onclick = null;
    }
  });
}

function clearErrors() {
  Object.values(errors).forEach((el) => {
    if (!el) return;
    el.textContent = '';
    el.hidden = true;
  });
}

function setError(key, message) {
  const el = errors[key];
  if (!el) return;
  el.textContent = message;
  el.hidden = !message;
}

function setFormBusy(busy) {
  if (!form) return;
  formBusy = busy;
  const button = form.querySelector('button[type="submit"]');
  if (button) {
    button.disabled = busy;
    button.textContent = busy ? 'Creating account...' : 'Create account';
  }
}

/* ------------------ VALIDATION ------------------ */
function getSelectedRole() {
  const selected = Array.from(roleInputs).find((r) => r.checked);
  return selected?.value || 'client';
}

function validate() {
  clearErrors();
  let valid = true;

  const name = nameInput.value.trim();
  if (!name) {
    setError('name', 'Full name is required.');
    valid = false;
  }

  const email = emailInput.value.trim();
  if (!email) {
    setError('email', 'Email is required.');
    valid = false;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setError('email', 'Enter a valid email address.');
    valid = false;
  }

  const password = passwordInput.value || '';
  if (password.length < 8) {
    setError('password', 'Password must be at least 8 characters.');
    valid = false;
  }

  if (confirmInput.value !== password) {
    setError('confirm', 'Passwords do not match.');
    valid = false;
  }

  return valid;
}

/* ------------------ ERROR MAPPING ------------------ */
function handleSignupError(error) {
  const msg = error?.message || '';

  if (msg.includes('already registered')) {
    setError('email', 'This email is already in use.');
    return;
  }

  if (msg.includes('invalid email')) {
    setError('email', 'Invalid email address.');
    return;
  }

  if (msg.includes('password')) {
    setError('password', msg);
    return;
  }

  setStatus('error', msg || 'Signup failed. Please try again.');
}

/* ------------------ SUBMIT HANDLER ------------------ */
async function handleSubmit(event) {
  event.preventDefault();
  if (formBusy) return;

  if (!validate()) {
    setStatus('error', 'Please fix the highlighted fields.');
    return;
  }

  try {
    setFormBusy(true);
    setStatus('info', 'Creating your account...');

    const { user, session } = await signUpWithEmailPassword({
      email: emailInput.value.trim().toLowerCase(),
      password: passwordInput.value,
      fullName: nameInput.value.trim() || null,
      role: getSelectedRole(),
    });

    /* ------------------ SUCCESS STATES ------------------ */

    // Case 1: Email confirmation required (no session yet)
    if (!session) {
      setStatus(
        'success',
        'Account created successfully. Please check your email to verify your account.'
      );
      form.reset();
      return;
    }

    // Case 2: Instant session (email confirm off or already verified)
    updateAuthLinks(user);
    setStatus('success', 'Account created. Redirecting...');
    setTimeout(() => {
      window.location.assign(resolveAppUrl('profile.html'));
    }, 600);
  } catch (error) {
    console.error('[Signup] error', error);
    clearErrors();
    handleSignupError(error);
  } finally {
    setFormBusy(false);
  }
}

/* ------------------ INIT ------------------ */
async function init() {
  try {
    const { user } = await authInit({
      onSession: (u) => updateAuthLinks(u),
      onNoSession: () => updateAuthLinks(null),
    });

    if (user) {
      setStatus('success', 'You are already signed in. Redirecting...');
      setTimeout(() => {
        window.location.assign(resolveAppUrl('profile.html'));
      }, 500);
      return;
    }

    form.addEventListener('submit', handleSubmit);
  } catch (error) {
    console.error('[Signup] init error', error);
    setStatus('error', 'Unable to initialise sign up.');
  }
}

if (form) {
  init();
}
