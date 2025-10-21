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
