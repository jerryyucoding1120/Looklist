import { sb, __SUPABASE_URL } from '../supabase-client.js';
import { requireUser, signOut } from './auth.js';
import { LISTING_IMAGES_BUCKET, listListingImages, uploadListingImages, deleteListingImage } from './storage.js';
import { initializeSlotEditor } from '../slot-editor.js';
import { subscribeMerchantDashboard, cleanupAllSubscriptions, monitorConnection } from '../../../realtime.js';

const form = document.getElementById('listing-form');
const list = document.getElementById('my-listings');
const signoutBtn = document.getElementById('signout');
const cancelEditBtn = document.getElementById('cancel-edit');
const formTitle = document.getElementById('form-title');
const submitBtn = document.getElementById('submit-btn');

let currentUser = null;
let realtimeUnsubscribe = null;
let connectionMonitor = null;

// Log resolved configuration for debugging on initialization
if (!window.__looklist_listingsConfigLogged) {
  const projectRef = new URL(__SUPABASE_URL).hostname.split('.')[0];
  console.log(`[listings] Supabase project ref: ${projectRef}`);
  console.log(`[listings] Storage bucket: ${LISTING_IMAGES_BUCKET}`);
  window.__looklist_listingsConfigLogged = true;
}

/**
 * Ensure a profile row exists for the user.
 * Upserts into profiles table to prevent FK constraint violations.
 */
/**
 * Phase 3 Dev C - Setup Realtime Subscriptions
 * Subscribes to listing and availability changes for the merchant dashboard
 */
async function setupRealtimeDashboard(merchantId) {
  console.log('[Realtime] Setting up subscriptions for merchant:', merchantId);
  
  // Subscribe to realtime updates
  realtimeUnsubscribe = subscribeMerchantDashboard(merchantId, {
    onListingChange: (eventType, newListing, oldListing) => {
      console.log(`[Realtime] Listing ${eventType}:`, newListing);
      handleRealtimeListingChange(eventType, newListing, oldListing);
    },
    onAvailabilityChange: (eventType, newAvailability, oldAvailability) => {
      console.log(`[Realtime] Availability ${eventType}:`, newAvailability);
      showRealtimeToast(`Availability ${eventType.toLowerCase()}d: ${newAvailability?.label || 'slot'}`);
    },
    onError: (err) => {
      console.error('[Realtime] Error:', err);
      showRealtimeToast('Connection issue. Refreshing...', 'warning');
      // Refetch listings on error
      if (currentUser) {
        ensureProfileExists(currentUser).then(() => {
          // Reload listings - this will call your existing load function
          window.location.reload();
        });
      }
    }
  });

  // Monitor connection state and refetch on reconnect
  connectionMonitor = monitorConnection(() => {
    console.log('[Realtime] Connection re-established, refetching data...');
    showRealtimeToast('Reconnected. Refreshing data...');
    if (currentUser) {
      window.location.reload(); // Simple approach: reload page
    }
  });

  console.log('[Realtime] ✅ Subscriptions active');
}

/**
 * Handle realtime listing changes
 */
function handleRealtimeListingChange(eventType, newListing, oldListing) {
  if (eventType === 'INSERT') {
    showRealtimeToast(`✨ New listing created: ${newListing.name}`, 'success');
    // Reload page to show new listing
    setTimeout(() => window.location.reload(), 1500);
    
  } else if (eventType === 'UPDATE') {
    const statusChanged = oldListing?.is_active !== newListing?.is_active;
    const message = statusChanged 
      ? `📝 Listing "${newListing.name}" is now ${newListing.is_active ? 'published' : 'draft'}`
      : `📝 Listing "${newListing.name}" updated`;
    showRealtimeToast(message, 'info');
    // Reload to show changes
    setTimeout(() => window.location.reload(), 1500);
    
  } else if (eventType === 'DELETE') {
    showRealtimeToast(`🗑️ Listing deleted`, 'info');
    setTimeout(() => window.location.reload(), 1500);
  }
}

