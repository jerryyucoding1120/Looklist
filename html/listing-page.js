import { getAuthClients } from './auth.js';
import { listListingPhotos } from './storage.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Public anonymous client for fetching public data (listings, availability)
// This ensures RLS policies correctly allow public access to active listings
const SUPABASE_URL = 'https://rgzdgeczrncuxufkyuxf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnemRnZWN6cm5jdXh1Zmt5dXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxOTI3MTAsImV4cCI6MjA3MTc2ODcxMH0.dYt-MxnGZZqQ-pUilyMzcqSJjvlCNSvUCYpVJ6TT7dU';
const publicClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const searchParams = new URLSearchParams(window.location.search);
const listingId = searchParams.get('id');

const infoEl = document.getElementById('listingInfo');
const photoGalleryEl = document.getElementById('photoGallery');
const slotsEl = document.getElementById('slots');
const bookButton = document.getElementById('bookBtn');
const lldInput = document.getElementById('lld');
const lldValue = document.getElementById('lldValue');

const clientsPromise = getAuthClients();
let selectedSlotId = null;
let galleryPhotos = [];
let currentPhotoIndex = 0;

function formatMoney(value) {
  const amount = Number(value);
  if (Number.isNaN(amount)) return 'N/A';
  return `GBP ${amount.toFixed(2)}`;
}

function escapeHTML(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function capitalise(value) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function renderListing(listing) {
  if (!infoEl) return;
  if (!listing) {
    infoEl.textContent = 'Listing not found.';
    return;
  }
  const rating = listing.rating ?? 'N/A';
  const city = listing.city || '';
  const priceFrom = listing.price_from ?? 'N/A';
  infoEl.innerHTML = `<article class="card">
    <div class="card__top">
      <h3>${escapeHTML(listing.name)}</h3>
      <div>Rating ${rating}</div>
    </div>
    <div class="card__meta">${capitalise(listing.category)} - ${escapeHTML(city)} - from ${formatMoney(priceFrom)}</div>
  </article>`;
}

async function renderPhotoGallery(listingId) {
  // Always initialize/reset gallery state at the start
  galleryPhotos = [];
  
  if (!photoGalleryEl) {
    return;
  }
  
  photoGalleryEl.innerHTML = '<div class="photo-gallery-loading">Loading photos...</div>';
  
  try {
    const photos = await listListingPhotos(listingId);
    galleryPhotos = photos;
    
    if (!photos || photos.length === 0) {
      photoGalleryEl.innerHTML = '<div class="photo-gallery-empty">No photos available for this listing.</div>';
      return;
    }
    
    const galleryHTML = `
      <h2 style="font-size: 1.4rem; margin-bottom: 0.5rem;">Photos</h2>
      <div class="photo-gallery-grid" role="list">
        ${photos.map((photo, index) => `
          <div class="photo-gallery-item" role="listitem" data-photo-index="${index}">
            <img src="${escapeHTML(photo.url)}" alt="Listing photo ${index + 1} of ${photos.length}" loading="lazy">
            <button type="button" aria-label="View photo ${index + 1} of ${photos.length} in full screen"></button>
          </div>
        `).join('')}
      </div>
    `;
    
    photoGalleryEl.innerHTML = galleryHTML;
    
    // Add click handlers for lightbox with better error handling
    photoGalleryEl.querySelectorAll('.photo-gallery-item').forEach((item) => {
      const button = item.querySelector('button');
      const img = item.querySelector('img');
      
      // Handle image load errors
      img.addEventListener('error', () => {
        item.classList.add('photo-gallery-error');
        console.error('[Listing] Failed to load image:', img.src);
      });
      
      // Handle successful image load
      img.addEventListener('load', () => {
        item.classList.remove('photo-gallery-error');
      });
      
      if (button) {
        button.addEventListener('click', () => {
          const index = parseInt(item.getAttribute('data-photo-index'), 10);
          openLightbox(index);
        });
      }
    });
  } catch (error) {
    console.error('[Listing] Error loading photos:', error);
    photoGalleryEl.innerHTML = '<div class="photo-gallery-empty">Unable to load photos.</div>';
    galleryPhotos = []; // Reset on error
  }
}

function openLightbox(index) {
  if (!galleryPhotos || galleryPhotos.length === 0) return;
  
  currentPhotoIndex = index;
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxCounter = lightbox?.querySelector('.lightbox-counter');
  
  if (lightbox && lightboxImg) {
    lightboxImg.src = galleryPhotos[currentPhotoIndex].url;
    lightboxImg.alt = `Listing photo ${currentPhotoIndex + 1} of ${galleryPhotos.length}`;
    
    // Update counter
    if (lightboxCounter) {
      lightboxCounter.textContent = `${currentPhotoIndex + 1} / ${galleryPhotos.length}`;
    }
    
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // Focus the close button for accessibility after a brief delay to ensure the lightbox is visible
    const closeBtn = lightbox.querySelector('.lightbox-close');
    if (closeBtn) {
      requestAnimationFrame(() => {
        closeBtn.focus();
      });
    }
  }
}

function closeLightbox() {
  const lightbox = document.getElementById('lightbox');
  if (lightbox) {
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function navigateLightbox(direction) {
  if (!galleryPhotos || galleryPhotos.length === 0) return;
  
  currentPhotoIndex += direction;
  
  if (currentPhotoIndex < 0) {
    currentPhotoIndex = galleryPhotos.length - 1;
  } else if (currentPhotoIndex >= galleryPhotos.length) {
    currentPhotoIndex = 0;
  }
  
  const lightboxImg = document.getElementById('lightbox-img');
  const lightbox = document.getElementById('lightbox');
  const lightboxCounter = lightbox?.querySelector('.lightbox-counter');
  
  if (lightboxImg) {
    lightboxImg.src = galleryPhotos[currentPhotoIndex].url;
    lightboxImg.alt = `Listing photo ${currentPhotoIndex + 1} of ${galleryPhotos.length}`;
  }
  
  // Update counter
  if (lightboxCounter) {
    lightboxCounter.textContent = `${currentPhotoIndex + 1} / ${galleryPhotos.length}`;
  }
}

function setupLightbox() {
  const lightbox = document.getElementById('lightbox');
  const closeBtn = lightbox?.querySelector('.lightbox-close');
  const prevBtn = lightbox?.querySelector('.lightbox-prev');
  const nextBtn = lightbox?.querySelector('.lightbox-next');
  
  if (closeBtn) {
    closeBtn.addEventListener('click', closeLightbox);
  }
  
  if (prevBtn) {
    prevBtn.addEventListener('click', () => navigateLightbox(-1));
  }
  
  if (nextBtn) {
    nextBtn.addEventListener('click', () => navigateLightbox(1));
  }
  
  // Close on background click
  if (lightbox) {
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) {
        closeLightbox();
      }
    });
  }
  
  // Keyboard navigation handler
  const handleKeydown = (e) => {
    const lightboxActive = lightbox?.classList.contains('active');
    if (!lightboxActive) return;
    
    if (e.key === 'Escape') {
      closeLightbox();
    } else if (e.key === 'ArrowLeft') {
      navigateLightbox(-1);
    } else if (e.key === 'ArrowRight') {
      navigateLightbox(1);
    }
  };
  
  // Add keyboard listener only once by checking for existing marker
  if (!document.body.hasAttribute('data-lightbox-keyboard-listener')) {
    document.addEventListener('keydown', handleKeydown);
    document.body.setAttribute('data-lightbox-keyboard-listener', 'true');
  }
}

