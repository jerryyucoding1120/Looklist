import { authInit, signOut } from './auth.js';
import { sp } from './api.js';
import { listListingPhotos } from './storage.js';

document.addEventListener('DOMContentLoaded', () => {
  loadLists().catch((err) => console.error('[Lists] init', err));
});

function toggleHeaderLinks(user) {
  const links = document.querySelectorAll('[data-auth="signin"]');
  if (!links.length) return;

  links.forEach((el) => {
    if (user) {
      el.textContent = 'Sign Out';
      el.onclick = (event) => {
        event.preventDefault();
        signOut();
      };
      el.setAttribute('href', '#');
    } else {
      el.textContent = 'Sign in';
      el.onclick = null;
      el.setAttribute('href', 'signin.html');
    }
  });
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
      if (document.body.contains(toast)) {
        document.body.removeChild(toast);
      }
    }, 300);
  }, duration);
}

/**
 * Fetch customer lists with their saved listings
 * For this MVP, we'll create a "Favorites" list automatically if it doesn't exist
 */
async function fetchCustomerLists(userId) {
  const client = await sp();
  
  // Check if customer_lists table exists and fetch lists
  // If it doesn't exist, we'll create a default favorites list in memory
  try {
    const { data, error } = await client
      .from('customer_lists')
      .select('*')
      .eq('customer_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.warn('[Lists] customer_lists table may not exist, using fallback:', error);
      // Return a default "Favorites" list
      return [{
        id: 'default-favorites',
        customer_id: userId,
        name: 'Favorites',
        created_at: new Date().toISOString()
      }];
    }
    
    return data || [];
  } catch (err) {
    console.warn('[Lists] Error fetching lists, using fallback:', err);
    return [{
      id: 'default-favorites',
      customer_id: userId,
      name: 'Favorites',
      created_at: new Date().toISOString()
    }];
  }
}

/**
 * Fetch saved listings for a specific list
 */
async function fetchListListings(listId) {
  const client = await sp();
  
  try {
    const { data, error } = await client
      .from('list_items')
      .select('listing_id, listings(*)')
      .eq('list_id', listId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.warn('[Lists] list_items table may not exist:', error);
      return [];
    }
    
    return (data || []).map(item => item.listings).filter(Boolean);
  } catch (err) {
    console.warn('[Lists] Error fetching list items:', err);
    return [];
  }
}

/**
 * Load the first photo for a listing with lazy loading
 */
async function loadListingIcon(listingId, imgElement) {
  if (!listingId || !imgElement) return;
  
  // Use Intersection Observer for lazy loading
  const observer = new IntersectionObserver(
    async (entries, obs) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          obs.unobserve(entry.target);
          
          try {
            const photos = await listListingPhotos(listingId);
            if (photos && photos.length > 0) {
              const firstPhoto = photos[0];
              imgElement.src = firstPhoto.url;
              imgElement.alt = `Icon for listing`;
              imgElement.classList.add('list-icon');
              imgElement.parentElement.classList.remove('list-icon-placeholder');
            }
          } catch (error) {
            console.error(`[Lists] Error loading icon for listing ${listingId}:`, error);
          }
        }
      }
    },
    {
      rootMargin: '50px', // Start loading 50px before the image enters viewport
      threshold: 0.01
    }
  );
  
  observer.observe(imgElement.parentElement);
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
 * Create a list card with listing photo as icon
 */
function createListCard(list, listings) {
  const card = document.createElement('article');
  card.className = 'list-card';
  card.setAttribute('role', 'listitem');
  card.setAttribute('aria-label', `${list.name} - ${listings.length} items`);
  
  // Create icon container
  const iconContainer = document.createElement('div');
  iconContainer.className = 'list-icon-container';
  
  if (listings.length > 0) {
    // Use first listing's photo as icon
    const firstListing = listings[0];
    const img = document.createElement('img');
    img.className = 'list-icon';
    img.setAttribute('loading', 'lazy');
    img.alt = `Icon for ${list.name}`;
    
    // Add placeholder while loading
    iconContainer.classList.add('list-icon-placeholder');
    iconContainer.appendChild(img);
    
    // Load the actual image with lazy loading
    loadListingIcon(firstListing.id, img);
  } else {
    // Show placeholder if no listings
    const placeholder = document.createElement('div');
    placeholder.className = 'list-icon-placeholder';
    placeholder.textContent = '📋';
    iconContainer.appendChild(placeholder);
  }
  
  // Create info section
  const info = document.createElement('div');
  info.className = 'list-info';
  
  const title = document.createElement('h3');
  title.className = 'list-title';
  title.textContent = list.name;
  
  const meta = document.createElement('p');
  meta.className = 'list-meta';
  meta.textContent = `${listings.length} ${listings.length === 1 ? 'listing' : 'listings'}`;
  
  info.appendChild(title);
  info.appendChild(meta);
  
  card.appendChild(iconContainer);
  card.appendChild(info);
  
  // Make card clickable
  card.addEventListener('click', () => {
    // For now, show message that detail view is coming soon
    // TODO: Implement list-detail.html page
    showToast('List details view coming soon! This will show all saved listings in this list.', 'info', 4000);
  });
  
  // Add keyboard support
  card.setAttribute('tabindex', '0');
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      card.click();
    }
  });
  
  return card;
}

export async function loadLists() {
  const { user } = await authInit({ requireAuth: true });
  toggleHeaderLinks(user);
  if (!user) return;

  const gridEl = document.querySelector('.lists-grid');
  const introEl = document.querySelector('.intro');
  if (!gridEl) return;

  try {
    if (introEl) introEl.textContent = 'Loading your lists...';
    
    // Fetch customer lists
    const lists = await fetchCustomerLists(user.id);
    
    if (!lists.length) {
      gridEl.innerHTML = '<div class="intro">No lists yet. Start saving your favorite listings!</div>';
      if (introEl) introEl.textContent = '';
      return;
    }
    
    // Clear the grid
    gridEl.innerHTML = '';
    
    // Load listings for each list
    for (const list of lists) {
      const listings = await fetchListListings(list.id);
      const card = createListCard(list, listings);
      gridEl.appendChild(card);
    }
    
    if (introEl) introEl.textContent = '';
  } catch (error) {
    console.error('[Lists] load', error);
    if (introEl) introEl.textContent = 'Failed to load lists. Please try again.';
    if (gridEl) gridEl.innerHTML = '';
  }
}
