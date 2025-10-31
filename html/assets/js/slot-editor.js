// slot-editor.js
// Frontend logic for generating and managing time slots
import { sb, __SUPABASE_URL } from './supabase-client.js';

/**
 * Fetches merchant's listings to populate the listing dropdown
 */
export async function fetchMerchantListings(userId) {
  const { data, error } = await sb
    .from('listings')
    .select('id, name, category')
    .eq('owner', userId)
    .eq('active', true)
    .order('name');

  if (error) {
    console.error('Error fetching merchant listings:', error);
    throw error;
  }

  return data || [];
}

/**
 * Builds time slots based on user input
 * @param {Object} params - Configuration object
 * @param {string} params.listingId - The listing ID
 * @param {string} params.startDate - Start date (YYYY-MM-DD)
 * @param {string} params.endDate - End date (YYYY-MM-DD)
 * @param {string} params.startTime - Daily start time (HH:mm)
 * @param {string} params.endTime - Daily end time (HH:mm)
 * @param {number} params.duration - Duration in minutes
 * @param {number} params.price - Price per slot
 * @param {number} params.capacity - Capacity per slot
 * @param {string[]} params.daysOfWeek - Array of day names (e.g., ['monday', 'tuesday'])
 * @returns {Array} Array of slot objects
 */
export function buildTimeSlots(params) {
  const {
    listingId,
    startDate,
    endDate,
    startTime,
    endTime,
    duration,
    price,
    capacity,
    daysOfWeek
  } = params;

  const slots = [];
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  
  // Day name mapping (Sunday = 0, Monday = 1, etc.)
  const dayNameToIndex = {
    'sunday': 0,
    'monday': 1,
    'tuesday': 2,
    'wednesday': 3,
    'thursday': 4,
    'friday': 5,
    'saturday': 6
  };

  const allowedDayIndices = daysOfWeek.map(day => dayNameToIndex[day.toLowerCase()]);

  // Iterate through each date in the range
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    
    // Skip if this day of week is not selected
    if (!allowedDayIndices.includes(dayOfWeek)) {
      continue;
    }

    // Generate slots for this day
    const dateStr = d.toISOString().split('T')[0];
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    // Convert to minutes since midnight
    let currentMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    while (currentMinutes + duration <= endMinutes) {
      const slotStartHour = Math.floor(currentMinutes / 60);
      const slotStartMin = currentMinutes % 60;
      const slotEndMinutes = currentMinutes + duration;
      const slotEndHour = Math.floor(slotEndMinutes / 60);
      const slotEndMin = slotEndMinutes % 60;

      const startsAt = `${dateStr}T${String(slotStartHour).padStart(2, '0')}:${String(slotStartMin).padStart(2, '0')}:00`;
      const endsAt = `${dateStr}T${String(slotEndHour).padStart(2, '0')}:${String(slotEndMin).padStart(2, '0')}:00`;

      slots.push({
        listing_id: listingId,
        starts_at: startsAt,
        ends_at: endsAt,
        price: price || null,
        capacity: capacity || 1,
        status: 'open'
      });

      currentMinutes += duration;
    }
  }

  return slots;
}

/**
 * Sends slots to the Supabase Edge Function for insertion
 * @param {string} listingId - The listing ID
 * @param {Array} slots - Array of slot objects
 * @returns {Promise} Result from the edge function
 */
