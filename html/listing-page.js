// Use unified Supabase client to ensure consistent auth state across all pages
import { sb } from './supabase-client.js';
import { getAuthClients } from './auth.js';

// Correct bucket name for listing photos
const LISTING_IMAGES_BUCKET = 'listing-photos';

const searchParams = new URLSearchParams(window.location.search);
const listingId = searchParams.get('id');

const infoEl = document.getElementById('listingInfo');
const photoGalleryEl = document.getElementById('photoGallery');
const slotsEl = document.getElementById('slots');
const bookButton = document.getElementById('bookBtn');
const messageButton = document.getElementById('messageBtn');
const lldInput = document.getElementById('lld');
const lldValue = document.getElementById('lldValue');

const clientsPromise = getAuthClients();
let selectedSlot = null;
let userIsAuthenticated = false;
let currentUserId = null;

// Listen for auth changes
sb.auth.onAuthStateChange((event, session) => {
  userIsAuthenticated = !!session;
  currentUserId = session?.user?.id || null;
  updateBookButtonState();
});

// Initial auth check
clientsPromise.then(async ({ user }) => {
  if (!user) {
    const { data } = await sb.auth.getSession();
    userIsAuthenticated = !!data.session;
    currentUserId = data.session?.user?.id || null;
  } else {
    userIsAuthenticated = true;
    currentUserId = user.id;
  }
  updateBookButtonState();
});

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
  galleryPhotos = [];
  if (!photoGalleryEl) return;

  photoGalleryEl.innerHTML = '<div class="photo-gallery-loading">Loading photos...</div>';

  try {
    const { data, error } = await sb.storage
      .from(LISTING_IMAGES_BUCKET)
      .list(listingId, {
        limit: 100,
        offset: 0,
        sortBy: { column: 'created_at', order: 'asc' }
      });

    if (error || !data || data.length === 0) {
      photoGalleryEl.innerHTML = '<div class="photo-gallery-empty">No photos available.</div>';
      return;
    }

    const photos = data
      .filter(f => f.name && /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name))
      .map((f) => {
        const path = `${listingId}/${f.name}`;
        const { data: urlData } = sb.storage.from(LISTING_IMAGES_BUCKET).getPublicUrl(path);
        return { name: f.name, path, url: urlData.publicUrl };
      });

    galleryPhotos = photos;

    if (photos.length === 0) {
      photoGalleryEl.innerHTML = '<div class="photo-gallery-empty">No photos available.</div>';
      return;
    }

    const galleryHTML = `
      <h2 style="font-size: 1.4rem; margin-bottom: 0.5rem;">Photos</h2>
      <div class="photo-gallery-grid" role="list">
        ${photos.map((photo, index) => `
          <div class="photo-gallery-item" role="listitem" data-photo-index="${index}">
            <img src="${escapeHTML(photo.url)}" alt="Listing photo ${index + 1}" loading="lazy">
            <button type="button" aria-label="View photo"></button>
          </div>
        `).join('')}
      </div>
    `;

    photoGalleryEl.innerHTML = galleryHTML;

    photoGalleryEl.querySelectorAll('.photo-gallery-item').forEach((item) => {
      const button = item.querySelector('button');
      if (button) {
        button.addEventListener('click', () => {
          const index = parseInt(item.getAttribute('data-photo-index'), 10);
          openLightbox(index);
        });
      }
    });
  } catch (error) {
    console.error('Error loading photos:', error);
    photoGalleryEl.innerHTML = '<div class="photo-gallery-empty">Unable to load photos.</div>';
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
    if (lightboxCounter) lightboxCounter.textContent = `${currentPhotoIndex + 1} / ${galleryPhotos.length}`;
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
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
  if (!galleryPhotos.length) return;
  currentPhotoIndex += direction;
  if (currentPhotoIndex < 0) currentPhotoIndex = galleryPhotos.length - 1;
  else if (currentPhotoIndex >= galleryPhotos.length) currentPhotoIndex = 0;

  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxCounter = document.querySelector('.lightbox-counter');
  if (lightboxImg) lightboxImg.src = galleryPhotos[currentPhotoIndex].url;
  if (lightboxCounter) lightboxCounter.textContent = `${currentPhotoIndex + 1} / ${galleryPhotos.length}`;
}

