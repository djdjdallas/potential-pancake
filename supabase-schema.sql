-- Found Money Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table is handled by Supabase Auth

-- User profiles
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  first_name TEXT,
  last_name TEXT,
  date_of_birth DATE,
  phone TEXT,
  gmail_connected BOOLEAN DEFAULT FALSE,
  gmail_access_token TEXT,
  gmail_refresh_token TEXT,
  subscription_status TEXT DEFAULT 'trial',
  subscription_tier TEXT, -- 'monthly' or 'yearly'
  trial_ends_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Past addresses (for unclaimed property searches)
CREATE TABLE IF NOT EXISTS addresses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  street TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  years_lived TEXT,
  is_current BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Money sources found
CREATE TABLE IF NOT EXISTS money_found (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL, -- 'class_action', 'unclaimed_property', 'rebate', etc.
  amount TEXT, -- "$127.50" or "Unknown"
  amount_numeric DECIMAL(10,2), -- For sorting
  company_name TEXT,
  description TEXT,
  eligibility_requirements TEXT,
  claim_url TEXT,
  claim_deadline DATE,
  status TEXT DEFAULT 'unclaimed', -- 'unclaimed', 'claimed', 'received'
  claimed_date DATE,
  received_date DATE,
  received_amount DECIMAL(10,2),
  metadata JSONB, -- Additional data specific to money type
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Claim forms
CREATE TABLE IF NOT EXISTS claim_forms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  money_found_id UUID REFERENCES money_found(id) ON DELETE CASCADE,
  form_data JSONB, -- User-filled form data
  pdf_url TEXT, -- Generated PDF URL
  status TEXT DEFAULT 'draft', -- 'draft', 'completed', 'submitted'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Email scan results
CREATE TABLE IF NOT EXISTS email_scans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  scan_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  emails_scanned INTEGER,
  opportunities_found INTEGER,
  status TEXT DEFAULT 'completed'
);

-- Analytics events
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id),
  event_name TEXT NOT NULL,
  event_properties JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_money_found_user_id ON money_found(user_id);
CREATE INDEX idx_money_found_status ON money_found(status);
CREATE INDEX idx_money_found_amount ON money_found(amount_numeric DESC);
CREATE INDEX idx_addresses_user_id ON addresses(user_id);
CREATE INDEX idx_claim_forms_user_id ON claim_forms(user_id);
CREATE INDEX idx_analytics_events_user_id ON analytics_events(user_id);
CREATE INDEX idx_analytics_events_name ON analytics_events(event_name);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_found ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Profiles policies
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Addresses policies
CREATE POLICY "Users can manage own addresses"
  ON addresses FOR ALL
  USING (auth.uid() = user_id);

-- Money found policies
CREATE POLICY "Users can view own money_found"
  ON money_found FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own money_found"
  ON money_found FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own money_found"
  ON money_found FOR UPDATE
  USING (auth.uid() = user_id);

-- Claim forms policies
CREATE POLICY "Users can manage own claim_forms"
  ON claim_forms FOR ALL
  USING (auth.uid() = user_id);

-- Email scans policies
CREATE POLICY "Users can view own email_scans"
  ON email_scans FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own email_scans"
  ON email_scans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Analytics events policies
CREATE POLICY "Users can insert analytics events"
  ON analytics_events FOR INSERT
  WITH CHECK (true);

-- Create function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_money_found_updated_at BEFORE UPDATE ON money_found
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_claim_forms_updated_at BEFORE UPDATE ON claim_forms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, trial_ends_at)
  VALUES (NEW.id, NEW.email, NOW() + INTERVAL '7 days');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();