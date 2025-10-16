import { authInit, signOut } from './auth.js';
import { listMyBookings } from './api.js';

document.addEventListener('DOMContentLoaded', () => {
  loadBookings().catch((err) => console.error('[Bookings] init', err));
});

function toggleHeaderLinks(user) {
  const links = document.querySelectorAll('[data-auth="signin"]');
  if (!links.length) return;

  links.forEach((el) => {
    if (user) {
      el.textContent = 'Sign Out';
      el.onclick = (event) => {
        event.preventDefault();
        signOut();
      };
      el.setAttribute('href', '#');
    } else {
      el.textContent = 'Sign in';
      el.onclick = null;
      el.setAttribute('href', 'signin.html');
    }
  });
}

export async function loadBookings() {
  const { user } = await authInit({ requireAuth: true });
  toggleHeaderLinks(user);
  if (!user) return;

  const listEl = document.querySelector('.booking-list');
  const introEl = document.querySelector('.intro');
  if (!listEl) return;

  const formatDateTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const createCard = (booking) => {
    const title = booking.service_name || booking.title || `Booking ${booking.id}`;
    const area = booking.location || booking.area || '';
    const status = (booking.status || 'pending').toLowerCase();
    const when = booking.start_time || booking.scheduled_at || booking.created_at;

    const card = document.createElement('section');
    card.className = 'booking-card';
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-label', title);

    const left = document.createElement('div');
    const heading = document.createElement('p');
    heading.className = 'booking-title';
    heading.textContent = title;

    const meta = document.createElement('div');
    meta.className = 'booking-meta';
    const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
    const parts = [formatDateTime(when)];
    if (area) parts.push(area);
    parts.push(`Status: ${statusLabel}`);
    meta.textContent = parts.filter(Boolean).join(' | ');

    left.appendChild(heading);
    left.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const view = document.createElement('a');
    view.href = '#';
    view.className = 'btn';
    view.textContent = 'View';
    const secondary = document.createElement('a');
    secondary.href = '#';
    secondary.className = 'btn';
    secondary.textContent = status === 'pending' ? 'Cancel' : 'Reschedule';

    actions.appendChild(view);
    actions.appendChild(secondary);
    card.appendChild(left);
    card.appendChild(actions);
    return card;
  };

  try {
    if (introEl) introEl.textContent = 'Loading your bookings...';
    const bookings = await listMyBookings();
    listEl.innerHTML = '';

    if (!bookings.length) {
      const empty = document.createElement('div');
      empty.className = 'intro';
      empty.textContent = 'No bookings yet.';
      listEl.appendChild(empty);
      if (introEl) introEl.textContent = '';
      return;
    }

    for (const booking of bookings) {
      listEl.appendChild(createCard(booking));
    }
    if (introEl) introEl.textContent = '';
  } catch (error) {
    console.error('[Bookings] load', error);
    if (introEl) introEl.textContent = 'Failed to load bookings. Please try again.';
  }
}
