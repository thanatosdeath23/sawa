-- ============================================================
-- SAWA — Categories Restructure
--
-- HOW TO RUN:
--   1. Open Supabase Dashboard → SQL Editor → "New query"
--   2. Paste this entire file
--   3. Click "Run"
--   4. (Optional) Re-run seed.sql afterwards to populate posts
--      across the new categories.
--
-- WHAT IT DOES:
--   • Adds a sort_order column so categories can be reordered
--     without renumbering primary keys (which would break posts).
--   • Renames "Power & Water" → "Utilities" so it can also cover
--     fuel and internet (both real Lebanese pain points).
--   • Rewrites every category description for clarity.
--   • Adds 5 new categories that came up as obvious gaps:
--       Transportation, Clothing, Education,
--       Services & Skills, Emotional Support.
--
-- Safe to re-run — every statement is idempotent.
-- ============================================================


-- 1. Add the sort_order column if it isn't already there
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS sort_order INT;


-- 2. Refresh existing categories (better copy + explicit ordering) -----

UPDATE public.categories SET
  description = 'Urgent blood donation requests, or healthy donors offering to give.',
  sort_order  = 1
WHERE name = 'Blood';

UPDATE public.categories SET
  description = 'Medications, medical equipment, doctor visits, or specialist referrals.',
  sort_order  = 2
WHERE name = 'Medical';

UPDATE public.categories SET
  description = 'Groceries, prepared meals, baby formula, or weekly food parcels.',
  sort_order  = 3
WHERE name = 'Food';

UPDATE public.categories SET
  description = 'Temporary shelter, spare rooms, or longer-term accommodation.',
  sort_order  = 4
WHERE name = 'Housing';

-- Rename "Power & Water" → "Utilities" and widen its scope to fuel + internet
UPDATE public.categories SET
  name        = 'Utilities',
  description = 'Electricity, water delivery, fuel for generators, or internet access.',
  sort_order  = 5
WHERE name IN ('Power & Water', 'Utilities');

-- "Other" stays last forever — sort_order = 99 leaves room for future categories
UPDATE public.categories SET
  description = 'Anything else the community can help with.',
  sort_order  = 99
WHERE name = 'Other';


-- 3. Add the 5 new categories (only if they don't exist yet) -----------

INSERT INTO public.categories (name, icon, description, sort_order)
SELECT 'Transportation', '🚗',
       'Rides between cities, fuel sharing, vehicle repair, or delivery help.', 6
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE name = 'Transportation');

INSERT INTO public.categories (name, icon, description, sort_order)
SELECT 'Clothing', '👕',
       'Winter clothes, school uniforms, baby clothes, or shoes — given or needed.', 7
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE name = 'Clothing');

INSERT INTO public.categories (name, icon, description, sort_order)
SELECT 'Education', '📚',
       'Tutoring, school books, university fees, or supplies for students.', 8
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE name = 'Education');

INSERT INTO public.categories (name, icon, description, sort_order)
SELECT 'Services & Skills', '🛠️',
       'Free professional help — translation, legal aid, IT, repair, trade skills.', 9
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE name = 'Services & Skills');

INSERT INTO public.categories (name, icon, description, sort_order)
SELECT 'Emotional Support', '💚',
       'Peer support, listening, or connection to mental-health resources.', 10
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE name = 'Emotional Support');
