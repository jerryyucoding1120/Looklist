import { authInit, resolveAppUrl, signOut, signUpWithEmailPassword } from './auth.js';

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

function getSelectedRole() {
  const selected = Array.from(roleInputs).find((input) => input.checked);
  return selected?.value || 'client';
}

function validate() {
  clearErrors();
  let valid = true;

  const emailValue = emailInput?.value.trim();
  if (!emailValue) {
    setError('email', 'Email is required.');
    valid = false;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
    setError('email', 'Please enter a valid email address.');
    valid = false;
  }

  const passwordValue = passwordInput?.value || '';
  if (passwordValue.length < 8) {
    setError('password', 'Password must be at least 8 characters long.');
    valid = false;
  }

  const confirmValue = confirmInput?.value || '';
  if (confirmValue !== passwordValue) {
    setError('confirm', 'Passwords do not match.');
    valid = false;
  }

  return valid;
}

async function handleSubmit(event) {
  event.preventDefault();
  if (formBusy) return;

  if (!validate()) {
    setStatus('error', 'Please fix the highlighted fields.');
    return;
  }

  const payload = {
    email: emailInput.value.trim().toLowerCase(),
    password: passwordInput.value,
    fullName: nameInput?.value.trim() || undefined,
    role: getSelectedRole(),
    emailRedirectTo: 'signin.html',
  };

  try {
    setFormBusy(true);
    setStatus('info', 'Creating your account...');
    const { user, session } = await signUpWithEmailPassword(payload);
    if (session?.user || user) {
      updateAuthLinks(session?.user || user);
    }

    if (session?.user) {
      setStatus('success', 'Account created. Redirecting to your profile...');
      window.setTimeout(() => {
        window.location.assign(resolveAppUrl('profile.html'));
      }, 600);
    } else {
      setStatus('success', 'Account created. Check your email to confirm your address.');
      form?.reset();
    }
  } catch (error) {
    console.error('[Signup] submit error', error);
    setStatus('error', error.message || 'Failed to create account.');
  } finally {
    setFormBusy(false);
  }
}

async function init() {
  try {
    const { user } = await authInit({
      onSession: (currentUser) => updateAuthLinks(currentUser),
      onNoSession: () => updateAuthLinks(null),
    });

    if (user) {
      setStatus('success', 'You are already signed in. Redirecting...');
      window.setTimeout(() => {
        window.location.assign(resolveAppUrl('profile.html'));
      }, 500);
      return;
    }

    form?.addEventListener('submit', handleSubmit);
  } catch (error) {
    console.error('[Signup] init error', error);
    setStatus('error', error.message || 'Unable to initialise sign up.');
  }
}

if (form) {
  init();
}