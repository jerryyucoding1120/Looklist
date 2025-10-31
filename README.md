# Looklist

## Database Setup

### Profile Management

The application requires that each authenticated user has a corresponding row in the `profiles` table, as the `listings.owner` column has a foreign key constraint referencing `profiles(id)`.

#### Recommended: Automatic Profile Creation

To ensure profiles are created automatically when users sign up, add this trigger to your Supabase database:

```sql
-- Function to create a profile for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call the function on user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

#### Row Level Security (RLS) Policies

The following RLS policies are recommended for the `profiles` and `listings` tables:

```sql
-- Enable RLS on profiles table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Allow users to view all profiles
CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (true);

-- Allow users to insert their own profile
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Enable RLS on listings table
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

-- Allow users to view all listings
CREATE POLICY "Listings are viewable by everyone"
  ON public.listings FOR SELECT
  USING (true);

-- Allow users to insert listings only with their own user ID as owner
CREATE POLICY "Users can insert their own listings"
  ON public.listings FOR INSERT
  WITH CHECK (auth.uid() = owner);

-- Allow users to update their own listings
CREATE POLICY "Users can update their own listings"
  ON public.listings FOR UPDATE
  USING (auth.uid() = owner)
  WITH CHECK (auth.uid() = owner);

-- Allow users to delete their own listings
CREATE POLICY "Users can delete their own listings"
  ON public.listings FOR DELETE
  USING (auth.uid() = owner);
```

### Frontend Profile Management

As a fallback (or if the database trigger is not set up), the frontend code in `html/assets/js/merchant/listings.js` includes an `ensureProfileExists()` helper that attempts to upsert a profile row before creating a listing. This provides defense-in-depth but requires appropriate RLS policies to allow profile insertion.

### Troubleshooting

If users encounter errors when creating listings:

1. **Foreign Key Constraint Error (`listings_owner_fkey`)**: This means the user has no profile row. Ensure the trigger above is installed, or manually insert a profile row.

2. **RLS Policy Error**: If the frontend's `ensureProfileExists()` fails due to RLS, verify that the "Users can insert their own profile" policy is active.

3. **NOT NULL Constraint Error**: Ensure required fields (name, category, etc.) are provided in the listing form.

The frontend error handling will display detailed error messages including hints and details from the database to aid in debugging.

## Time Slots Management

The application supports dynamic time slot generation for merchant listings. Merchants can generate multiple time slots across a date range with configurable working hours, duration, and day-of-week filters.

### Database Schema

The `time_slots` table should be created with the following structure:

```sql
-- Create time_slots table
CREATE TABLE IF NOT EXISTS public.time_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  price DECIMAL(10, 2),
  capacity INTEGER DEFAULT 1,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'booked', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create unique index to prevent duplicate slots
CREATE UNIQUE INDEX IF NOT EXISTS time_slots_unique_slot 
  ON public.time_slots(listing_id, starts_at, ends_at);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS time_slots_listing_id_idx ON public.time_slots(listing_id);
CREATE INDEX IF NOT EXISTS time_slots_starts_at_idx ON public.time_slots(starts_at);
CREATE INDEX IF NOT EXISTS time_slots_status_idx ON public.time_slots(status);
```

### Row Level Security (RLS) Policies for Time Slots

```sql
-- Enable RLS on time_slots table
ALTER TABLE public.time_slots ENABLE ROW LEVEL SECURITY;

-- Allow public users to view open time slots
CREATE POLICY "Public users can view open time slots"
  ON public.time_slots FOR SELECT
  USING (status = 'open');

-- Allow merchants to view all slots for their own listings
CREATE POLICY "Merchants can view their own listing slots"
  ON public.time_slots FOR SELECT
  USING (
    listing_id IN (
      SELECT id FROM public.listings WHERE owner = auth.uid()
    )
  );

-- Allow merchants to insert slots for their own listings
CREATE POLICY "Merchants can insert slots for their own listings"
  ON public.time_slots FOR INSERT
  WITH CHECK (
    listing_id IN (
      SELECT id FROM public.listings WHERE owner = auth.uid()
    )
  );

-- Allow merchants to update slots for their own listings
CREATE POLICY "Merchants can update slots for their own listings"
  ON public.time_slots FOR UPDATE
  USING (
    listing_id IN (
      SELECT id FROM public.listings WHERE owner = auth.uid()
    )
  )
  WITH CHECK (
    listing_id IN (
      SELECT id FROM public.listings WHERE owner = auth.uid()
    )
  );

-- Allow merchants to delete slots for their own listings
CREATE POLICY "Merchants can delete slots for their own listings"
  ON public.time_slots FOR DELETE
  USING (
    listing_id IN (
      SELECT id FROM public.listings WHERE owner = auth.uid()
    )
  );
```

### Edge Function Setup

The `upsert-slots` Edge Function requires the following environment variables to be set in your Supabase project:

1. **SUPABASE_URL**: Your Supabase project URL (automatically available)
2. **SUPABASE_SERVICE_ROLE_KEY**: Your Supabase service role key (automatically available)

These are typically available by default in Supabase Edge Functions. If you need to set them manually:

```bash
# Using Supabase CLI
supabase secrets set SUPABASE_URL=your-project-url
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Deployment

To deploy the Edge Function:

```bash
# Deploy the upsert-slots function
supabase functions deploy upsert-slots
```

### Usage

Merchants can generate time slots from the "My Listings" page:

1. Navigate to `/merchant/listings.html`
2. Scroll to the "Generate Time Slots" section
3. Select a listing from the dropdown
4. Configure date range, working hours, duration, and pricing
5. Select which days of the week to generate slots for
6. Click "Generate Slots"

The system will:
- Generate all time slots based on the specified parameters
- Send them to the `upsert-slots` Edge Function
- Skip any duplicate slots (using the unique index)
- Display a success message with the count of inserted and skipped slots

### Security

- The Edge Function validates that the authenticated user owns the listing before allowing slot insertion
- RLS policies ensure merchants can only manage slots for their own listings
- Public users can only view slots with `status = 'open'`
- No sensitive credentials or service role keys are exposed to the frontend
