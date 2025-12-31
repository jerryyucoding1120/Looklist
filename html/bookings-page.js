/**
 * Bookings Page - vFinal (Review + Message Fix)
 */

import { authInit, signOut } from './auth.js';
import { sp } from './api.js';

const POLL_INTERVAL_MS = 15000; 
let pollTimer = null;
let currentUserId = null;

// Modal State
let currentReviewBookingId = null;
let currentRating = 0;

document.addEventListener('DOMContentLoaded', () => {
  init().catch((err) => console.error('[Bookings] init error', err));
  setupReviewModal(); // Initialize Modal Logic
});

async function init() {
  const { user } = await authInit({ requireAuth: true, redirectTo: 'signin.html' });
  if (!user) return;
  currentUserId = user.id;

  const refreshBtn = document.getElementById('refresh-bookings-btn');
  if (refreshBtn) refreshBtn.addEventListener('click', () => loadBookings(true));

  await loadBookings(true);
  startPolling();
  setupVisibilityHandling();
}

function setupVisibilityHandling() {
  if (typeof document.hidden !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearInterval(pollTimer);
      else { loadBookings(false); pollTimer = setInterval(() => loadBookings(false), POLL_INTERVAL_MS); }
    });
  }
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => loadBookings(false), POLL_INTERVAL_MS);
}

async function fetchBookingsWithListings() {
  const client = await sp();
  
  // Fetching listing details (merchant_id is crucial for messaging)
  const { data, error } = await client
    .from('bookings')
    .select(`
      *,
      listings (
        id,
        name,
        title,
        city,
        postcode,
        price_cents,
        merchant_id
      )
    `)
    .eq('customer_id', currentUserId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function loadBookings(showLoading = true) {
  const listEl = document.querySelector('.booking-list');
  const introEl = document.querySelector('.intro');
  if (!listEl) return;

  try {
    if (showLoading && introEl) introEl.textContent = 'Loading your bookings...';
    
    const bookings = await fetchBookingsWithListings();
    listEl.innerHTML = '';
    
    if (!bookings || bookings.length === 0) {
      listEl.innerHTML = '<div class="empty-state">No bookings found.</div>';
      if (introEl) introEl.textContent = '';
      return;
    }
    
    bookings.forEach(booking => {
      listEl.appendChild(createBookingCard(booking));
    });
    
    if (introEl) introEl.textContent = '';
  } catch (error) {
    console.error('Load Error:', error);
    listEl.innerHTML = '<div class="error-state">Error loading bookings.</div>';
  }
}

function createBookingCard(booking) {
  // --- SAFETY CHECK: Handle if 'listings' is an array or object ---
  let listing = {};
  if (Array.isArray(booking.listings)) {
     listing = booking.listings[0] || {};
  } else if (booking.listings) {
     listing = booking.listings;
  }

  const status = (booking.status || 'pending').toLowerCase();
  
  const title = listing.name || listing.title || 'Service';
  const price = booking.price_cents ? `£${(booking.price_cents / 100).toFixed(2)}` : '£0.00';
  const date = new Date(booking.starts_at || booking.created_at).toLocaleDateString();

  const card = document.createElement('article');
  card.className = 'booking-card';
  
  // Click card to go to details
  card.onclick = (e) => {
    if (e.target.closest('button')) return;
    window.location.href = `booking-details.html?id=${booking.id}`;
  };

  card.innerHTML = `
    <div class="booking-img-container">
      <img src="assets/default-service.png" class="booking-img">
    </div>
    <div class="booking-details">
      <h3 class="booking-title">${title}</h3>
      <div class="booking-meta">
        📅 ${date}<br>
        📍 ${listing.city || 'Location N/A'}<br>
        💰 ${price}
      </div>
      <div class="booking-status">Status: <strong>${status.toUpperCase()}</strong></div>
    </div>
    <div class="card-actions"></div>
  `;

  const actions = card.querySelector('.card-actions');

  // --- 1. MESSAGE BUTTON (FIXED LOGIC) ---
  // We check if merchant_id exists. If yes, we show the button.
  if (listing.merchant_id) {
    const msgBtn = document.createElement('button');
    msgBtn.className = 'btn btn-message'; 
    msgBtn.textContent = 'Message';
    msgBtn.onclick = (e) => {
      e.stopPropagation();
      // Redirects to message thread with the merchant
      window.location.href = `message-thread.html?recipient=${listing.merchant_id}`;
    };
    actions.appendChild(msgBtn);
  } else {
    // Optional: Log to console if missing for debugging
    console.warn(`Booking ${booking.id} missing merchant_id`, listing);
  }

  // --- 2. CANCEL BUTTON ---
  if (['pending', 'accepted'].includes(status)) {
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-cancel';
    cancelBtn.textContent = 'Cancel';
    
    cancelBtn.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm('Are you sure you want to cancel?')) return;
      
      cancelBtn.disabled = true;
      cancelBtn.textContent = '...';
      
      try {
        const client = await sp();
        const { error } = await client.functions.invoke(`cancel-booking/${booking.id}`, {
          method: 'POST',
          body: { reason: "Cancelled by client" }
        });

        if (error) throw error;
        await loadBookings(false);
      } catch (err) {
        alert('Cancel failed: ' + err.message);
        cancelBtn.disabled = false;
        cancelBtn.textContent = 'Cancel';
      }
    };
    actions.appendChild(cancelBtn);
  }

  // --- 3. REVIEW BUTTON ---
  if (status === 'completed') {
    const reviewBtn = document.createElement('button');
    reviewBtn.className = 'btn btn-review';
    reviewBtn.textContent = 'Write Review';
    reviewBtn.onclick = (e) => {
      e.stopPropagation();
      if (window.openReviewModal) {
         window.openReviewModal(booking.id);
      } else {
         console.error('Review modal function missing');
      }
    };
    actions.appendChild(reviewBtn);
  }

  return card;
}

