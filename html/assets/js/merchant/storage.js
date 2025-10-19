// Supabase Storage helpers for listing photos
import { sb } from '../supabase-client.js';

// For compatibility, keep the original export name but point to the correct bucket.
export const LISTING_IMAGES_BUCKET = 'listing-photos';
// Optional alias if you prefer clearer naming elsewhere.
export const LISTING_PHOTOS_BUCKET = LISTING_IMAGES_BUCKET;

export function getPublicUrl(path) {
  const { data } = sb.storage.from(LISTING_IMAGES_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** List photos within a listing folder (listingId/) */
export async function listListingImages(listingId) {
  const { data, error } = await sb.storage
    .from(LISTING_IMAGES_BUCKET)
    .list(listingId, { limit: 100, offset: 0, sortBy: { column: 'created_at', order: 'desc' } });
  if (error) throw error;
  return (data || []).map(f => {
    const path = `${listingId}/${f.name}`;
    return {
      name: f.name,
      path,
      url: getPublicUrl(path),
      size: f.metadata?.size ?? f.size ?? 0,
      created_at: f.created_at
    };
  });
}

/** Upload multiple files to a listing folder. Returns array of { path, error } */
export async function uploadListingImages(listingId, files) {
  const results = [];
  for (const file of files) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const name = `${crypto.randomUUID()}.${ext}`;
    const path = `${listingId}/${name}`;
    const { error } = await sb.storage
      .from(LISTING_IMAGES_BUCKET)
      .upload(path, file, { upsert: false, contentType: file.type || 'image/*', cacheControl: '3600' });
    results.push({ path, error: error ? error.message : null });
  }
  return results;
}

/** Delete a single photo by full path "listingId/filename.ext" */
export async function deleteListingImage(path) {
  const { error } = await sb.storage.from(LISTING_IMAGES_BUCKET).remove([path]);
  if (error) throw error;
}