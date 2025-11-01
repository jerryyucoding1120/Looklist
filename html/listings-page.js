/**
 * Listings Page - Customer-facing page to browse all listings with photos
 * Dynamically syncs and displays photos uploaded by merchants
 */

import { getAuthClients } from './auth.js';
import { listListingPhotos } from './storage.js';

const listingsContainer = document.getElementById('listingsContainer');

// Store photo carousel states
const carouselStates = new Map();

/**
 * Escape HTML to prevent XSS
 */
function escapeHTML(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Format price for display
 */
function formatPrice(value) {
  const amount = Number(value);
  if (Number.isNaN(amount)) return 'N/A';
  return `£${amount.toFixed(2)}`;
}

/**
 * Capitalize first letter
 */
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Render the photo carousel for a listing
 */
function renderPhotoCarousel(listingId, photos) {
  if (!photos || photos.length === 0) {
    return `
      <div class="listing-photo-placeholder">
        <span>No photos available</span>
      </div>
    `;
  }

  const hasMultiplePhotos = photos.length > 1;
  
  return `
    <div class="listing-photos-container" data-listing-id="${escapeHTML(listingId)}">
      ${photos.map((photo, index) => `
        <img 
          class="listing-photo" 
          src="${escapeHTML(photo.url)}" 
          alt="Listing photo ${index + 1} of ${photos.length}"
          loading="lazy"
          onerror="this.style.display='none'; this.nextElementSibling?.classList.remove('sr-only');"
        >
        <div class="listing-photo-placeholder sr-only">
          <span>Photo failed to load</span>
        </div>
      `).join('')}
    </div>
    ${hasMultiplePhotos ? `
      <button class="photo-nav photo-nav-prev" data-listing-id="${escapeHTML(listingId)}" aria-label="Previous photo">
        &#10094;
      </button>
      <button class="photo-nav photo-nav-next" data-listing-id="${escapeHTML(listingId)}" aria-label="Next photo">
        &#10095;
      </button>
      <div class="photo-counter" aria-live="polite">
        <span data-current="1">1</span> / <span>${photos.length}</span>
      </div>
    ` : ''}
  `;
}

/**
 * Render a single listing card
 */
function renderListingCard(listing, photos) {
  const rating = listing.rating ?? 'N/A';
  const city = listing.city || 'Location not specified';
  const price = listing.price_from ? formatPrice(listing.price_from) : 'Price on request';
  const description = listing.description || 'No description available.';
  const truncatedDesc = description.length > 150 
    ? description.substring(0, 150) + '...' 
    : description;
  const styles = Array.isArray(listing.styles) && listing.styles.length > 0
    ? listing.styles.slice(0, 3).join(', ')
    : '';

  return `
    <article class="listing-card" data-listing-id="${escapeHTML(listing.id)}" role="listitem">
      <div class="listing-photos">
        ${renderPhotoCarousel(listing.id, photos)}
      </div>
      <div class="listing-info">
        <h2 class="listing-title">${escapeHTML(listing.name)}</h2>
        <div class="listing-meta">
          <span class="listing-meta-item">
            <span aria-label="Category">${capitalize(escapeHTML(listing.category))}</span>
          </span>
          <span class="listing-meta-item">
            <span aria-label="Location">${escapeHTML(city)}</span>
          </span>
          <span class="listing-meta-item">
            <span aria-label="Rating">⭐ ${escapeHTML(rating)}</span>
          </span>
        </div>
        ${styles ? `<div class="listing-meta" style="margin-top: -0.5rem;">
          <span class="listing-meta-item">
            <span style="opacity: 0.7;">Styles: ${escapeHTML(styles)}</span>
          </span>
        </div>` : ''}
        <p class="listing-description">${escapeHTML(truncatedDesc)}</p>
        <div class="listing-actions">
          <a href="listing.html?id=${encodeURIComponent(listing.id)}" class="btn" aria-label="View details and book ${escapeHTML(listing.name)}">
            View Details
          </a>
        </div>
      </div>
    </article>
  `;
}

/**
 * Load photos for a listing with error handling
 */
async function loadListingPhotos(listingId) {
  try {
    const photos = await listListingPhotos(listingId);
    return photos || [];
  } catch (error) {
    console.error(`[Listings] Error loading photos for listing ${listingId}:`, error);
    return [];
  }
}

/**
 * Load and render all listings
 */
async function loadListings() {
  if (!listingsContainer) {
    console.error('[Listings] Container element not found');
    return;
  }

  try {
    listingsContainer.innerHTML = '<div class="loading">Loading listings...</div>';

    // Get Supabase client
    const { spLocal } = await getAuthClients();
    
    // Fetch all active listings
    const { data: listings, error } = await spLocal
      .from('listings')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    if (!listings || listings.length === 0) {
      listingsContainer.innerHTML = '<div class="empty-state">No listings available at the moment. Check back soon!</div>';
      return;
    }

    // Load photos for all listings in parallel with controlled concurrency
    // Process in batches to avoid overwhelming the storage API
    const batchSize = 5;
    const listingsWithPhotos = [];
    
    for (let i = 0; i < listings.length; i += batchSize) {
      const batch = listings.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (listing) => {
          const photos = await loadListingPhotos(listing.id);
          return { listing, photos };
        })
      );
      listingsWithPhotos.push(...batchResults);
    }

    // Render all listings
    listingsContainer.innerHTML = listingsWithPhotos
      .map(({ listing, photos }) => renderListingCard(listing, photos))
      .join('');

    // Initialize carousel states
    listingsWithPhotos.forEach(({ listing, photos }) => {
      if (photos && photos.length > 1) {
        carouselStates.set(listing.id, {
          currentIndex: 0,
          totalPhotos: photos.length
        });
      }
    });

    // Set up event handlers for photo navigation
    setupPhotoNavigation();

  } catch (error) {
    console.error('[Listings] Error loading listings:', error);
    listingsContainer.innerHTML = `
      <div class="error-state">
        <p>Unable to load listings. Please try again later.</p>
        <p style="font-size: 0.9rem; opacity: 0.7;">${escapeHTML(error.message || 'Unknown error')}</p>
      </div>
    `;
  }
}

