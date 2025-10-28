// Supabase Storage helpers for listing photos
import { sb } from '../supabase-client.js';

// Optionally configure via <meta> tags or window.ENV
function getMeta(name) {
  const el = document.querySelector(`meta[name="${name}"]`);
  return el?.content || null;
}

// Read bucket name from runtime overrides, else default to 'listing-photos'
export const LISTING_IMAGES_BUCKET =
  (typeof window !== 'undefined' && window.ENV?.LISTING_IMAGES_BUCKET) ||
  getMeta('listing-images-bucket') ||
  'listing-photos';

// Optional alias if you prefer clearer naming elsewhere.
export const LISTING_PHOTOS_BUCKET = LISTING_IMAGES_BUCKET;

// Read signed URL mode from runtime overrides
const USE_SIGNED_URLS =
  (typeof window !== 'undefined' && window.ENV?.USE_SIGNED_URLS) ||
  getMeta('use-signed-urls') === 'true' ||
  false;

// Log resolved bucket configuration once for debugging
if (!window.__storageConfigLogged) {
  console.debug(`[storage] Resolved bucket: ${LISTING_IMAGES_BUCKET}, USE_SIGNED_URLS: ${USE_SIGNED_URLS}`);
  window.__storageConfigLogged = true;
}

export function getPublicUrl(path) {
  const { data } = sb.storage.from(LISTING_IMAGES_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Get image URL - either public or signed depending on USE_SIGNED_URLS setting
 * @param {string} path - Path to the image in storage
 * @returns {Promise<string>} - URL to access the image
 */
export async function getImageUrl(path) {
  if (USE_SIGNED_URLS) {
    // Return signed URL with 1 hour expiration for private buckets
    const { data, error } = await sb.storage
      .from(LISTING_IMAGES_BUCKET)
      .createSignedUrl(path, 3600); // 1 hour = 3600 seconds
    
    if (error) {
      console.error(`[storage] Error creating signed URL for ${path}:`, error);
      // Fallback to public URL on error
      return getPublicUrl(path);
    }
    
    console.debug(`[storage] Created signed URL for ${path}`);
    return data.signedUrl;
  }
  
  // Default: return public URL
  return getPublicUrl(path);
}

/** List photos within a listing folder (listingId/) */
export async function listListingImages(listingId) {
  console.debug(`[storage] Listing images for listing ${listingId} from bucket ${LISTING_IMAGES_BUCKET}`);
  
  const { data, error } = await sb.storage
    .from(LISTING_IMAGES_BUCKET)
    .list(listingId, { limit: 100, offset: 0, sortBy: { column: 'created_at', order: 'desc' } });
  
  if (error) {
    console.error(`[storage] Error listing images for ${listingId}:`, error);
    throw error;
  }
  
  // Resolve URLs via Promise.all using getImageUrl
  const files = await Promise.all(
    (data || []).map(async (f) => {
      const path = `${listingId}/${f.name}`;
      const url = await getImageUrl(path);
      return {
        name: f.name,
        path,
        url,
        size: f.metadata?.size ?? f.size ?? 0,
        created_at: f.created_at
      };
    })
  );
  
  console.debug(`[storage] Listed ${files.length} images for listing ${listingId}`);
  return files;
}

/** Upload multiple files to a listing folder. Returns array of { path, error } */
export async function uploadListingImages(listingId, files) {
  console.debug(`[storage] Uploading ${files.length} images to listing ${listingId}`);
  
  const results = [];
  for (const file of files) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const name = `${crypto.randomUUID()}.${ext}`;
    const path = `${listingId}/${name}`;
    const { error } = await sb.storage
      .from(LISTING_IMAGES_BUCKET)
      .upload(path, file, { upsert: false, contentType: file.type || 'image/*', cacheControl: '3600' });
    
    if (error) {
      console.error(`[storage] Error uploading ${file.name} to ${path}:`, error);
      results.push({ path, error: error.message });
    } else {
      console.debug(`[storage] Successfully uploaded ${file.name} to ${path}`);
      results.push({ path, error: null });
    }
  }
  
  const successCount = results.filter(r => !r.error).length;
  console.debug(`[storage] Upload complete: ${successCount}/${files.length} successful`);
  return results;
}

/** Delete a single photo by full path "listingId/filename.ext" */
export async function deleteListingImage(path) {
  console.debug(`[storage] Deleting image at ${path}`);
  
  const { error } = await sb.storage.from(LISTING_IMAGES_BUCKET).remove([path]);
  
  if (error) {
    console.error(`[storage] Error deleting ${path}:`, error);
    throw error;
  }
  
  console.debug(`[storage] Successfully deleted ${path}`);
}