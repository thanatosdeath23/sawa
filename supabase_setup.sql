-- ============================================================
-- supabase_setup.sql — SAWA Database Setup
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ============================================================


-- ============================================================
-- 1. PROFILES TABLE
-- Stores each user's display name. Created automatically on sign-up.
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID    REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name   TEXT    NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- 2. CATEGORIES TABLE
-- Fixed list of 6 help categories (never changes after setup).
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id          SERIAL  PRIMARY KEY,
  name        TEXT    NOT NULL,
  icon        TEXT    NOT NULL,   -- emoji used in the UI
  description TEXT
);

-- Insert the 6 fixed categories (skip if already present)
INSERT INTO categories (name, icon, description) VALUES
  ('Blood',       '🩸', 'Blood donation requests and offers'),
  ('Medical',     '🏥', 'Medical supplies, equipment, and assistance'),
  ('Housing',     '🏠', 'Shelter, housing needs, and offers'),
  ('Power & Water','⚡', 'Generator, fuel, water supply needs'),
  ('Food',        '🍞', 'Food, water, and essential supplies'),
  ('Other',       '🤝', 'Any other type of help or need')
ON CONFLICT DO NOTHING;


-- ============================================================
-- 3. POSTS TABLE
-- Main table for all help requests and offers.
-- ============================================================
CREATE TABLE IF NOT EXISTS posts (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  category_id           INTEGER     REFERENCES categories(id) NOT NULL,
  type                  TEXT        CHECK (type IN ('need', 'offer')) NOT NULL,
  title                 TEXT        NOT NULL,
  description           TEXT,
  location              TEXT        NOT NULL,
  contact_phone         TEXT,
  show_contact_to_guests BOOLEAN    DEFAULT FALSE,
  is_resolved           BOOLEAN     DEFAULT FALSE,
  expires_at            TIMESTAMPTZ NOT NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- Controls who can read, write, update, and delete each row.
-- Enable RLS first, then add policies.
-- ============================================================
ALTER TABLE profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts       ENABLE ROW LEVEL SECURITY;

-- PROFILES: anyone can read; users manage only their own row
CREATE POLICY "profiles_read_all"   ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);

-- CATEGORIES: public read-only (no one inserts via app — only via SQL)
CREATE POLICY "categories_read_all" ON categories FOR SELECT USING (true);

-- POSTS: public read; logged-in create; owners update/delete
CREATE POLICY "posts_read_all"    ON posts FOR SELECT USING (true);
CREATE POLICY "posts_insert_auth" ON posts FOR INSERT  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "posts_update_own"  ON posts FOR UPDATE  USING (auth.uid() = user_id);
CREATE POLICY "posts_delete_own"  ON posts FOR DELETE  USING (auth.uid() = user_id);


-- ============================================================
-- 5. posts_public VIEW
-- A convenient joined view used by the frontend.
-- Hides contact_phone from guests (anon users) when
-- show_contact_to_guests = FALSE.
-- auth.uid() works here because Supabase/PostgREST sets the
-- JWT claims before each query, so the function returns NULL
-- for anonymous requests and the user's UUID for signed-in ones.
-- ============================================================
CREATE OR REPLACE VIEW posts_public AS
SELECT
  p.id,
  p.user_id,
  p.category_id,
  p.type,
  p.title,
  p.description,
  p.location,
  -- Reveal phone only when: (a) the owner is looking, or
  -- (b) the poster chose to share it with guests
  CASE
    WHEN p.show_contact_to_guests = TRUE  THEN p.contact_phone
    WHEN auth.uid() = p.user_id           THEN p.contact_phone
    WHEN auth.uid() IS NOT NULL           THEN p.contact_phone
    ELSE NULL
  END AS contact_phone,
  p.show_contact_to_guests,
  p.is_resolved,
  p.expires_at,
  p.created_at,
  pr.full_name  AS author_name,
  c.name        AS category_name,
  c.icon        AS category_icon
FROM posts p
LEFT JOIN profiles   pr ON pr.id  = p.user_id
LEFT JOIN categories c  ON c.id   = p.category_id
-- Only return posts that are still active and not resolved
WHERE p.expires_at > NOW()
  AND p.is_resolved = FALSE;


-- ============================================================
-- 6. TRIGGER: auto-create profile row on new user sign-up
-- When someone registers via Supabase Auth, this trigger fires
-- and inserts a matching row into the profiles table using the
-- full_name they submitted during registration.
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Anonymous')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach the trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