function setupLightbox() {
  const lightbox = document.getElementById('lightbox');
  if (lightbox) {
    lightbox.querySelector('.lightbox-close')?.addEventListener('click', closeLightbox);
    lightbox.querySelector('.lightbox-prev')?.addEventListener('click', () => navigateLightbox(-1));
    lightbox.querySelector('.lightbox-next')?.addEventListener('click', () => navigateLightbox(1));
    lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
  }
  document.addEventListener('keydown', (e) => {
    if (!lightbox?.classList.contains('active')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') navigateLightbox(-1);
    if (e.key === 'ArrowRight') navigateLightbox(1);
  });
}

function renderSlots(slots) {
  if (!slotsEl) return;
  if (!slots || !slots.length) {
    slotsEl.textContent = 'No available times yet.';
    return;
  }

  slotsEl.innerHTML = '';
  slots.forEach((slot) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'slot-picker-btn';
    const label = slot.label ? ` - ${escapeHTML(slot.label)}` : '';

    btn.innerHTML = `
      <span class="slot-time">${slot.date} | ${slot.start_time}</span>
      <span class="slot-price">${formatMoney(slot.price)}${label}</span>
    `;

    btn.onclick = () => {
      document.querySelectorAll('.slot-picker-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedSlot = slot;
      
      // Reset LLD when slot changes
      if (lldInput) {
        lldInput.value = 0;
        lldValue.textContent = formatMoney(0);
      }
      updateBookButtonState();
    };
    slotsEl.appendChild(btn);
  });

  const params = new URLSearchParams(window.location.search);
  const savedSlotId = params.get('slotId');
  if (savedSlotId) {
    const index = slots.findIndex(s => String(s.id) === String(savedSlotId));
    if (index !== -1) setTimeout(() => slotsEl.children[index].click(), 100);
  }
}

function setupLldField() {
  if (!lldInput || !lldValue) return;
  lldInput.addEventListener('input', () => {
    let val = parseInt(lldInput.value, 10) || 0;
    const maxPriceInPence = selectedSlot ? Math.floor(selectedSlot.price * 100) : 0;
    if (val > maxPriceInPence) {
      val = maxPriceInPence;
      lldInput.value = val;
    }
    lldValue.textContent = formatMoney(val * 0.01);
  });
}

function updateBookButtonState() {
  if (!bookButton) return;
  if (!userIsAuthenticated) {
    bookButton.disabled = false;
    bookButton.textContent = 'Sign in to Book';
    bookButton.classList.add('auth-needed');
  } else if (!selectedSlot) {
    bookButton.disabled = true;
    bookButton.textContent = 'Select a Slot';
    bookButton.classList.remove('auth-needed');
  } else {
    bookButton.disabled = false;
    bookButton.textContent = 'Book Now';
    bookButton.classList.remove('auth-needed');
  }
}

async function handleBooking(listing) {
  if (!userIsAuthenticated) {
    const params = new URLSearchParams();
    params.set('next', 'listing.html');
    params.set('id', listingId);
    if (selectedSlot) params.set('slotId', selectedSlot.id);
    params.set('msg', 'Please sign in to complete your booking.');
    window.location.href = `signin.html?${params.toString()}`;
    return;
  }

  // Show loading state
  const originalText = bookButton.textContent;
  bookButton.disabled = true;
  bookButton.textContent = 'Connecting to Stripe...';

  // FIX: Check selectedSlot object, NOT undefined "selectedSlotId"
  if (!selectedSlot) {
    alert("Please select a time slot.");
    bookButton.disabled = false;
    bookButton.textContent = originalText;
    return;
  }

  // FIX: Get price directly from selectedSlot object
  const slotPrice = Number(selectedSlot.price || 0);
  const lldSelected = Math.max(0, parseInt(lldInput?.value || '0', 10));
  const maxRedeemable = Math.min(lldSelected, Math.floor(slotPrice * 100));

  try {
    const { data, error } = await sb.functions.invoke('create-checkout-session', {
      body: {
        listing_id: listing.id,
        availability_id: selectedSlot.id, // FIX: Use correct ID
        lld_to_redeem: maxRedeemable,
      },
    });

    if (error) throw new Error(error.message || 'Failed to start checkout.');
    if (!data?.success) throw new Error(data?.error || 'Failed to start checkout.');
    if (!data?.data?.url) throw new Error('No checkout URL returned.');

    // Redirect to Stripe
    window.location.href = data.data.url;

  } catch (error) {
    console.error("Booking Error:", error);
    bookButton.disabled = false;
    bookButton.textContent = originalText;
    alert(error?.message || 'Unable to start checkout.');
  }
}

async function handleMessageMerchant(listing) {
  if (!messageButton) return;
  if (!userIsAuthenticated) {
    const params = new URLSearchParams();
    params.set('next', 'listing.html');
    params.set('id', listingId);
    params.set('msg', 'Please sign in to message the merchant.');
    window.location.href = `signin.html?${params.toString()}`;
    return;
  }

  const originalText = messageButton.textContent;
  messageButton.disabled = true;
  messageButton.textContent = 'Opening chat...';

  try {
    if (!listing || !listing.merchant_id) throw new Error('Merchant info missing');

    const { data, error } = await sb.functions.invoke('find-or-create-thread', {
      body: { merchant_id: listing.merchant_id, listing_id: listingId }
    });

    if (error || !data?.ok || !data?.thread_id) {
        throw new Error(error?.message || data?.error || 'Failed to start chat');
    }

    window.location.href = `message-thread.html?id=${data.thread_id}`;
  } catch (error) {
    console.error('Message error:', error);
    alert(error.message);
    messageButton.disabled = false;
    messageButton.textContent = originalText;
  }
}

async function loadData() {
  if (!listingId) {
    if (infoEl) infoEl.textContent = 'Listing ID missing.';
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  const [listingResult, availabilityResult] = await Promise.all([
    sb.from('listings').select('*').eq('id', listingId).single(),
    sb.from('availability').select('*').eq('listing_id', listingId).gte('date', today).lte('date', in14).order('date'),
  ]);

  if (listingResult.error) {
    if (infoEl) infoEl.textContent = listingResult.error.message;
    return;
  }

  const listing = listingResult.data;
  renderListing(listing);
  await renderPhotoGallery(listingId);

  if (availabilityResult.error) {
    if (slotsEl) slotsEl.textContent = availabilityResult.error.message;
  } else {
    renderSlots(availabilityResult.data);
  }

  if (bookButton) {
    bookButton.addEventListener('click', () => handleBooking(listing));
    updateBookButtonState();
  }

  if (messageButton) {
    const isOwnListing = currentUserId && listing.merchant_id && currentUserId === listing.merchant_id;
    if (isOwnListing) messageButton.style.display = 'none';
    else messageButton.addEventListener('click', () => handleMessageMerchant(listing));
  }
}

async function init() {
  setupLldField();
  setupLightbox();
  await loadData();
}

init().catch((error) => console.error('[Listing] init error', error));