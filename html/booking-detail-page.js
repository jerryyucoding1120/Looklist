import { authInit } from './auth.js';
import { sp } from './api.js';

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const { user } = await authInit({ requireAuth: true });
  if (!user) return;

  const params = new URLSearchParams(window.location.search);
  const bookingId = params.get('id');

  if (!bookingId) {
    window.location.href = 'bookings.html';
    return;
  }

  loadBookingDetails(bookingId);
}

async function loadBookingDetails(id) {
  try {
    const client = await sp();
    const { data: booking, error } = await client
      .from('bookings')
      .select('*, listings(*)')
      .eq('id', id)
      .single();

    if (error || !booking) throw error;

    renderDetails(booking);
  } catch (err) {
    const state = document.getElementById('loading-state');
    if(state) state.textContent = "Failed to load booking details.";
  }
}

function renderDetails(booking) {
  const listing = booking.listings || {};
  
  const loading = document.getElementById('loading-state');
  if(loading) loading.style.display = 'none';
  
  const view = document.getElementById('booking-detail-view');
  if(view) view.style.display = 'block';

  // Set Content
  setText('service-name', listing.name || booking.service_name);
  setText('booking-time', new Date(booking.start_time).toLocaleString());
  setText('booking-duration', `${booking.duration_minutes || 60} mins`);
  setText('booking-location', listing.city || 'N/A');
  setText('booking-price', `£${(booking.price_cents / 100).toFixed(2)}`);
  
  // Status Banner Logic
  const banner = document.getElementById('status-banner');
  const status = (booking.status || 'pending').toLowerCase();
  if(banner) {
      banner.textContent = status;
      banner.className = `status-banner status-${status}`;
  }

  // Actions Logic
  const actions = document.getElementById('detail-actions');
  if(actions) {
      actions.innerHTML = ''; // Clear previous
      if (status === 'pending' || status === 'confirmed') {
        const cancelBtn = document.createElement('button');
        cancelBtn.id = 'cancel-action-btn';
        cancelBtn.className = 'btn btn-cancel';
        cancelBtn.style.width = '100%';
        cancelBtn.textContent = 'Cancel Appointment';
        cancelBtn.onclick = () => handleCancel(booking.id);
        actions.appendChild(cancelBtn);
      }
  }
}

// Helper to safely set text
function setText(id, val) {
    const el = document.getElementById(id);
    if(el) el.textContent = val;
}

async function handleCancel(id) {
  if (confirm("Are you sure you want to cancel this appointment? This cannot be undone.")) {
    const btn = document.getElementById('cancel-action-btn');
    if(btn) {
        btn.disabled = true;
        btn.textContent = 'Cancelling...';
    }

    try {
        const client = await sp();
        await client.from('bookings').update({ status: 'cancelled' }).eq('id', id);
        location.reload();
    } catch(err) {
        alert("Error cancelling booking.");
        if(btn) {
            btn.disabled = false;
            btn.textContent = 'Cancel Appointment';
        }
    }
  }
}