/**
 * Show realtime toast notification
 */
function showRealtimeToast(message, type = 'info') {
  console.log(`[Toast] ${message}`);
  
  // Create toast element
  const toast = document.createElement('div');
  toast.className = 'realtime-toast';
  
  const colors = {
    success: '#66bb6a',
    info: '#90caf9',
    warning: '#ffb74d',
    error: '#ef5350'
  };
  
  const color = colors[type] || colors.info;
  
  toast.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    background: #23272a;
    color: ${color};
    padding: 1rem 1.5rem;
    border-radius: 12px;
    border: 2px solid ${color};
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    z-index: 10000;
    font-family: 'Inter', sans-serif;
    font-size: 0.95rem;
    font-weight: 500;
    max-width: 350px;
    animation: slideIn 0.3s ease-out;
  `;
  
  // Add animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(400px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  
  toast.textContent = message;
  document.body.appendChild(toast);
  
  // Auto-remove after 3.5 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(400px)';
    toast.style.transition = 'all 0.3s ease-in';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

async function ensureProfileExists(sb, user) {
  if (!user?.id) return;

  const { error } = await sb
    .from('profiles')
    .upsert(
      {
        id: user.id,
        full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || null,
        avatar_url: user.user_metadata?.avatar_url || null
      },
      { onConflict: 'id' }
    );

  if (error) {
    console.warn('ensureProfileExists failed:', error.message);
    // Don't throw - some environments may have RLS blocking this.
    // The listings insert will fail with a clearer error if profile is truly missing.
  }
}

main();

async function main() {
  currentUser = await requireUser(); if (!currentUser) return;
  if (signoutBtn) signoutBtn.onclick = async () => {
  if (realtimeCleanup) realtimeCleanup();
  await signOut();
};


  // Update header Sign in link to Sign Out
  const signInLinks = document.querySelectorAll('[data-auth="signin"]');
  signInLinks.forEach((el) => {
    el.textContent = 'Sign Out';
    el.setAttribute('href', '#');
    el.addEventListener('click', async (e) => {
      e.preventDefault();
      await signOut();
    });
  });

  await refreshMyListings(currentUser.id);

  // Initialize slot editor
  const slotEditorContainer = document.getElementById('slot-editor-container');
  if (slotEditorContainer) {
    await initializeSlotEditor(currentUser, slotEditorContainer);
  }

  // Create/Edit form submit
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      const styles = (data.styles || '').split(',').map(s => s.trim()).filter(Boolean);

      const payload = {
        name: data.name,
        category: data.category,
        styles,
        city: data.city || null,
        postcode: data.postcode || null,
        price_from: data.price_from ? Number(data.price_from) : null,
        description: data.description || null,
        active: data.active === 'on'
      };

      const listingId = data.listing_id?.trim();
      if (listingId) {
        // Update
        const { error } = await sb.from('listings').update(payload).eq('id', listingId);
        if (error) {
          alert(`Error updating listing: ${error.message}\n${error.details || ''}\n${error.hint || ''}`);
          return;
        }
        resetFormToCreate();
      } else {
        // Create - ensure profile exists first
        await ensureProfileExists(sb, currentUser);

        payload.owner = currentUser.id;
        const { error } = await sb.from('listings').insert(payload);
        if (error) {
          // Provide detailed error message including hints for common issues
          let errorMsg = `Error creating listing: ${error.message}`;
          if (error.details) errorMsg += `\n\nDetails: ${error.details}`;
          if (error.hint) errorMsg += `\n\nHint: ${error.hint}`;
          if (error.code === '23503') {
            errorMsg += '\n\nThis may be a foreign key constraint error. Please ensure your profile exists.';
          }
          alert(errorMsg);
          return;
        }
        form.reset();
      }
      await refreshMyListings(currentUser.id);
    });
    window.addEventListener('beforeunload', () => {
    if (realtimeCleanup) {
      console.log('[listings] Cleaning up realtime subscriptions');
      realtimeCleanup();
    }
  });
  }

  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', (e) => {
      e.preventDefault();
      resetFormToCreate();
    });
  }

  // Delegated: edit listing
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-edit-id]');
    if (!btn) return;
    const id = btn.getAttribute('data-edit-id');
    const { data, error } = await sb.from('listings').select('*').eq('id', id).single();
    if (error) { alert(error.message); return; }
    loadListingIntoForm(data);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Delegated: upload input change
  document.addEventListener('change', async (e) => {
    const input = e.target.closest('input[type="file"][data-upload]');
    if (!input) return;
    const listingId = input.getAttribute('data-upload');
    const files = input.files;
    if (!files?.length) return;

    input.disabled = true;
    const status = document.querySelector(`#imgs-${cssEscape(listingId)} .upload-status`);
    if (status) status.textContent = `Uploading ${files.length} file(s)…`;

    const results = await uploadListingImages(listingId, files);
    const errs = results.filter(r => r.error);

    if (status) {
      if (errs.length === 0) {
        status.textContent = `✓ Successfully uploaded ${files.length} photo(s). Changes are immediately visible to customers.`;
        status.style.color = '#a5d6a7';
      } else if (errs.length < files.length) {
        status.textContent = `⚠ Uploaded ${files.length - errs.length} of ${files.length} photo(s). ${errs.length} failed.`;
        status.style.color = '#ffb74d';
      } else {
        status.textContent = `✗ Upload failed for all ${files.length} photo(s).`;
        status.style.color = '#ef5350';
      }
      setTimeout(() => {
        status.textContent = '';
        status.style.color = '';
      }, 3000);
    }

    input.value = '';
    input.disabled = false;
    await renderListingImages(listingId);
  });

  // Delegated: delete image
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-del-img]');
    if (!btn) return;
    const path = btn.getAttribute('data-del-img');
    if (!confirm('Delete this image?')) return;
    try {
      await deleteListingImage(path);
      const listingId = path.split('/')[0];
      await renderListingImages(listingId);
    } catch (err) {
      alert(err.message || String(err));
    }
  });
}

