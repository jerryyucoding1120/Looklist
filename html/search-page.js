import { getAuthClients } from './auth.js';
import { listListingPhotos } from './storage.js';

const params = new URLSearchParams(window.location.search);
const state = {
  category: params.get('category') || '',
  q: '',
  style: '',
  loc: '',
};

const pillsEl = document.getElementById('active-filters');
const inputQuery = document.getElementById('q');
const inputLocation = document.getElementById('loc');
const inputStyle = document.getElementById('style');
const resultsEl = document.getElementById('results');

const clientPromise = getAuthClients().then(({ spLocal }) => spLocal);

function renderPills() {
  if (!pillsEl) return;
  pillsEl.innerHTML = '';
  Object.entries(state).forEach(([key, value]) => {
    if (!value) return;
    const button = document.createElement('button');
    button.className = 'pill';
    button.textContent = `${value} x`;
    button.onclick = () => {
      state[key] = '';
      renderPills();
      fetchRows();
    };
    pillsEl.appendChild(button);
  });
}

async function fetchRows() {
  if (!resultsEl) return;
  resultsEl.textContent = 'Loading...';

  const client = await clientPromise;
  let query = client.from('listings').select('*').eq('active', true).limit(50);
  if (state.category) query = query.eq('category', state.category);
  if (state.style) query = query.contains('styles', [state.style]);
  if (state.q) query = query.or(`name.ilike.%${state.q}%,description.ilike.%${state.q}%`);
  if (state.loc) query = query.or(`city.ilike.%${state.loc}%,postcode.ilike.%${state.loc}%`);

  const { data, error } = await query;
  if (error) {
    resultsEl.textContent = error.message;
    return;
  }
  if (!data || !data.length) {
    resultsEl.textContent = 'No matches yet.';
    return;
  }
  
  // Render cards first
  resultsEl.innerHTML = data.map(rowToCard).join('');
  renderPills();
  
  // Load thumbnails for each listing asynchronously
  data.forEach(async (row) => {
    await loadListingThumbnail(row.id);
  });
}

async function loadListingThumbnail(listingId) {
  try {
    const photos = await listListingPhotos(listingId);
    const thumbnailContainer = document.querySelector(`[data-listing-id="${listingId}"] .card-thumbnail`);
    
    if (thumbnailContainer && photos && photos.length > 0) {
      const firstPhoto = photos[0];
      thumbnailContainer.innerHTML = `<img src="${escapeHTML(firstPhoto.url)}" alt="Listing thumbnail" loading="lazy">`;
    }
  } catch (error) {
    console.error(`[Search] Error loading thumbnail for listing ${listingId}:`, error);
    // Silently fail - card will just not have a photo
  }
}

function rowToCard(row) {
  const url = `listing.html?id=${row.id}&category=${encodeURIComponent(state.category)}`;
  const rating = row.rating ?? 'N/A';
  const city = row.city || '';
  const price = row.price_from ?? 'N/A';
  return `<article class="card" data-listing-id="${escapeHTML(row.id)}">
    <div class="card-thumbnail card-thumbnail-placeholder"></div>
    <div class="card__top"><h3>${escapeHTML(row.name)}</h3><div>Rating ${rating}</div></div>
    <div class="card__meta">${cap(row.category)} - ${escapeHTML(city)} - from GBP ${price}</div>
    <button class="btn" data-href="${url}">Book</button>
  </article>`;
}

function attachHandlers() {
  if (inputQuery) {
    inputQuery.addEventListener('input', debounce(() => {
      state.q = inputQuery.value.trim();
      fetchRows();
    }, 250));
  }
  if (inputLocation) {
    inputLocation.addEventListener('change', () => {
      state.loc = inputLocation.value.trim();
      fetchRows();
    });
  }
  if (inputStyle) {
    inputStyle.addEventListener('change', () => {
      state.style = inputStyle.value;
      fetchRows();
    });
  }
  if (resultsEl) {
    resultsEl.addEventListener('click', (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.matches('button[data-href]')) {
        const href = target.getAttribute('data-href');
        if (href) window.location.href = href;
      }
    });
  }
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function cap(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

function escapeHTML(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function init() {
  renderPills();
  attachHandlers();
  await fetchRows();
}

init().catch((err) => {
  if (resultsEl) resultsEl.textContent = err.message || 'Unable to load search results.';
  console.error('[Search] init', err);
});
