# Authentication & Supabase Client Usage

## Overview

This document describes the standardized pattern for using Supabase authentication and client instances across the Looklist application.

## Unified Client Pattern

**⚠️ IMPORTANT: Always use the unified Supabase client. Do NOT create new client instances.**

### The Single Source of Truth

All Supabase operations must use the unified client exported from:

```javascript
import { sb } from './assets/js/supabase-client.js';
```

Or for files in subdirectories:

```javascript
// From html/ root
import { sb } from './supabase-client.js';

// From html/assets/js/merchant/
import { sb } from '../supabase-client.js';
```

### Why This Matters

Using a single, shared Supabase client instance across all pages ensures:

1. **Consistent Session State**: All pages share the same authentication session, preventing intermittent sign-outs when navigating
2. **Proper Authorization Headers**: Edge Function invocations automatically include the JWT token, preventing "You did not provide an API key" Stripe errors
3. **Centralized Configuration**: Single place to configure storage, auto-refresh, and session detection
4. **No Race Conditions**: Eliminates conflicts between multiple client instances trying to handle URL tokens or manage storage

## Client Architecture

### Primary Client File

**Location**: `html/assets/js/supabase-client.js`

This file:
- Creates the single Supabase client instance
- Configures authentication storage (localStorage with fallback to in-memory)
- Exports three client references (all point to the same instance):
  - `sb` - Default persistent client (recommended)
  - `spLocal` - Persistent client (localStorage-based)
  - `spSession` - Session-only client (sessionStorage-based)
  - `__SUPABASE_URL` - For debugging/verification

### Re-export Shims

For convenience, two re-export shims exist:

1. **`html/supabase-client.js`**: Re-exports for files in the `html/` root
2. **`html/assets/js/merchant/supabase-client.js`**: Re-exports for merchant modules

These simply re-export the unified client - they do NOT create new instances.

## Usage Examples

### Basic Database Query

```javascript
import { sb } from './supabase-client.js';

// Fetch listings
const { data, error } = await sb
  .from('listings')
  .select('*')
  .eq('active', true);
```

### Storage Operations

```javascript
import { sb } from './supabase-client.js';

// List files in storage bucket
const { data, error } = await sb.storage
  .from('listing-photos')
  .list('folder-name');

// Get public URL
const { data: urlData } = sb.storage
  .from('listing-photos')
  .getPublicUrl('path/to/file.jpg');
```

### Edge Function Invocation

**✅ CORRECT: Using unified client**

```javascript
import { sb } from './supabase-client.js';

// The unified client automatically attaches Authorization header with JWT
const { data, error } = await sb.functions.invoke('create-checkout-session', {
  body: {
    listing_id: listingId,
    availability_id: slotId,
    lld_to_redeem: amount,
  },
});
```

**❌ INCORRECT: Manual fetch without unified client**

```javascript
// DON'T DO THIS - Missing or incorrect Authorization header
const response = await fetch('https://...supabase.co/functions/v1/function-name', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    // Authorization header may be missing or use wrong session!
  },
  body: JSON.stringify(payload),
});
```

### Checking Authentication Status

```javascript
import { sb } from './supabase-client.js';

// Get current session
const { data: { session }, error } = await sb.auth.getSession();

if (session) {
  console.log('User is signed in:', session.user.email);
  const token = session.access_token;
} else {
  console.log('User is not signed in');
}
```

## What NOT to Do

### ❌ Do NOT Create New Client Instances

```javascript
// WRONG - Creates separate client with different session state
import { createClient } from '@supabase/supabase-js';
const myClient = createClient(url, key);
```

### ❌ Do NOT Use UMD Script Tags

```html
<!-- WRONG - Conflicts with ES module imports -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js/dist/umd/supabase.min.js"></script>
```

### ❌ Do NOT Hardcode Anon Keys

```javascript
// WRONG - Duplicates configuration, creates maintenance burden
const SUPABASE_ANON_KEY = 'eyJhbGci...';
```

## Session Handling

### URL Token Detection

The unified client is configured with `detectSessionInUrl: false` because URL token handling is done manually in `auth.js`. This prevents race conditions and ensures proper token extraction from magic links and OAuth redirects.

If you need to handle authentication redirects, use the `authInit()` function from `auth.js`:

```javascript
import { authInit } from './auth.js';

authInit().then(({ user, session }) => {
  if (user) {
    // User is authenticated
  }
});
```

### Storage Persistence

The unified client uses localStorage by default with automatic fallback to in-memory storage if localStorage is unavailable (e.g., private browsing mode). This ensures:

- Sessions persist across page reloads and browser restarts
- Graceful degradation when storage is blocked
- No errors in restricted environments

## Troubleshooting

### "You did not provide an API key" from Stripe

**Cause**: Edge Function received request without Authorization header

**Solution**: Ensure you're using `sb.functions.invoke()` instead of direct `fetch()`. The unified client automatically attaches the JWT.

### Session Lost on Navigation

**Cause**: Multiple client instances with different storage backends

**Solution**: Verify all pages import from `./supabase-client.js` or the appropriate re-export shim. No page should call `createClient()`.

### Intermittent Authentication Issues

**Cause**: Race conditions between multiple client instances handling URL tokens

**Solution**: Remove any custom client instances. Let `auth.js` handle URL token processing, and use the unified client for all other operations.

## Verification Checklist

Before deploying changes:

- [ ] No file outside `html/assets/js/supabase-client.js` calls `createClient()`
- [ ] No UMD script tag for Supabase in any HTML file
- [ ] No hardcoded `SUPABASE_ANON_KEY` outside unified client file
- [ ] All Edge Function calls use `sb.functions.invoke()`
- [ ] Session persists when navigating between pages
- [ ] Checkout flow completes successfully (Stripe session created)
- [ ] Only one set of Supabase storage keys in browser DevTools → Application → Storage

## Getting Help

If you encounter authentication or session issues:

1. Check browser DevTools → Console for Supabase client initialization logs
2. Verify exactly one client is initialized (look for `[supabase-client] Using project:` log)
3. Check Application → Local Storage for Supabase keys (should only have one set)
4. Ensure the problematic page imports from unified client, not creating its own

## Migration Notes

### Previous Architecture

Previously, some pages created their own "public" or "anonymous" client instances with `persistSession: false`. This caused:

- Session state inconsistencies
- Missing Authorization headers on Edge Function calls
- Downstream Stripe errors

### Current Architecture

All pages now use the same persistent client instance, ensuring:

- Single source of session truth
- Automatic JWT attachment to protected calls
- Seamless navigation between customer and merchant pages
