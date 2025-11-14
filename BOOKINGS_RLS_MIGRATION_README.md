# Bookings RLS Policy Migration Guide

## Overview

This migration unifies and simplifies Row Level Security (RLS) policies on the `public.bookings` table, removing redundant/overlapping policies and establishing a clear naming and ownership model.

## Problem Addressed

### Before Migration (6 Policies - Redundant/Overlapping):
1. `bookings_customer_insert` (INSERT, authenticated)
2. `bookings_customer_select` (SELECT, authenticated) ❌ Redundant
3. `bookings_customer_select_own` (SELECT, authenticated) ❌ Overlapping with #2
4. `bookings_listing_owner_select` (SELECT, authenticated) ❌ Overlapping with merchant_select_own
5. `bookings_merchant_select_own` (SELECT, authenticated)
6. `bookings_party_update_status` (UPDATE, authenticated)

**Issues:**
- Multiple overlapping SELECT policies (customer_select vs customer_select_own)
- Potential visibility issues if merchant_id == listing owner
- Inconsistent naming conventions
- Unclear ownership model

### After Migration (4 Policies - Clean/Unified):
1. `bookings_customer_insert` - Customers insert only their own bookings
2. `bookings_customer_select_own` - Customers select only their own bookings
3. `bookings_merchant_select_own` - Merchants select bookings for their listings
4. `bookings_owner_update_status` - Both parties can update status (app validates business rules)

**Benefits:**
- ✅ No redundant policies
- ✅ Consistent naming: all start with `bookings_`
- ✅ Clear ownership model
- ✅ Least privilege access
- ✅ Better maintainability

## How to Apply

### Prerequisites
- PostgreSQL client (psql) with access to your Supabase database
- Appropriate database permissions to DROP and CREATE policies
- Backup of current policies (recommended)

### Option 1: Via Supabase Dashboard

1. Navigate to your Supabase project
2. Go to **SQL Editor**
3. Copy the contents of `bookings_rls_policies.sql`
4. Paste into the SQL editor
5. Click **Run** to execute

### Option 2: Via Command Line

```bash
# Connect to your database
psql -h YOUR_DB_HOST -U YOUR_DB_USER -d YOUR_DB_NAME

# Run the migration
\i bookings_rls_policies.sql

# Or pipe the file directly
psql -h YOUR_DB_HOST -U YOUR_DB_USER -d YOUR_DB_NAME < bookings_rls_policies.sql
```

### Option 3: Via Supabase CLI

```bash
# If using Supabase CLI
supabase db reset  # Reset database (use with caution)

# Or create a new migration
supabase migration new bookings_rls_unification
# Then copy the contents of bookings_rls_policies.sql into the new migration file
supabase db push
```

## Verification Steps

After applying the migration, verify the changes:

### 1. Check Policy Count
```sql
SELECT COUNT(*) 
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename = 'bookings';
-- Expected: 4 policies (or 5 if optional policy is enabled)
```

### 2. List All Policies
```sql
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename = 'bookings'
ORDER BY policyname;
```

Expected output:
- `bookings_customer_insert` (INSERT)
- `bookings_customer_select_own` (SELECT)
- `bookings_merchant_select_own` (SELECT)
- `bookings_owner_update_status` (UPDATE)

### 3. Verify Policy Names
```sql
SELECT policyname 
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename = 'bookings'
  AND policyname LIKE 'bookings_%'
ORDER BY policyname;
-- All policies should start with 'bookings_'
```

### 4. Test Customer Access
```sql
-- As a customer user, you should only see your own bookings
SELECT COUNT(*) 
FROM public.bookings 
WHERE customer_id = auth.uid();
-- Should return count of your bookings
```

### 5. Test Merchant Access
```sql
-- As a merchant user, you should see bookings for your listings
SELECT COUNT(*) 
FROM public.bookings 
WHERE merchant_id = auth.uid();
-- Should return count of bookings for your listings
```

## Rollback Plan

If you need to rollback this migration:

1. **Backup Current State First:**
   ```sql
   -- Document current policies before rollback
   SELECT * FROM pg_policies 
   WHERE schemaname = 'public' AND tablename = 'bookings';
   ```

2. **Recreate Old Policies:**
   You would need to recreate the 6 original policies based on your backup. This is NOT recommended as the old policies had redundancy issues.

3. **Better Alternative:**
   Instead of rollback, adjust the policies as needed based on your specific requirements.

## Optional: Listing Owner Policy

If your business logic requires listing owners (separate from merchant_id) to view bookings, uncomment the optional policy in the SQL file:

```sql
-- Uncomment this section in bookings_rls_policies.sql
CREATE POLICY "bookings_listing_owner_select" ON public.bookings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.listings
      WHERE listings.id = bookings.listing_id
      AND listings.owner = auth.uid()
    )
  );
```

This will add a 5th policy allowing listing owners to view bookings.

## Security Considerations

### ✅ What's Protected:
- Customers can only insert bookings as themselves (not impersonate others)
- Customers can only view their own bookings
- Merchants can only view bookings for their listings
- Update permissions limited to involved parties

### ⚠️ Application-Level Validation Still Required:
- Status transition rules (e.g., can't go from 'completed' to 'pending')
- Cancellation policies and timing
- Payment status validation
- Business logic for status updates

The `WITH CHECK (TRUE)` on the UPDATE policy means RLS allows any status value, but your application/RPC should enforce proper business rules.

## Support

If you encounter issues:

1. Check PostgreSQL error logs
2. Verify you have sufficient permissions
3. Ensure no active connections are holding locks on the policies
4. Test with a non-production database first

## Migration Metadata

- **File**: `bookings_rls_policies.sql`
- **Target Table**: `public.bookings`
- **Policies Dropped**: 6
- **Policies Created**: 4
- **Optional Policies**: 1 (commented out)
- **Idempotent**: Yes (uses `DROP POLICY IF EXISTS`)
- **Reversible**: Manual rollback required
- **Breaking Changes**: None (maintains same access patterns)