/**
 * Setup photo navigation handlers
 */
function setupPhotoNavigation() {
  // Handle photo navigation clicks
  document.addEventListener('click', (e) => {
    const button = e.target.closest('.photo-nav');
    if (!button) return;

    const listingId = button.getAttribute('data-listing-id');
    const state = carouselStates.get(listingId);
    if (!state) return;

    const isPrev = button.classList.contains('photo-nav-prev');
    const isNext = button.classList.contains('photo-nav-next');

    if (isPrev) {
      state.currentIndex = (state.currentIndex - 1 + state.totalPhotos) % state.totalPhotos;
    } else if (isNext) {
      state.currentIndex = (state.currentIndex + 1) % state.totalPhotos;
    }

    updateCarousel(listingId, state);
  });
}

/**
 * Update carousel position and counter
 */
function updateCarousel(listingId, state) {
  const card = document.querySelector(`[data-listing-id="${listingId}"]`);
  if (!card) return;

  const container = card.querySelector('.listing-photos-container');
  const counter = card.querySelector('.photo-counter [data-current]');

  if (container) {
    container.style.transform = `translateX(-${state.currentIndex * 100}%)`;
  }

  if (counter) {
    counter.textContent = state.currentIndex + 1;
  }
}

/**
 * Initialize the page
 */
async function init() {
  console.log('[Listings] Initializing listings page...');
  await loadListings();
  console.log('[Listings] Listings page initialized successfully');
}

// Initialize on page load
init().catch((error) => {
  console.error('[Listings] Initialization error:', error);
  if (listingsContainer) {
    listingsContainer.innerHTML = `
      <div class="error-state">
        <p>Failed to initialize the page. Please refresh and try again.</p>
      </div>
    `;
  }
});
