# Photo Sync Implementation Documentation

## Overview
This implementation enables photos uploaded by merchants on `html/merchant/listings.html` to be displayed dynamically to customers on the new `html/listings.html` page, as well as on the existing `html/listing.html` (single listing detail) and `html/search.html` (search results) pages.

## Architecture

### Storage
- **Platform**: Supabase Storage
- **Bucket**: `listing-photos` (configurable via `window.ENV.LISTING_IMAGES_BUCKET`)
- **Path Structure**: `{listingId}/{uuid}.{ext}`
- **Access Mode**: Public URLs (with optional signed URL support)

### File Structure

```
html/
├── listings.html              # NEW: Customer-facing catalog page
├── listings-page.js          # NEW: Logic for catalog page
├── listing.html              # EXISTING: Single listing detail page
├── listing-page.js           # EXISTING: Single listing logic (uses photos)
├── search.html               # EXISTING: Search page (uses thumbnails)
├── search-page.js            # EXISTING: Search logic (loads thumbnails)
├── storage.js                # Customer-facing storage utilities
├── merchant/
│   ├── listings.html         # Merchant listing management
│   └── assets/js/merchant/
│       ├── listings.js       # ENHANCED: Merchant logic with better feedback
│       └── storage.js        # Merchant storage utilities
```

## Key Features Implemented

### 1. Customer-Facing Listings Page (`html/listings.html`)
A new comprehensive catalog page that displays all active listings with their photos.

**Features:**
- Responsive grid layout (1-3 columns based on screen size)
- Photo carousel for listings with multiple images
- Lazy loading with Intersection Observer API
- Error handling for failed photo loads
- Accessibility features (ARIA labels, semantic HTML, keyboard navigation)
- Mobile-responsive design with bottom navigation

**Technical Details:**
- Photos are loaded in batches of 5 to avoid overwhelming the API
- First image loads immediately, subsequent images lazy-load
- Carousel navigation updates image loading on-demand
- Fallback to graceful empty state when no photos available

### 2. Enhanced Merchant Upload Feedback
Improved `html/assets/js/merchant/listings.js` with:

**Upload Progress Indicators:**
- Color-coded status messages:
  - ✓ Green for successful uploads
  - ⚠ Orange for partial failures
  - ✗ Red for complete failures
- Clear messaging that photos are "immediately visible to customers"
- Extended display time (3 seconds) for better visibility
- Works for both file input and drag & drop uploads

**User Experience:**
- Real-time status updates during upload
- Visual feedback on upload completion
- Automatic thumbnail refresh after upload
- Detailed error reporting when uploads fail

### 3. Optimized Lazy Loading
Multiple levels of optimization for performance:

**Level 1: Native Lazy Loading**
- `loading="lazy"` attribute on images
- Supported by all modern browsers
- Minimal performance impact

**Level 2: Intersection Observer**
- Progressive image loading as user scrolls
- 50px root margin for preloading
- Unobserve after load to free memory
- Graceful fallback if not supported

**Level 3: Carousel Optimization**
- Only loads visible carousel images initially
- Loads next image when user navigates carousel
- Reduces initial page load time

### 4. Accessibility Standards

**Images:**
- Descriptive alt text with context (e.g., "Listing photo 1 of 3")
- Error state announcements
- Proper image aspect ratios

**Navigation:**
- ARIA labels on all interactive elements
- Semantic HTML structure (`<article>`, `<nav>`, etc.)
- Keyboard navigation support
- Screen reader announcements for dynamic content (`aria-live`)

**Responsive Design:**
- Mobile-first approach
- Touch-friendly button sizes (44x44px minimum)
- Safe area insets for notched devices
- Readable font sizes without zoom

## How Photo Sync Works

### Merchant Workflow:
1. Merchant uploads photos via `html/merchant/listings.html`
2. Photos are stored in Supabase Storage bucket `listing-photos/{listingId}/`
3. Upload status displayed with clear success/failure messages
4. Merchant sees thumbnails immediately with delete option

