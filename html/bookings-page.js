/**
 * Bookings Page - Customer bookings visibility with real-time updates
 * Features: status badges, auto-refresh, cancel action, LLD display, accessibility
 */

import { authInit, signOut } from './auth.js';
import { sp, getCurrentUser } from './api.js';

// Polling configuration
const POLL_INTERVAL_MS = 15000; // 15 seconds
let pollTimer = null;
let isPollingPaused = false;
let currentUserId = null;

document.addEventListener('DOMContentLoaded', () => {
  init().catch((err) => console.error('[Bookings] init error', err));
});

async function init() {
  // Check authentication with redirect to signin if needed
  const urlParams = new URLSearchParams(window.location.search);
  const currentPath = window.location.pathname.split('/').pop() || 'bookings.html';
  
  const { user } = await authInit({ 
    requireAuth: true,
    redirectTo: `signin.html?next=${encodeURIComponent(currentPath)}`
  });
  
  toggleHeaderLinks(user);
  if (!user) return;
  
  currentUserId = user.id;
  
  // Setup manual refresh button
  const refreshBtn = document.getElementById('refresh-bookings-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadBookings(true);
    });
  }
  
  // Initial load
  await loadBookings(true);
  
  // Handle paid=1 query parameter - perform re-fetch after payment redirect
  // This allows webhook time to update booking status
  const isPaid = urlParams.get('paid') === '1';
  if (isPaid) {
    console.log('[Bookings] Detected paid=1, scheduling refresh in 3s...');
    setTimeout(() => {
      loadBookings(true);
    }, 3000);
  }
  
  // Start automatic polling
  startPolling();
  
  // Setup visibility API to pause polling when tab hidden
  setupVisibilityHandling();
}

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

/**
 * Setup visibility API to pause/resume polling when tab hidden/visible
 */
function setupVisibilityHandling() {
  if (typeof document.hidden !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        isPollingPaused = true;
        stopPolling();
      } else {
        isPollingPaused = false;
        loadBookings(false); // Refresh on return
        startPolling();
      }
    });
  }
}

/**
 * Start automatic polling every 15 seconds
 */
function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    if (!isPollingPaused) {
      loadBookings(false);
    }
  }, POLL_INTERVAL_MS);
}

/**
 * Stop automatic polling
 */
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/**
 * Fetch bookings with joined listing details
 */
async function fetchBookingsWithListings() {
  const client = await sp();
  
  // Construct select query - service_name is on bookings table, not listings
  const selectQuery = `
    *,
    listings (
      id,
      name,
      title,
      city,
      postcode,
      lat,
      lng,
      price_cents,
      merchant_id
    )
  `;
  
  // Debug: log the select string to verify correct schema
  console.log('[Bookings] Select query:', selectQuery);
  
  // Fetch bookings for current user with listing details joined
  const { data, error } = await client
    .from('bookings')
    .select(selectQuery)
    .eq('customer_id', currentUserId)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('[Bookings] fetch error:', error);
    throw error;
  }
  
  return data || [];
}

/**
 * Update booking status (e.g., cancel)
 */
async function updateBookingStatus(bookingId, newStatus) {
  const client = await sp();
  
  const { data, error } = await client
    .from('bookings')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', bookingId)
    .eq('customer_id', currentUserId) // Ensure owner only
    .select()
    .single();
  
  if (error) {
    console.error('[Bookings] update error:', error);
    throw error;
  }
  
  return data;
}

/**
 * Load and display bookings
 */
export async function loadBookings(showLoading = true) {
  const listEl = document.querySelector('.booking-list');
  const introEl = document.querySelector('.intro');
  
  if (!listEl) return;
  
  // Set aria-live for accessibility
  if (!listEl.getAttribute('aria-live')) {
    listEl.setAttribute('aria-live', 'polite');
    listEl.setAttribute('aria-atomic', 'false');
  }
  
  try {
    if (showLoading && introEl) {
      introEl.textContent = 'Loading your bookings...';
    }
    
    const bookings = await fetchBookingsWithListings();
    
    listEl.innerHTML = '';
    
    if (!bookings || bookings.length === 0) {
      // Empty state
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No bookings yet. Book your first service to see it here!';
      listEl.appendChild(empty);
      if (introEl) introEl.textContent = '';
      return;
    }
    
    // Render booking cards
    for (const booking of bookings) {
      const card = createBookingCard(booking);
      listEl.appendChild(card);
    }
    
    if (introEl) introEl.textContent = '';
    
  } catch (error) {
    console.error('[Bookings] load error:', error);
    
    // Error state
    listEl.innerHTML = '';
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-state';
    errorDiv.textContent = 'Failed to load bookings. Please try again.';
    listEl.appendChild(errorDiv);
    
    if (introEl) {
      introEl.textContent = 'Error loading bookings.';
    }
  }
}

/**
 * Format date and time
 */
function formatDateTime(iso) {
  if (!iso) return 'N/A';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch (e) {
    return 'Invalid date';
  }
}

/**
 * Format duration in minutes
 */
function formatDuration(minutes) {
  if (!minutes || isNaN(minutes)) return '';
  const mins = parseInt(minutes, 10);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  if (remainMins === 0) return `${hours} hr`;
  return `${hours} hr ${remainMins} min`;
}

/**
 * Format price from cents
 */
function formatPrice(cents) {
  if (!cents || isNaN(cents)) return '£0.00';
  const amount = parseInt(cents, 10) / 100;
  return `£${amount.toFixed(2)}`;
}

/**
 * Get status badge HTML with color coding and icons
 */
