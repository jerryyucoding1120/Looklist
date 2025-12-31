/**
 * Merchant Listings Dashboard - Realtime Integration
 * Phase 3 Dev C completion
 */

import spLocal from '../supabase-client.js';
import { subscribeMerchantDashboard, cleanupAllSubscriptions, monitorConnection } from '../realtime.js';

let realtimeCleanup = null;

/**
 * Initialize realtime subscriptions for merchant dashboard
 */
export async function initMerchantListingsRealtime() {
  try {
    // Get current authenticated user
    const { data: { user }, error: authError } = await spLocal.auth.getUser();
    
    if (authError || !user) {
      console.log('[merchant-realtime] No authenticated user, skipping realtime');
      return;
    }

    // Get merchant profile to get merchant_id
    const { data: profile, error: profileError } = await spLocal
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('[merchant-realtime] Failed to get merchant profile:', profileError);
      return;
    }

    const merchantId = profile.id;
    console.log(`[merchant-realtime] Initializing realtime for merchant ${merchantId}`);

    // Subscribe to merchant dashboard updates
    realtimeCleanup = subscribeMerchantDashboard(merchantId, {
      onListingChange: handleListingChange,
      onAvailabilityChange: handleAvailabilityChange,
      onError: (err) => console.error('[merchant-realtime] Subscription error:', err)
    });

    // Monitor connection and refetch on reconnect
    monitorConnection(() => {
      console.log('[merchant-realtime] Connection restored, refetching listings');
      // Trigger your existing loadListings() function
      if (window.loadListings) {
        window.loadListings();
      }
    });

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      if (realtimeCleanup) realtimeCleanup();
      cleanupAllSubscriptions();
    });

    console.log('[merchant-realtime] Realtime subscriptions active');

  } catch (err) {
    console.error('[merchant-realtime] Failed to initialize realtime:', err);
  }
}

/**
 * Handle listing changes from realtime
 */
function handleListingChange(eventType, newRecord, oldRecord) {
  console.log('[merchant-realtime] Listing change:', eventType, newRecord);

  const listingsContainer = document.getElementById('listings-container');
  if (!listingsContainer) return;

  switch (eventType) {
    case 'INSERT':
      // Add new listing to UI
      addListingToUI(newRecord);
      break;
    
    case 'UPDATE':
      // Update existing listing in UI
      updateListingInUI(newRecord);
      break;
    
    case 'DELETE':
      // Remove listing from UI
      removeListingFromUI(oldRecord.id);
      break;
  }
}

/**
 * Handle availability changes from realtime
 */
function handleAvailabilityChange(eventType, newRecord, oldRecord) {
  console.log('[merchant-realtime] Availability change:', eventType, newRecord);
  
  // Update availability count or indicators in your UI
  const listingId = newRecord?.listing_id || oldRecord?.listing_id;
  if (listingId) {
    updateAvailabilityIndicator(listingId);
  }
}

/**
 * Add new listing to UI without page refresh
 */
function addListingToUI(listing) {
  // Find your listings container (adjust selector to match your HTML)
  const container = document.querySelector('#listings-container, .list, ul.list');
  if (!container) return;

  // Create listing element (adjust based on your existing HTML structure)
  const listingEl = document.createElement('li');
  listingEl.id = `listing-${listing.id}`;
  listingEl.innerHTML = `
    <div class="listing-head">
      <strong>${listing.name || 'Untitled'}</strong>
      <span class="muted">${listing.category || ''}</span>
      <span>Active: ${listing.active ? 'Yes' : 'No'}</span>
    </div>
    <button onclick="editListing('${listing.id}')">Edit</button>
    <button onclick="deleteListing('${listing.id}')">Delete</button>
  `;

  // Prepend to top of list
  container.prepend(listingEl);

  // Optional: add a highlight animation
  listingEl.style.backgroundColor = '#2a5f3a';
  setTimeout(() => {
    listingEl.style.transition = 'background-color 1s';
    listingEl.style.backgroundColor = '';
  }, 100);
}

/**
 * Update existing listing in UI
 */
function updateListingInUI(listing) {
  const listingEl = document.getElementById(`listing-${listing.id}`);
  if (!listingEl) {
    // Listing not currently visible, might need to refetch
    return;
  }

  // Update content (adjust based on your structure)
  const nameEl = listingEl.querySelector('strong');
  if (nameEl) nameEl.textContent = listing.name || 'Untitled';

  const activeEl = listingEl.querySelector('.active-status');
  if (activeEl) activeEl.textContent = `Active: ${listing.active ? 'Yes' : 'No'}`;

  // Flash to indicate update
  listingEl.style.backgroundColor = '#3a5f5f';
  setTimeout(() => {
    listingEl.style.transition = 'background-color 1s';
    listingEl.style.backgroundColor = '';
  }, 100);
}

/**
 * Remove listing from UI
 */
function removeListingFromUI(listingId) {
  const listingEl = document.getElementById(`listing-${listingId}`);
  if (listingEl) {
    listingEl.style.transition = 'opacity 0.5s';
    listingEl.style.opacity = '0';
    setTimeout(() => listingEl.remove(), 500);
  }
}

/**
 * Update availability indicator for a listing
 */
function updateAvailabilityIndicator(listingId) {
  // Add logic to show "availability updated" or refresh count
  const listingEl = document.getElementById(`listing-${listingId}`);
  if (listingEl) {
    const indicator = listingEl.querySelector('.availability-indicator');
    if (indicator) {
      indicator.textContent = '● Updated';
      indicator.style.color = '#90caf9';
      setTimeout(() => {
        indicator.textContent = '';
      }, 3000);
    }
  }
}