function resetFormToCreate() {
  form.reset();
  form.querySelector('[name="listing_id"]').value = '';
  formTitle.textContent = 'Create Listing';
  submitBtn.textContent = 'Create';
  cancelEditBtn.classList.add('hidden');
}

function loadListingIntoForm(l) {
  form.querySelector('[name="listing_id"]').value = l.id;
  form.querySelector('[name="name"]').value = l.name || '';
  form.querySelector('[name="category"]').value = l.category || 'hair';
  form.querySelector('[name="styles"]').value = Array.isArray(l.styles) ? l.styles.join(', ') : (l.styles || '');
  form.querySelector('[name="city"]').value = l.city || '';
  form.querySelector('[name="postcode"]').value = l.postcode || '';
  form.querySelector('[name="price_from"]').value = l.price_from ?? '';
  form.querySelector('[name="description"]').value = l.description || '';
  form.querySelector('[name="active"]').checked = !!l.active;
  formTitle.textContent = 'Edit Listing';
  submitBtn.textContent = 'Save Changes';
  cancelEditBtn.classList.remove('hidden');
}

async function refreshMyListings(userId) {
  if (list) list.innerHTML = 'Loading…';
  const { data, error } = await sb
    .from('listings')
    .select('*')
    .eq('owner', userId)
    .order('created_at', { ascending: false });
  if (error) { list.textContent = error.message; return; }
  if (!data?.length) { list.innerHTML = '<li class="muted">No listings yet. Create one above.</li>'; return; }

  list.innerHTML = data.map(l => renderListingItem(l)).join('');

  // After rendering items, load images for each listing
  for (const l of data) {
    await renderListingImages(l.id);
  }
}