function getStatusBadge(status) {
  const statusLower = (status || 'pending').toLowerCase();
  
  const statusConfig = {
    pending: { label: 'Pending', color: 'var(--warning)', icon: '⏳' },
    confirmed: { label: 'Confirmed', color: 'var(--success)', icon: '✓' },
    completed: { label: 'Completed', color: 'var(--success)', icon: '✓' },
    declined: { label: 'Declined', color: '#f44336', icon: '✗' },
    cancelled: { label: 'Cancelled', color: '#9e9e9e', icon: '✗' },
    no_show: { label: 'No Show', color: '#9e9e9e', icon: '✗' },
  };
  
  const config = statusConfig[statusLower] || statusConfig.pending;
  
  return `<span class="status-badge" style="color: ${config.color}; font-weight: 700;">
    <span aria-hidden="true">${config.icon}</span> ${config.label}
  </span>`;
}

/**
 * Create booking card element
 */
function createBookingCard(booking) {
  // Safe fallback when listing join is missing
  const listing = booking.listings || {};
  const title = listing.name || listing.title || booking.service_name || 'Listing';
  const location = listing.city || listing.postcode || 'Location not specified';
  const status = booking.status || 'pending';
  const startTime = booking.start_time || booking.scheduled_at || booking.created_at;
  const duration = booking.duration_minutes || 60;
  
  // Price from booking or listing
  const priceCents = booking.price_cents || listing.price_cents || 0;
  
  // LLD info
  const lldRedeemed = booking.lld_redeemed || 0;
  const lldAwarded = booking.lld_awarded || 0;
  
  const card = document.createElement('article');
  card.className = 'booking-card';
  card.setAttribute('role', 'listitem');
  card.setAttribute('aria-label', `Booking for ${title}`);
  card.setAttribute('data-booking-id', booking.id);
  
  // Left side - booking details
  const left = document.createElement('div');
  left.className = 'booking-details';
  
  const heading = document.createElement('h3');
  heading.className = 'booking-title';
  heading.textContent = title;
  
  const meta = document.createElement('div');
  meta.className = 'booking-meta';
  
  const metaItems = [];
  metaItems.push(`📅 ${formatDateTime(startTime)}`);
  metaItems.push(`⏱️ ${formatDuration(duration)}`);
  metaItems.push(`📍 ${location}`);
  metaItems.push(`💰 ${formatPrice(priceCents)}`);
  
  meta.innerHTML = metaItems.join('<br>');
  
  const statusDiv = document.createElement('div');
  statusDiv.className = 'booking-status';
  statusDiv.innerHTML = `Status: ${getStatusBadge(status)}`;
  
  left.appendChild(heading);
  left.appendChild(meta);
  left.appendChild(statusDiv);
  
  // LLD display if present
  if (lldRedeemed > 0 || lldAwarded > 0) {
    const lldDiv = document.createElement('div');
    lldDiv.className = 'booking-lld';
    lldDiv.style.cssText = 'margin-top: 0.5rem; font-size: 0.9rem; color: var(--accent);';
    
    const lldParts = [];
    if (lldRedeemed > 0) lldParts.push(`🎁 LLD Redeemed: ${lldRedeemed}`);
    if (lldAwarded > 0) lldParts.push(`⭐ LLD Awarded: ${lldAwarded}`);
    
    lldDiv.innerHTML = lldParts.join(' | ');
    left.appendChild(lldDiv);
  }
  
  card.appendChild(left);
  
  // Right side - actions
  const actions = document.createElement('div');
  actions.className = 'card-actions';
  
  // Cancel button (only for pending/confirmed bookings)
  if (status === 'pending' || status === 'confirmed') {
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.setAttribute('aria-label', `Cancel booking for ${title}`);
    cancelBtn.addEventListener('click', () => handleCancelBooking(booking.id, title, card));
    actions.appendChild(cancelBtn);
  }
  
  // Review placeholder (for completed bookings)
  if (status === 'completed') {
    const reviewBtn = document.createElement('button');
    reviewBtn.className = 'btn btn-secondary';
    reviewBtn.textContent = 'Write Review';
    reviewBtn.setAttribute('aria-label', `Write review for ${title}`);
    reviewBtn.addEventListener('click', () => {
      alert('Review functionality coming soon!');
    });
    actions.appendChild(reviewBtn);
  }
  
  card.appendChild(actions);
  
  return card;
}

/**
 * Handle cancel booking action
 */
async function handleCancelBooking(bookingId, title, cardElement) {
  const confirmed = confirm(`Are you sure you want to cancel the booking for "${title}"?`);
  if (!confirmed) return;
  
  try {
    // Disable button during request
    const cancelBtn = cardElement.querySelector('.btn-cancel');
    if (cancelBtn) {
      cancelBtn.disabled = true;
      cancelBtn.textContent = 'Cancelling...';
    }
    
    await updateBookingStatus(bookingId, 'cancelled');
    
    // Refresh bookings list
    await loadBookings(false);
    
    // Announce to screen readers
    const announcement = document.createElement('div');
    announcement.className = 'sr-only';
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.textContent = `Booking for ${title} has been cancelled.`;
    document.body.appendChild(announcement);
    setTimeout(() => announcement.remove(), 3000);
    
  } catch (error) {
    console.error('[Bookings] cancel error:', error);
    alert('Failed to cancel booking. Please try again.');
    
    // Re-enable button
    const cancelBtn = cardElement.querySelector('.btn-cancel');
    if (cancelBtn) {
      cancelBtn.disabled = false;
      cancelBtn.textContent = 'Cancel';
    }
  }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  stopPolling();
});
