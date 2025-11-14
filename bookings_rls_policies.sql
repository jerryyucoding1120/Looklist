-- Bookings Row Level Security (RLS) Policy Unification
-- This migration removes redundant/overlapping policies and establishes a clear naming & ownership model

-- ===================================================================
-- STEP 1: DROP all existing redundant policies on public.bookings
-- ===================================================================

DROP POLICY IF EXISTS "bookings_customer_insert" ON public.bookings;
DROP POLICY IF EXISTS "bookings_customer_select" ON public.bookings;
DROP POLICY IF EXISTS "bookings_customer_select_own" ON public.bookings;
DROP POLICY IF EXISTS "bookings_listing_owner_select" ON public.bookings;
DROP POLICY IF EXISTS "bookings_merchant_select_own" ON public.bookings;
DROP POLICY IF EXISTS "bookings_party_update_status" ON public.bookings;

-- ===================================================================
-- STEP 2: CREATE unified policies with consistent naming pattern
-- ===================================================================

-- Policy: Customers can insert only their own bookings
-- Ensures customer_id matches authenticated user on both INSERT and WITH CHECK
CREATE POLICY "bookings_customer_insert" ON public.bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = customer_id);

-- Policy: Customers can select only their own bookings
-- Allows customers to view bookings where they are the customer
CREATE POLICY "bookings_customer_select_own" ON public.bookings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = customer_id);

-- Policy: Merchants can select bookings for their listings
-- Allows merchants to view bookings where they are the merchant
CREATE POLICY "bookings_merchant_select_own" ON public.bookings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = merchant_id);

-- Policy: Both customer and merchant can update booking status
-- Allows either party to update status; business rules enforced by application/RPC
-- WITH CHECK (TRUE) allows any status value (application validates business logic)
CREATE POLICY "bookings_owner_update_status" ON public.bookings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IN (customer_id, merchant_id))
  WITH CHECK (TRUE);

-- ===================================================================
-- OPTIONAL: Listing owner policy (if ownership differs from merchant_id)
-- ===================================================================
-- Uncomment if listing ownership is managed separately from merchant_id.
-- This would allow listing owners to view bookings even if they are not the merchant.
-- Note: listings.owner references public.profiles(id), which has same id as auth.users(id)
--
-- CREATE POLICY "bookings_listing_owner_select" ON public.bookings
--   FOR SELECT
--   TO authenticated
--   USING (
--     EXISTS (
--       SELECT 1 FROM public.listings
--       WHERE listings.id = bookings.listing_id
--       AND listings.owner = auth.uid()
--     )
--   );

-- ===================================================================
-- VERIFICATION
-- ===================================================================
-- After applying this migration, verify:
-- 1. Only 4 active policies exist on public.bookings (or 5 if optional policy enabled)
-- 2. No redundant SELECT policies
-- 3. Consistent naming: all policies start with "bookings_"
-- 4. Least privilege: users can only access their own data
-- 5. Business logic separation: status updates allowed for both parties, validation in app layer
