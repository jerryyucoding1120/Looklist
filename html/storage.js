// Customer-facing storage utility for listing photos
import { spLocal } from './supabase-client.js';

// Read bucket name from runtime overrides, else default to 'listing-photos'
export const LISTING_IMAGES_BUCKET =
  (typeof window !== 'undefined' && window.ENV?.LISTING_IMAGES_BUCKET) ||
  'listing-photos';

// Signed URL expiration time in seconds (1 hour)
const SIGNED_URL_EXPIRY_SECONDS = 3600;

// Read signed URL mode from runtime overrides
const USE_SIGNED_URLS =
  !!(typeof window !== 'undefined' && window.ENV?.USE_SIGNED_URLS) ||
  false;

/**
 * Get public URL for an image in the listing photos bucket
 * @param {string} path - Path to the image in storage
 * @returns {string} - Public URL to access the image
 */
export function getPublicUrl(path) {
  const { data } = spLocal.storage.from(LISTING_IMAGES_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Get image URL - either public or signed depending on USE_SIGNED_URLS setting
 * @param {string} path - Path to the image in storage
 * @returns {Promise<string>} - URL to access the image
 */
export async function getImageUrl(path) {
  if (USE_SIGNED_URLS) {
    // Return signed URL with expiration for private buckets
    const { data, error } = await spLocal.storage
      .from(LISTING_IMAGES_BUCKET)
      .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);
    
    if (error) {
      console.error('[storage] Error creating signed URL for path:', path, 'Error:', error);
      // Fallback to public URL on error
      return getPublicUrl(path);
    }
    
    return data.signedUrl;
  }
  
  // Default: return public URL
  return getPublicUrl(path);
}

/**
 * List photos for a specific listing (customer-facing)
 * Note: This function lists files from the storage bucket for the given listing ID.
 * It does not validate if the listing is active. The listing should be validated
 * by the calling code before fetching photos (e.g., check listings table with active=true).
 * @param {string} listingId - The listing UUID
 * @returns {Promise<Array>} - Array of photo objects with url, name, path
 */
export async function listListingPhotos(listingId) {
  try {
    const { data, error } = await spLocal.storage
      .from(LISTING_IMAGES_BUCKET)
      .list(listingId, { 
        limit: 100, 
        offset: 0, 
        sortBy: { column: 'created_at', order: 'asc' } 
      });
    
    if (error) {
      console.error('[storage] Error listing photos for listing:', listingId, 'Error:', error);
      return [];
    }
    
    // Filter out any non-image files and resolve URLs
    const files = await Promise.all(
      (data || [])
        .filter(f => f.name && /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name))
        .map(async (f) => {
          const path = `${listingId}/${f.name}`;
          const url = await getImageUrl(path);
          return {
            name: f.name,
            path,
            url,
            created_at: f.created_at
          };
        })
    );
    
    return files;
  } catch (err) {
    console.error('[storage] Exception listing photos for listing:', listingId, 'Error:', err);
    return [];
  }
}
