import { getAuthClients } from './auth.js';
import { listListingPhotos } from './storage.js';
import { getCurrentUser, sp } from './api.js';

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
  
  // Load thumbnails for each listing in parallel with controlled concurrency
  const thumbnailPromises = data.map(row => loadListingThumbnail(row.id));
  await Promise.allSettled(thumbnailPromises);
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
    <button class="card-save-btn" data-listing-id="${escapeHTML(row.id)}" aria-label="Save to list" title="Save to list">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
      </svg>
    </button>
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
      if (target instanceof HTMLElement) {
        if (target.matches('button[data-href]')) {
          const href = target.getAttribute('data-href');
          // Validate href is a safe relative URL before navigation
          if (href && (href.startsWith('listing.html') || href.startsWith('./listing.html'))) {
            window.location.href = href;
          }
        } else if (target.matches('.card-save-btn') || target.closest('.card-save-btn')) {
          const btn = target.matches('.card-save-btn') ? target : target.closest('.card-save-btn');
          const listingId = btn.getAttribute('data-listing-id');
          if (listingId) {
            handleSaveToList(listingId, btn);
          }
        }
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

/**
 * Show a toast notification to the user
 * @param {string} message - Message to display
 * @param {string} type - Type of notification (success, error, info)
 * @param {number} duration - Duration in milliseconds (default 3000)
 */
function showToast(message, type = 'info', duration = 3000) {
  // Create toast element
  const toast = document.createElement('div');
  toast.className = `toast-notification ${type}`;
  
  // Add icon based on type
  let icon = '💡';
  if (type === 'success') icon = '✓';
  else if (type === 'error') icon = '✗';
  
  toast.innerHTML = `<span style="font-size: 1.5rem;">${icon}</span><span>${escapeHTML(message)}</span>`;
  
  // Add to body
  document.body.appendChild(toast);
  
  // Auto remove after duration
  setTimeout(() => {
    toast.style.animation = 'slideInUp 0.3s ease reverse';
    setTimeout(() => {
      document.body.removeChild(toast);
    }, 300);
  }, duration);
}

async function handleSaveToList(listingId, buttonElement) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      showToast('Please sign in to save listings to your list.', 'info');
      setTimeout(() => {
        window.location.href = 'signin.html?next=' + encodeURIComponent(window.location.pathname + window.location.search);
      }, 1000);
      return;
    }

    // Get or create default favorites list
    const client = await sp();
    let listId = 'default-favorites';
    
    try {
      // Try to get the user's favorites list
      const { data: lists, error: listError } = await client
        .from('customer_lists')
        .select('*')
        .eq('customer_id', user.id)
        .eq('name', 'Favorites')
        .limit(1);
      
      if (listError) {
        console.warn('[Search] customer_lists table may not exist, using fallback');
      } else if (lists && lists.length > 0) {
        listId = lists[0].id;
      } else {
        // Create a new favorites list
        const { data: newList, error: createError } = await client
          .from('customer_lists')
          .insert({ customer_id: user.id, name: 'Favorites' })
          .select()
          .single();
        
        if (!createError && newList) {
          listId = newList.id;
        }
      }
      
      // Add the listing to the list
      const { error: addError } = await client
        .from('list_items')
        .insert({
          list_id: listId,
          listing_id: listingId
        });
      
      if (addError) {
        if (addError.code === '23505') {
          showToast('This listing is already in your favorites!', 'info');
        } else {
          console.error('[Search] Error adding to list:', addError);
          showToast('Unable to save to list. Please ensure database tables are set up correctly.', 'error');
        }
      } else {
        // Visual feedback
        buttonElement.classList.add('saved');
        buttonElement.style.color = '#ff6b9d';
        showToast('Saved to your favorites!', 'success');
      }
    } catch (err) {
      console.warn('[Search] Save to list feature not fully implemented:', err);
      showToast('Save to list feature coming soon! Database tables may need to be created.', 'info', 4000);
    }
  } catch (error) {
    console.error('[Search] Error in handleSaveToList:', error);
    showToast('Unable to save listing. Please try again later.', 'error');
  }
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