### Customer Workflow:
1. Customer visits `html/listings.html`, `html/search.html`, or `html/listing.html`
2. JavaScript fetches active listings from Supabase
3. For each listing, photos are loaded from storage
4. Photos display with lazy loading for performance
5. User can navigate photo carousels or view in lightbox

### Real-Time Sync:
Photos uploaded by merchants are immediately available because:
- No caching on storage URLs (or 1-hour cache with proper headers)
- Each page load fetches fresh data from Supabase
- Storage API provides direct access to latest uploads
- No build process or manual refresh required

## Performance Optimizations

### 1. Batch Processing
- Listings loaded in batches of 5
- Prevents API rate limiting
- Reduces memory pressure

### 2. Lazy Loading Strategy
- First image: immediate load
- Subsequent images: lazy load with Intersection Observer
- Carousel images: load on-demand when navigating

### 3. Image Error Handling
- Graceful fallback to placeholder
- Prevents broken image icons
- Maintains layout integrity

### 4. Memory Management
- Intersection Observer unobserves loaded images
- Carousel state stored in Map for efficient lookup
- Event delegation for photo navigation

## Testing Checklist

- [x] Merchant can upload photos via file input
- [x] Merchant can upload photos via drag & drop
- [x] Upload progress shows real-time status
- [x] Success/failure messages display correctly
- [x] Photos appear in merchant thumbnail view
- [x] Merchant can delete photos
- [ ] Customer sees photos on listings page
- [ ] Customer sees photos on listing detail page
- [ ] Customer sees thumbnails on search page
- [ ] Lazy loading works correctly
- [ ] Carousel navigation works
- [ ] Mobile responsive design works
- [ ] Accessibility features work with screen readers
- [ ] Error states display properly

## Browser Compatibility

**Minimum Requirements:**
- Chrome 76+ (Intersection Observer, ES6 modules)
- Firefox 69+
- Safari 12.1+
- Edge 79+

**Graceful Degradation:**
- Older browsers fall back to native lazy loading
- No Intersection Observer: all images load immediately
- CSS Grid: fallback to flexbox on very old browsers

## Configuration

### Environment Variables
Can be set via `window.ENV` or meta tags:

```javascript
// Bucket name (default: 'listing-photos')
window.ENV.LISTING_IMAGES_BUCKET = 'my-custom-bucket';

// Use signed URLs for private buckets (default: false)
window.ENV.USE_SIGNED_URLS = true;
```

### Meta Tags
```html
<meta name="listing-images-bucket" content="my-custom-bucket">
<meta name="use-signed-urls" content="true">
```

## Security Considerations

1. **XSS Prevention**: All user-generated content is escaped via `escapeHTML()`
2. **CORS**: Supabase Storage configured for same-origin requests
3. **Authentication**: Merchant pages require authenticated user
4. **Public Access**: Customer pages use public storage URLs
5. **File Validation**: Only image types accepted for upload

## Future Enhancements

Potential improvements for future iterations:

1. **Image Optimization**
   - Automatic resizing on upload
   - WebP conversion for smaller files
   - Responsive image sizes

2. **Caching Strategy**
   - Service Worker for offline support
   - IndexedDB for photo caching
   - CDN integration

3. **Advanced Features**
   - Photo reordering for merchants
   - Bulk upload with progress bars
   - Photo editing (crop, rotate, filter)
   - Video support

4. **Analytics**
   - Track photo view counts
   - Identify popular listings by photo engagement
   - A/B testing different photo layouts

## Troubleshooting

### Photos not appearing for customers
1. Verify Supabase Storage bucket is public or signed URLs enabled
2. Check browser console for CORS errors
3. Verify listing is marked as `active = true`
4. Check network tab for 403/404 errors on photo URLs

### Upload fails for merchants
1. Check file size limits (Supabase default: 50MB)
2. Verify merchant is authenticated
3. Check Storage bucket permissions
4. Review browser console for errors

### Slow performance
1. Verify lazy loading is working (check Network tab)
2. Consider reducing batch size if API is slow
3. Check image file sizes (should be <2MB)
4. Enable image optimization on upload

## Support

For issues or questions:
- Check browser console for error messages
- Review Supabase Storage logs
- Verify network requests in DevTools
- Check this documentation for configuration options
