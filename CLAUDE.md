# SAWA — Project Guide for Claude

## What is Sawa?
Sawa (سوا, "together" in Arabic) is a community emergency help platform for Lebanon. Users can post help requests or offers across 6 categories. It is a **university course project** that will be presented to a jury — code must be clean, well-commented, and easy to explain.

## Tech Stack
- **Frontend:** Pure HTML + CSS + Vanilla JavaScript — NO frameworks, NO npm, NO build step
- **Database + Auth:** Supabase (PostgreSQL + Supabase Auth)
- **Hosting:** Will deploy to Vercel as a static site
- **Font:** Inter from Google Fonts CDN

## File Structure
```
sawa/
├── index.html          Homepage (hero, category cards, latest posts)
├── category.html       Browse posts, create/edit/delete/resolve via modal
├── login.html          Sign In / Register (email + password)
├── style.css           Shared stylesheet (all pages use this)
├── app.js              Shared JS — Supabase client, auth, utilities
├── supabase_setup.sql  DB schema + RLS policies (already run in Supabase)
├── README.md           Setup instructions
└── .gitignore
```

## Supabase Project
- **URL:** `https://mtzowhixqtvssrdhnyvr.supabase.co`
- **Anon key:** stored in `app.js` as `SUPABASE_ANON_KEY`
- **SQL setup:** already run — all tables, views, and triggers exist

## Database Schema
- `profiles` — id (FK auth.users), full_name, created_at
- `categories` — id, name, icon (emoji), description — 6 fixed rows pre-inserted
- `posts` — id, user_id, category_id, type (need/offer), title, description, location, contact_phone, show_contact_to_guests, is_resolved, expires_at, created_at
- `posts_public` — VIEW joining posts + profiles + categories; hides contact_phone from guests when show_contact_to_guests = false

## The 6 Categories (pre-inserted, fixed)
Blood 🩸, Medical 🏥, Housing 🏠, Power & Water ⚡, Food 🍞, Other 🤝

## RLS Rules
- Anyone can read posts and categories
- Only logged-in users can create posts
- Only the post owner can update/delete their post
- Auto-trigger creates a `profiles` row when a new user registers

## CRITICAL: Variable Naming
The Supabase CDN script sets a global `var supabase`. To avoid a redeclaration clash, our Supabase client is named **`db`** (not `supabase`):
```js
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```
All queries use `db.from(...)` and `db.auth.*()`. Never rename this back to `supabase`.

## app.js — Shared Utilities
Functions available on every page (loaded before inline scripts):
- `db` — the Supabase client
- `currentUser` — null for guests, Supabase User object when logged in
- `initAuth()` — restores session from localStorage, updates navbar
- `updateNavbar()` — swaps Login button ↔ email + Logout
- `signOut()` — signs out and redirects to index.html
- `showToast(message, type)` — slide-up notification (type: 'success', 'error', '')
- `timeAgo(dateStr)` — formats timestamps as "2h ago", "3d ago" etc.
- `renderPostCard(post, isOwner)` — returns HTML string for a post card
- `escapeHtml(str)` — XSS prevention, always use before inserting user content into innerHTML

## Design System (style.css)
- **Primary:** `#16a34a` cedar green
- **Light bg:** `#f0fdf4`
- **Text:** `#111827`
- **Page bg:** `#f9fafb`
- **Urgent/red:** `#ef4444`
- **Border radius:** `--radius: 10px`, `--radius-sm: 6px`, `--radius-lg: 16px`
- Navbar has frosted glass effect (`backdrop-filter: blur`)
- Hero has a dot-grid background pattern
- Cards have hover lift effect

## Key Rules for This Project
1. **No frameworks, no npm** — everything runs from the file system or a simple local server
2. **Always use `escapeHtml()`** before inserting user content into innerHTML (XSS prevention)
3. **Always use `db`** not `supabase` for the Supabase client
4. **Comments are required** — the student must be able to explain every part to a jury
5. The Supabase CDN is loaded before `app.js` in every HTML file: `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>`
6. Posts are fetched from `posts_public` (the VIEW) for display; fetched from `posts` directly when editing