// --- REVIEW MODAL LOGIC ---
function setupReviewModal() {
  const modal = document.getElementById('review-modal');
  const stars = document.querySelectorAll('.star');
  const cancelBtn = document.getElementById('cancel-review-btn');
  const submitBtn = document.getElementById('submit-review-btn');
  const textarea = document.getElementById('review-text');

  if (!modal) return;

  // Star Logic
  stars.forEach(star => {
    star.addEventListener('click', () => {
      currentRating = parseInt(star.dataset.value);
      stars.forEach(s => {
        s.classList.toggle('active', parseInt(s.dataset.value) <= currentRating);
      });
    });
  });

  const closeModal = () => {
    modal.style.display = 'none';
    currentRating = 0;
    currentReviewBookingId = null;
    textarea.value = '';
    stars.forEach(s => s.classList.remove('active'));
    if(submitBtn) {
        submitBtn.textContent = 'Submit Review';
        submitBtn.disabled = false;
    }
  };

  if(cancelBtn) cancelBtn.addEventListener('click', closeModal);

  if(submitBtn) {
      submitBtn.addEventListener('click', async () => {
        if (currentRating === 0) {
          alert("Please select a star rating.");
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';

        try {
          const client = await sp();
          
          const { error } = await client.functions.invoke('submit-review', {
            body: {
              booking_id: currentReviewBookingId,
              rating: currentRating,
              text: textarea.value
            }
          });

          if (error) throw new Error(error.message || "Failed to submit review");

          alert("Review submitted successfully!");
          closeModal();
        } catch (err) {
          alert("Error: " + err.message);
          submitBtn.disabled = false;
          submitBtn.textContent = 'Submit Review';
        }
      });
  }

  window.openReviewModal = (bookingId) => {
    currentReviewBookingId = bookingId;
    modal.style.display = 'flex';
  };
}