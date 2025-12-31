import { sp } from './api.js';

// Configuration
const LISTING_IMAGES_BUCKET = 'listing-photos';
const CONTAINER_ID = 'top5-grid';

document.addEventListener('DOMContentLoaded', () => {
  loadTopListings();
});

async function loadTopListings() {
  const container = document.getElementById(CONTAINER_ID);
  if (!container) return;

  // 1. Render Skeletons (Loading State)
  container.innerHTML = Array(5).fill(renderSkeletonCard()).join('');

  try {
    // Get the Supabase client from your api.js
    const client = await sp();

    // 2. Fetch Top 5 Active Listings
    const { data: listings, error } = await client
      .from('listings')
      .select('id, name, category, city, price_from, rating')
      .eq('active', true) 
      .limit(5);

    if (error) throw error;

    if (!listings || listings.length === 0) {
      container.innerHTML = '<div style="grid-column:1/-1;text-align:center;opacity:0.7;">No active listings found.</div>';
      return;
    }

    // 3. Fetch Images for each listing (Parallel)
    const listingsWithImages = await Promise.all(listings.map(async (listing) => {
      const imageUrl = await getFirstImage(listing.id);
      return { ...listing, imageUrl };
    }));

    // 4. Render Real Cards
    container.innerHTML = listingsWithImages.map(renderCard).join('');

  } catch (err) {
    console.error('Error loading top listings:', err);
    container.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#ff6b6b;">Unable to load listings.</div>';
  }
}

// Helper: Get the first image from the storage bucket
async function getFirstImage(listingId) {
  try {
    const client = await sp();

    const { data, error } = await client.storage
      .from(LISTING_IMAGES_BUCKET)
      .list(listingId, { limit: 1, sortBy: { column: 'name', order: 'asc' } });

    if (error || !data || data.length === 0) return 'assets/logo1.png'; // Fallback image

    // Get Public URL
    const { data: publicUrlData } = client.storage
      .from(LISTING_IMAGES_BUCKET)
      .getPublicUrl(`${listingId}/${data[0].name}`);

    return publicUrlData.publicUrl;
  } catch (e) {
    return 'assets/logo1.png'; // Fallback on error
  }
}

// Helper: Render HTML for a single card
function renderCard(item) {
  // Format price
  const price = item.price_from ? `£${parseFloat(item.price_from).toFixed(2)}` : 'Price on request';
  
  return `
    <a href="listing.html?id=${item.id}" class="listing-card-small" style="text-decoration:none; color:inherit;">
      <article style="
        background: var(--card);
        border: 1px solid var(--box-border);
        border-radius: 12px;
        overflow: hidden;
        transition: transform 0.2s, box-shadow 0.2s;
        height: 100%;
        display: flex;
        flex-direction: column;
      " 
      onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.3)';" 
      onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';">
        
        <div style="height: 140px; overflow: hidden; background: #000;">
          <img src="${item.imageUrl}" alt="${item.name}" style="width:100%; height:100%; object-fit:cover;">
        </div>
        
        <div style="padding: 12px; flex: 1; display:flex; flex-direction:column;">
          <h4 style="margin:0 0 6px 0; font-size:1rem; color:var(--silver); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.name}</h4>
          <div style="font-size:0.85rem; color:var(--silver); opacity:0.7; margin-bottom: 8px;">
            ${item.category} • ${item.city}
          </div>
          <div style="margin-top:auto; display:flex; justify-content:space-between; align-items:center; font-size:0.9rem;">
            <span style="font-weight:bold; color:var(--white);">${price}</span>
            <span style="color:#fbbf24;">★ ${item.rating || 'New'}</span>
          </div>
        </div>
      </article>
    </a>
  `;
}

// Helper: Render Loading Skeleton
function renderSkeletonCard() {
  return `
    <div style="
      background: var(--card);
      border-radius: 12px;
      height: 240px;
      animation: pulse 1.5s infinite;
      border: 1px solid var(--box-border);">
    </div>
    <style>
      @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.5; }
        100% { opacity: 1; }
      }
    </style>
  `;
}