function renderSlots(slots) {
  if (!slotsEl) return;
  if (!slots || !slots.length) {
    slotsEl.textContent = 'No available times yet.';
    return;
  }
  slotsEl.innerHTML = slots
    .map((slot) => {
      const label = slot.label ? ` - ${escapeHTML(slot.label)}` : '';
      const price = formatMoney(slot.price);
      return `<label class="slot">
        <input type="radio" name="slot" value="${slot.id}" data-price="${slot.price}">
        ${slot.date} ${slot.start_time} - ${slot.end_time} - ${price}${label}
      </label>`;
    })
    .join('');
  slotsEl.addEventListener('change', (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    selectedSlotId = event.target.value;
    if (bookButton) bookButton.disabled = !selectedSlotId;
  });
}

function setupLldField() {
  if (!lldInput || !lldValue) return;
  const update = () => {
    const redeemed = Math.max(0, parseInt(lldInput.value || '0', 10));
    lldValue.textContent = formatMoney(redeemed * 0.01);
  };
  lldInput.addEventListener('input', update);
  update();
}

async function getAuthToken() {
  const { spLocal, spSession } = await clientsPromise;
  const [local, session] = await Promise.all([
    spLocal.auth.getSession(),
    spSession.auth.getSession(),
  ]);
  return local.data.session?.access_token || session.data.session?.access_token || null;
}

async function handleBooking(listing) {
  if (!selectedSlotId) return;
  const token = await getAuthToken();
  if (!token) {
    alert('Please sign in first.');
    window.location.href = `signin.html?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    return;
  }

  const slotInput = document.querySelector('input[name="slot"]:checked');
  const slotPrice = Number(slotInput?.dataset?.price || 0);
  const lldSelected = Math.max(0, parseInt(lldInput?.value || '0', 10));
  const maxRedeemable = Math.min(lldSelected, Math.floor(slotPrice * 100));

  try {
    const response = await fetch('https://rgzdgeczrncuxufkyuxf.supabase.co/functions/v1/create-checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        listing_id: listing.id,
        availability_id: selectedSlotId,
        lld_to_redeem: maxRedeemable,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Failed to start checkout.');
    if (!body.url) throw new Error('No checkout URL returned.');
    window.location.href = body.url;
  } catch (error) {
    alert(error?.message || 'Unable to start checkout.');
  }
}

async function loadData() {
  if (!listingId) {
    if (infoEl) infoEl.textContent = 'Listing ID missing.';
    if (bookButton) bookButton.disabled = true;
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  const [listingResult, availabilityResult] = await Promise.all([
    publicClient.from('listings').select('*').eq('id', listingId).single(),
    publicClient
      .from('availability')
      .select('*')
      .eq('listing_id', listingId)
      .gte('date', today)
      .lte('date', in14)
      .order('date'),
  ]);

  if (listingResult.error) {
    if (infoEl) infoEl.textContent = listingResult.error.message;
    return;
  }
  const listing = listingResult.data;
  renderListing(listing);
  
  // Load photos for the listing
  await renderPhotoGallery(listingId);

  if (availabilityResult.error) {
    if (slotsEl) slotsEl.textContent = availabilityResult.error.message;
  } else {
    renderSlots(availabilityResult.data);
  }

  if (bookButton) {
    bookButton.addEventListener('click', () => handleBooking(listing));
    bookButton.disabled = true;
  }
}

async function init() {
  setupLldField();
  setupLightbox();
  await loadData();
}

init().catch((error) => {
  console.error('[Listing] init', error);
  if (infoEl) infoEl.textContent = error?.message || 'Failed to load listing.';
});
