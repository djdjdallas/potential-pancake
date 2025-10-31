-- Supabase Setup Script for Found Money App
-- Run this in your Supabase SQL Editor to create tables and RLS policies

-- 1. Create profiles table if it doesn't exist
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  gmail_connected BOOLEAN DEFAULT FALSE,
  gmail_access_token TEXT,
  gmail_refresh_token TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Service role can do anything" ON profiles;

-- 4. Create RLS policies for profiles
-- Allow users to read their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Allow users to insert their own profile
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Allow service role to do anything (for backend operations)
CREATE POLICY "Service role can do anything"
  ON profiles
  USING (auth.jwt() ->> 'role' = 'service_role');

-- 5. Create function to automatically create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, gmail_connected)
  VALUES (NEW.id, NEW.email, FALSE)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 7. Create trigger to automatically create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 8. Create money_found table if it doesn't exist
CREATE TABLE IF NOT EXISTS money_found (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  company_name TEXT NOT NULL,
  description TEXT,
  amount TEXT,
  amount_numeric DECIMAL(10, 2),
  source_type TEXT,
  status TEXT DEFAULT 'unclaimed',
  claim_url TEXT,
  claimed_date TIMESTAMP WITH TIME ZONE,
  received_amount DECIMAL(10, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. Enable RLS for money_found
ALTER TABLE money_found ENABLE ROW LEVEL SECURITY;

-- 10. Drop existing policies for money_found
DROP POLICY IF EXISTS "Users can view own money" ON money_found;
DROP POLICY IF EXISTS "Users can insert own money" ON money_found;
DROP POLICY IF EXISTS "Users can update own money" ON money_found;
DROP POLICY IF EXISTS "Service role can manage all money" ON money_found;

-- 11. Create RLS policies for money_found
CREATE POLICY "Users can view own money"
  ON money_found FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own money"
  ON money_found FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own money"
  ON money_found FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all money"
  ON money_found
  USING (auth.jwt() ->> 'role' = 'service_role');

-- 12. Create addresses table if it doesn't exist
CREATE TABLE IF NOT EXISTS addresses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  street TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  years_lived_from INTEGER,
  years_lived_to INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 13. Enable RLS for addresses
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;

-- 14. Create RLS policies for addresses
DROP POLICY IF EXISTS "Users can manage own addresses" ON addresses;
CREATE POLICY "Users can manage own addresses"
  ON addresses
  USING (auth.uid() = user_id);

-- Done! Your Supabase database is now set up.