function renderListingItem(l) {
  return `
    <li id="listing-${escapeHtml(l.id)}">
      <div class="listing-head">
        <div class="row" style="align-items:center">
          <b>${escapeHtml(l.name)}</b>
          <small class="muted">${escapeHtml(l.category)}</small>
          <small class="muted">${escapeHtml(l.city || '')}</small>
          <small>Active: ${l.active ? 'Yes' : 'No'}</small>
        </div>
        <div class="row">
          <button data-edit-id="${escapeAttr(l.id)}" class="secondary">Edit</button>
          <a href="availability.html?listing=${encodeURIComponent(l.id)}" class="secondary">Manage Availability</a>
        </div>
      </div>

      <details style="margin-top:.6rem">
        <summary>Details</summary>
        <pre class="muted" style="white-space:pre-wrap">${escapeHtml(JSON.stringify(l, null, 2))}</pre>
      </details>

      <div id="imgs-${escapeAttr(l.id)}" class="card" style="margin-top:.8rem">
        <h3 style="margin:.2rem 0 .6rem">Images</h3>
        <div class="upload-zone" data-drop="${escapeAttr(l.id)}">
          <div class="row" style="justify-content:space-between;align-items:center">
            <span>Drag & drop images here or choose files.</span>
            <input type="file" accept="image/*" multiple data-upload="${escapeAttr(l.id)}" />
          </div>
          <small class="upload-status muted"></small>
        </div>
        <div class="thumbs" style="margin-top:.8rem"></div>
      </div>
    </li>
  `;
}

async function renderListingImages(listingId) {
  const container = document.querySelector(`#imgs-${cssEscape(listingId)} .thumbs`);
  const status = document.querySelector(`#imgs-${cssEscape(listingId)} .upload-status`);
  if (!container) return;
  if (status) status.textContent = 'Loading images…';
  container.innerHTML = '';
  try {
    const files = await listListingImages(listingId);
    if (!files.length) {
      container.innerHTML = '<div class="muted">No images yet.</div>';
    } else {
      container.innerHTML = files.map(f => `
        <div class="thumb">
          <img src="${escapeAttr(f.url)}" alt="">
          <div class="actions">
            <button class="danger" title="Delete" data-del-img="${escapeAttr(f.path)}">✕</button>
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('[listings] Error rendering listing images:', err);
    container.innerHTML = `<div class="muted">Error: ${escapeHtml(err.message || String(err))}</div>`;
  } finally {
    if (status) status.textContent = '';
  }
}

/* Drag & drop upload */
document.addEventListener('dragover', (e) => {
  const zone = e.target.closest('[data-drop]');
  if (!zone) return;
  e.preventDefault();
  zone.classList.add('dragover');
});
document.addEventListener('dragleave', (e) => {
  const zone = e.target.closest('[data-drop]');
  if (!zone) return;
  zone.classList.remove('dragover');
});
document.addEventListener('drop', async (e) => {
  const zone = e.target.closest('[data-drop]');
  if (!zone) return;
  e.preventDefault();
  zone.classList.remove('dragover');
  const listingId = zone.getAttribute('data-drop');
  const files = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/'));
  if (!files.length) return;

  const status = zone.querySelector('.upload-status');
  if (status) status.textContent = `Uploading ${files.length} file(s)…`;

  const results = await uploadListingImages(listingId, files);
  const errs = results.filter(r => r.error);

  if (status) {
    if (errs.length === 0) {
      status.textContent = `✓ Successfully uploaded ${files.length} photo(s). Visible to customers now!`;
      status.style.color = '#a5d6a7';
    } else {
      status.textContent = `⚠ Uploaded ${files.length - errs.length} of ${files.length} photo(s).`;
      status.style.color = '#ffb74d';
    }
    setTimeout(() => {
      status.textContent = '';
      status.style.color = '';
    }, 3000);
  }

  await renderListingImages(listingId);
});

/* Utils */
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])); }
function escapeAttr(s) { return String(s).replace(/"/g, '&quot;'); }
// CSS.escape polyfill-ish
function cssEscape(s) { return String(s).replace(/[^a-zA-Z0-9_-]/g, m => '\\' + m); }
