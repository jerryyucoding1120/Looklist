/**
 * Listings Page - Customer-facing page to browse all listings with photos
 * Dynamically syncs and displays photos uploaded by merchants
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Public anonymous client for fetching public data (listings, photos)
// This ensures RLS policies correctly allow public access to active listings
const SUPABASE_URL = 'https://rgzdgeczrncuxufkyuxf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnemRnZWN6cm5jdXh1Zmt5dXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxOTI3MTAsImV4cCI6MjA3MTc2ODcxMH0.dYt-MxnGZZqQ-pUilyMzcqSJjvlCNSvUCYpVJ6TT7dU';
const publicClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// Correct bucket name for listing photos
const LISTING_IMAGES_BUCKET = 'listing-photos';

const listingsContainer = document.getElementById('listingsContainer');

// Store photo carousel states
const carouselStates = new Map();

// Intersection Observer for lazy loading
let intersectionObserver = null;

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
 * Setup Intersection Observer for lazy loading images
 */
function setupIntersectionObserver() {
  if ('IntersectionObserver' in window) {
    intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
            intersectionObserver.unobserve(img);
          }
        }
      });
    }, {
      rootMargin: '50px 0px',
      threshold: 0.01
    });
  }
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
      ${photos.map((photo, index) => {
        // First image loads immediately, rest are lazy-loaded
        const isFirst = index === 0;
        return `
          <img 
            class="listing-photo" 
            ${isFirst ? `src="${escapeHTML(photo.url)}"` : `data-src="${escapeHTML(photo.url)}"`}
            alt="Listing photo ${index + 1} of ${photos.length}"
            ${!isFirst ? 'loading="lazy"' : ''}
            data-photo-index="${index}"
          >
          <div class="listing-photo-placeholder sr-only" role="alert" aria-live="polite">
            <span>Photo failed to load</span>
          </div>
        `;
      }).join('')}
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
    const { data, error } = await publicClient.storage
      .from(LISTING_IMAGES_BUCKET)
      .list(listingId, { 
        limit: 100, 
        offset: 0, 
        sortBy: { column: 'created_at', order: 'asc' } 
      });
    
    if (error) {
      console.error(`[Listings] Error listing photos for listing ${listingId}:`, error);
      return [];
    }
    
    // Filter out any non-image files and generate public URLs
    const photos = (data || [])
      .filter(f => f.name && /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name))
      .map((f) => {
        const path = `${listingId}/${f.name}`;
        const { data: urlData } = publicClient.storage.from(LISTING_IMAGES_BUCKET).getPublicUrl(path);
        return {
          name: f.name,
          path,
          url: urlData.publicUrl,
          created_at: f.created_at
        };
      });
    
    return photos;
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
    
    // Fetch all active listings using publicClient
    const { data: listings, error } = await publicClient
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
    
    // Setup lazy loading for images with data-src
    if (intersectionObserver) {
      document.querySelectorAll('img[data-src]').forEach(img => {
        intersectionObserver.observe(img);
      });
    }

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
  
  // Centralized image error handling
  document.addEventListener('error', (e) => {
    if (e.target.tagName === 'IMG' && e.target.classList.contains('listing-photo')) {
      e.target.style.display = 'none';
      const placeholder = e.target.nextElementSibling;
      if (placeholder && placeholder.classList.contains('listing-photo-placeholder')) {
        placeholder.classList.remove('sr-only');
      }
    }
  }, true);
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
    
    // Load next image if it has data-src and intersection observer is available
    const images = container.querySelectorAll('.listing-photo');
    const currentImg = images[state.currentIndex];
    if (currentImg && currentImg.dataset.src) {
      if (intersectionObserver) {
        currentImg.src = currentImg.dataset.src;
        currentImg.removeAttribute('data-src');
        intersectionObserver.unobserve(currentImg);
      } else {
        // Fallback if no intersection observer
        currentImg.src = currentImg.dataset.src;
        currentImg.removeAttribute('data-src');
      }
    }
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
  setupIntersectionObserver();
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