export async function upsertSlots(listingId, slots) {
  // Get the current session token
  const { data: { session }, error: sessionError } = await sb.auth.getSession();
  
  if (sessionError || !session) {
    throw new Error('Not authenticated');
  }

  const edgeFunctionUrl = `${__SUPABASE_URL}/functions/v1/upsert-slots`;

  const response = await fetch(edgeFunctionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({
      listing_id: listingId,
      slots: slots
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}: ${response.statusText}` }));
    throw new Error(errorData.error || errorData.details || `HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Initializes the slot editor UI
 * @param {Object} user - The authenticated user object
 * @param {HTMLElement} container - The container element for the slot editor
 */
export async function initializeSlotEditor(user, container) {
  if (!user || !container) return;

  try {
    // Fetch merchant's listings
    const listings = await fetchMerchantListings(user.id);
    
    if (!listings.length) {
      container.innerHTML = '<p class="muted">No active listings found. Please create a listing first.</p>';
      return;
    }

    // Populate listing dropdown
    const listingSelect = container.querySelector('#slot-listing-select');
    if (listingSelect) {
      listingSelect.innerHTML = '<option value="">Select a listing...</option>' +
        listings.map(l => `<option value="${escapeHtml(l.id)}">${escapeHtml(l.name)} (${escapeHtml(l.category)})</option>`).join('');
    }

    // Set up form submission
    const form = container.querySelector('#generate-slots-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleGenerateSlots(form, container);
      });
    }

  } catch (error) {
    console.error('Error initializing slot editor:', error);
    container.innerHTML = `<p style="color:#f44336;">Error: ${escapeHtml(error.message)}</p>`;
  }
}

/**
 * Handles the form submission for generating slots
 */
async function handleGenerateSlots(form, container) {
  const formData = new FormData(form);
  const listingId = formData.get('listing_id');
  const startDate = formData.get('start_date');
  const endDate = formData.get('end_date');
  const startTime = formData.get('start_time');
  const endTime = formData.get('end_time');
  const duration = Number(formData.get('duration'));
  const priceValue = formData.get('price');
  const price = priceValue && priceValue !== '' ? parseFloat(priceValue) : null;
  const capacityValue = formData.get('capacity');
  const capacity = capacityValue && capacityValue !== '' ? Number(capacityValue) : 1;

  // Get selected days of week
  const daysOfWeek = [];
  ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].forEach(day => {
    if (formData.get(day) === 'on') {
      daysOfWeek.push(day);
    }
  });

  // Validation
  if (!listingId) {
    alert('Please select a listing');
    return;
  }

  if (!startDate || !endDate || !startTime || !endTime) {
    alert('Please fill in all required fields');
    return;
  }

  if (isNaN(duration) || duration <= 0) {
    alert('Duration must be a positive number');
    return;
  }

  if (price !== null && (isNaN(price) || price < 0)) {
    alert('Price must be a non-negative number');
    return;
  }

  if (isNaN(capacity) || capacity < 1) {
    alert('Capacity must be at least 1');
    return;
  }

  if (new Date(startDate) > new Date(endDate)) {
    alert('Start date must be before end date');
    return;
  }

  if (startTime >= endTime) {
    alert('Start time must be before end time');
    return;
  }

  if (daysOfWeek.length === 0) {
    alert('Please select at least one day of the week');
    return;
  }

  const statusDiv = container.querySelector('#slot-generation-status');
  const submitBtn = form.querySelector('button[type="submit"]');

  try {
    if (submitBtn) submitBtn.disabled = true;
    if (statusDiv) statusDiv.textContent = 'Generating slots...';

    // Build slots
    const slots = buildTimeSlots({
      listingId,
      startDate,
      endDate,
      startTime,
      endTime,
      duration,
      price,
      capacity,
      daysOfWeek
    });

    if (slots.length === 0) {
      if (statusDiv) statusDiv.textContent = 'No slots generated. Check your parameters.';
      return;
    }

    if (statusDiv) statusDiv.textContent = `Generated ${slots.length} slots. Saving...`;

    // Send to edge function
    const result = await upsertSlots(listingId, slots);

    if (result.success) {
      const message = `Success! Inserted ${result.inserted} new slots${result.skipped > 0 ? `, skipped ${result.skipped} duplicates` : ''}`;
      if (statusDiv) {
        statusDiv.textContent = message;
        statusDiv.style.color = '#a5d6a7';
      }
      
      // Clear form after success
      setTimeout(() => {
        if (statusDiv) {
          statusDiv.textContent = '';
          statusDiv.style.color = '';
        }
      }, 5000);
    } else {
      throw new Error(result.error || 'Failed to save slots');
    }

  } catch (error) {
    console.error('Error generating slots:', error);
    if (statusDiv) {
      statusDiv.textContent = `Error: ${error.message}`;
      statusDiv.style.color = '#ef9a9a';
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[m]));
}
