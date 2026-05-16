# Sawa — Emergency Help Platform for Lebanon

**Sawa** (سوا, "together" in Arabic) is a community platform where people can post help requests or offers across 6 categories: Blood, Medical, Housing, Power & Water, Food, and Other.

---

## Tech Stack

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Frontend  | Pure HTML + CSS + Vanilla JS      |
| Database  | Supabase (PostgreSQL)             |
| Auth      | Supabase Auth (email + password)  |
| Hosting   | Vercel (static site, no build)    |
| Font      | Inter (Google Fonts CDN)          |

---

## Project Structure

```
sawa/
├── index.html          Homepage (hero, categories, latest posts)
├── category.html       Browse/filter posts, create/edit/delete posts
├── login.html          Sign In / Register
├── style.css           Shared stylesheet (all pages)
├── app.js              Shared JS (Supabase client, auth, utilities)
├── supabase_setup.sql  Database schema + RLS policies
├── .gitignore
└── README.md
```

---

## Setup Instructions

### Step 1 — Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign up / log in.
2. Click **New project**, choose a name (e.g., `sawa`), pick a region closest to Lebanon (e.g., Frankfurt or Mumbai), and set a strong database password.
3. Wait ~2 minutes for the project to be provisioned.

### Step 2 — Run the database setup script

1. In your Supabase dashboard, go to **SQL Editor → New query**.
2. Copy the entire contents of `supabase_setup.sql` and paste it into the editor.
3. Click **Run**. This will create all tables, RLS policies, the view, and the trigger.

### Step 3 — Get your API credentials

1. In the Supabase dashboard, go to **Settings → API**.
2. Copy:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon / public** key (a long JWT string)

### Step 4 — Add credentials to app.js

Open `app.js` and replace the two placeholder values at the top:

```js
const SUPABASE_URL      = 'https://your-project-id.supabase.co';  // ← replace
const SUPABASE_ANON_KEY = 'your-anon-key-here';                    // ← replace
```

> **Important:** The `anon` key is safe to include in frontend code — it only allows operations that are permitted by your RLS policies. Never use the `service_role` key in the browser.

### Step 5 — (Optional) Configure email confirmation

By default, Supabase requires new users to confirm their email before they can sign in.

- To **disable** this (easier for development/demo):  
  Dashboard → **Authentication → Email → Confirm email** → toggle off.
- Leave it **enabled** for a real production deployment.

### Step 6 — Run locally

Since this is pure HTML/CSS/JS with no build step, just open `index.html` directly in your browser, **or** use a local dev server (recommended, as some browsers block cross-origin requests from `file://`):

```bash
# Option A: Python (comes pre-installed on most systems)
python -m http.server 3000

# Option B: Node.js
npx serve .

# Option C: VS Code
# Install the "Live Server" extension, then right-click index.html → "Open with Live Server"
```

Then open `http://localhost:3000` in your browser.

---

## Deploy to Vercel

1. Push the project to a GitHub repository.
2. Go to [vercel.com](https://vercel.com), click **Add New → Project**, and import the GitHub repo.
3. Vercel will detect it as a static site automatically — no build command needed.
4. Click **Deploy**.

Your site will be live at `https://your-project.vercel.app`.

---

## How It Works

### Authentication flow

1. User registers on `login.html` → Supabase creates a row in `auth.users`.
2. A database trigger (`handle_new_user`) automatically creates a matching row in `profiles` with the user's full name.
3. On login, Supabase returns a JWT stored in `localStorage`.
4. `app.js` reads this JWT on every page load via `supabase.auth.getSession()`.

### Post visibility

- All posts are readable by anyone (guest or logged in).
- Contact phone is hidden from guests when the poster unchecks "Show contact to guests" — enforced in the `posts_public` database view.
- Only the post's author can edit, delete, or resolve it — enforced by Row Level Security policies in PostgreSQL.

### Database diagram

```
auth.users (Supabase managed)
    │
    ├─── profiles (1:1)
    │
    └─── posts (1:many)
              │
              └─── categories (many:1)
```

---

## Color Palette

| Variable         | Value     | Used for                  |
|------------------|-----------|---------------------------|
| `--green`        | `#16a34a` | Primary / brand color     |
| `--green-dark`   | `#15803d` | Hover states              |
| `--green-light`  | `#f0fdf4` | Section backgrounds       |
| `--text`         | `#1a1a1a` | Body text                 |
| `--text-muted`   | `#6b7280` | Secondary / helper text   |
| `--bg`           | `#f9fafb` | Page background           |
| `--urgent`       | `#ef4444` | "Need" badges, errors     |

---

## Features Summary

| Feature                             | Where                         |
|-------------------------------------|-------------------------------|
| Homepage with live counters         | `index.html`                  |
| 6 category cards with post counts   | `index.html`                  |
| Latest 3 posts preview              | `index.html`                  |
| Browse by category + tab toggle     | `category.html`               |
| Location search (partial match)     | `category.html`               |
| Create post modal (logged in)       | `category.html`               |
| Edit / Delete / Resolve own posts   | `category.html`               |
| Sign In / Register (email+password) | `login.html`                  |
| Contact phone visibility control    | `supabase_setup.sql` (VIEW)   |
| Row Level Security                  | `supabase_setup.sql` (RLS)    |
| Toast notifications                 | `app.js`                      |
| XSS prevention via HTML escaping    | `app.js` (`escapeHtml`)       |
| Mobile responsive layout            | `style.css`                   |
