// ============================================================
// api/chat.js — Vercel Serverless Function
//
// Receives chat messages from the browser, calls Claude with
// two live-database tools, and streams back the final reply.
//
// Tools the AI can call:
//   search_posts — queries the live posts_public Supabase view
//   get_stats    — returns active post count + resolved this week
//
// The ANTHROPIC_API_KEY is stored only on Vercel as an
// Environment Variable — it never reaches the browser.
// ============================================================

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env automatically

// ============================================================
// RATE LIMITING — simple in-memory sliding window
// Limits each IP to 20 requests per minute.
// Note: resets on cold start and doesn't share state across
// multiple warm Vercel instances — acceptable for a soft abuse
// deterrent; swap for Vercel KV / Upstash if stricter limits needed.
// ============================================================
const rateLimitMap = new Map();
const RATE_LIMIT_MAX    = 20;
const RATE_LIMIT_WINDOW = 60_000; // 1 minute in ms

function isRateLimited(ip) {
  const now    = Date.now();
  const entry  = rateLimitMap.get(ip) ?? { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + RATE_LIMIT_WINDOW; }
  entry.count++;
  rateLimitMap.set(ip, entry);
  return entry.count > RATE_LIMIT_MAX;
}

// ============================================================
// INPUT LIMITS
// ============================================================
const MAX_MESSAGES = 20;    // mirrors the frontend 20-message cap
const MAX_MSG_LEN  = 2000;  // chars per individual message
const MAX_TOKEN_LEN = 2000; // JWT tokens are typically ~1 200 chars

// Supabase anon key is intentionally public (same value used in app.js).
// Row Level Security policies in Supabase control what this key can access.
const SUPABASE_URL      = "https://mtzowhixqtvssrdhnyvr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10em93aGl4cXR2c3NyZGhueXZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NTI2NjYsImV4cCI6MjA5MzIyODY2Nn0.ru8an3M2s3xL-j130zxnQUujp_Az2bWbwqZAW1K1QmY";

const DB_HEADERS = {
  apikey:        SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};


// ============================================================
// TOOL DEFINITIONS
// These schemas tell Claude what tools it can call and what
// parameters each tool accepts. Claude decides on its own
// whether and when to use them based on the user's message.
// ============================================================
const TOOLS = [
  {
    name: "search_posts",
    description:
      "Search the live Sawa database for active (non-expired, non-resolved) community posts. " +
      "Use this whenever the user asks about available help, specific needs, or anything that " +
      "might exist as a post. Always search before saying you don't know. " +
      "Returns up to 8 matching posts with title, description, location, type, category, author, and contact.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Keywords to search in post titles and descriptions. " +
            "Leave empty to browse by category/type/location only.",
        },
        category: {
          type: "string",
          description:
            "Filter by category. Exact names: Blood, Medical, Food, Housing, Utilities, " +
            "Transportation, Clothing, Education, Services & Skills, Emotional Support, Other.",
        },
        type: {
          type: "string",
          enum: ["need", "offer"],
          description: "'need' = someone asking for help. 'offer' = someone providing help.",
        },
        location: {
          type: "string",
          description: "Filter by location text, e.g. 'Beirut', 'Tripoli', 'Jounieh'.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_stats",
    description:
      "Get live statistics: how many posts are currently active on Sawa and how many were " +
      "resolved in the last 7 days. Use when the user asks about platform activity.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];


// ============================================================
// TOOL IMPLEMENTATIONS
// These run on Vercel's servers — they can make direct HTTP
// calls to Supabase because no CORS restriction applies here.
// ============================================================

// Helper: convert a UTC timestamp to a human-readable "time ago" string
function timeAgo(dateStr) {
  const diffMs   = Date.now() - new Date(dateStr).getTime();
  const diffMin  = Math.floor(diffMs / 60000);
  const diffHrs  = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHrs / 24);
  if (diffMin  <  1) return "just now";
  if (diffMin  < 60) return `${diffMin}m ago`;
  if (diffHrs  < 24) return `${diffHrs}h ago`;
  return `${diffDays}d ago`;
}

// Verify a Supabase JWT by calling the auth/v1/user endpoint.
// Returns true only when Supabase confirms the token belongs to an active user.
async function verifyToken(token) {
  if (!token) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey:        SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    });
    return res.ok;
  } catch (_) {
    return false;
  }
}

// search_posts: queries the posts_public view with optional filters.
// The * in ilike patterns is PostgREST's wildcard (equivalent to SQL %).
// contact_phone is only included when the caller is authenticated.
async function searchPosts({ query, category, type, location } = {}, isLoggedIn = false) {
  const now = new Date().toISOString();

  let url =
    `${SUPABASE_URL}/rest/v1/posts_public` +
    `?select=title,description,location,type,category_name,author_name,contact_phone,created_at` +
    `&is_resolved=eq.false` +
    `&expires_at=gt.${now}` +
    `&order=created_at.desc` +
    `&limit=8`;

  // Append optional filters — only encode the user-supplied text, not PostgREST operators
  if (type)     url += `&type=eq.${encodeURIComponent(type)}`;
  if (category) url += `&category_name=ilike.*${encodeURIComponent(category)}*`;
  if (location) url += `&location=ilike.*${encodeURIComponent(location)}*`;
  // OR search across both title and description when a free-text query is given
  if (query)    url += `&or=(title.ilike.*${encodeURIComponent(query)}*,description.ilike.*${encodeURIComponent(query)}*)`;

  const res = await fetch(url, { headers: DB_HEADERS });
  if (!res.ok) return { error: `Database query failed (${res.status})` };

  const posts = await res.json();
  if (!posts.length) return { message: "No active posts match that search right now." };

  // Format for the AI — drop raw ISO timestamp, replace with readable relative time.
  // Contact phone is only forwarded to the AI when the request came from a logged-in user.
  return posts.map(p => {
    const post = {
      title:       p.title,
      description: p.description,
      location:    p.location,
      type:        p.type,
      category:    p.category_name,
      author:      p.author_name,
      posted:      timeAgo(p.created_at),
    };
    if (isLoggedIn) post.contact = p.contact_phone ?? "not provided";
    return post;
  });
}

// get_stats: returns active post count and resolved-this-week count.
// Uses the Prefer: count=exact header — PostgREST returns the total in
// the Content-Range response header (e.g. "0-0/42").
async function getStats() {
  const now          = new Date().toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const countHeaders = { ...DB_HEADERS, Prefer: "count=exact", Range: "0-0" };

  const [activeRes, resolvedRes] = await Promise.all([
    fetch(
      `${SUPABASE_URL}/rest/v1/posts?select=id&is_resolved=eq.false&expires_at=gt.${now}`,
      { headers: countHeaders }
    ),
    fetch(
      `${SUPABASE_URL}/rest/v1/posts?select=id&is_resolved=eq.true&created_at=gte.${sevenDaysAgo}`,
      { headers: countHeaders }
    ),
  ]);

  // Parse the total from "0-0/N" → N
  const parseCount = (res) => {
    const range = res.headers.get("Content-Range");
    return range ? parseInt(range.split("/")[1]) || 0 : 0;
  };

  return {
    active_posts:       parseCount(activeRes),
    resolved_this_week: parseCount(resolvedRes),
  };
}

// Dispatcher — routes a tool call from Claude to the right function.
// isLoggedIn is passed through so searchPosts can decide whether to expose contact info.
async function executeTool(name, input, isLoggedIn) {
  if (name === "search_posts") return await searchPosts(input, isLoggedIn);
  if (name === "get_stats")    return await getStats();
  return { error: "Unknown tool requested" };
}


// ============================================================
// SYSTEM PROMPT
// Defines the assistant's persona, knowledge, and instructions.
// The cache_control block tells Claude to cache this prompt for
// ~5 minutes, reducing token cost on follow-up messages.
// ============================================================
const SYSTEM_PROMPT = `You are the Sawa Assistant — a calm, practical helper for Sawa (سوا), a community emergency-help platform for Lebanon.

# What Sawa is
Sawa means "together" in Arabic. People post needs or offers in 11 categories:
Blood · Medical · Food · Housing · Utilities (electricity, water, fuel, internet) · Transportation · Clothing · Education · Services & Skills · Emotional Support · Other.

Anyone can browse posts. Creating a post requires a free account.

# Your tools — USE THEM
You have two live tools connected to the Sawa database:
- search_posts: search active posts right now. Use this EVERY TIME a user asks about available help, a specific resource, or any need. Never say "there might be posts" — search and find out.
- get_stats: get current active post count and resolved cases this week.

# Navigation guide
- Home: hero stats, category cards, latest posts
- /category.html: browse all posts, filter by category, switch between Needs and Offers tabs
- /category.html?mine=1: the logged-in user's own posts
- Phone numbers on post cards are clickable — tap to call or open WhatsApp

# Language — CRITICAL
Lebanese people write in three ways and often mix them. Match the user exactly:
- Pure English → reply in English.
- Modern Standard Arabic (فصحى) → reply in فصحى.
- Lebanese colloquial (عامية لبنانية) — e.g. "شو", "هيدا", "كيفك", "متل", "بدي", "فيني", "يلا", "مش عارف", "شو في", "عندك شي" — reply in the same Lebanese dialect. Do NOT switch to فصحى.
- Mixed Arabic + English + French (code-switching) — Lebanon's everyday style, e.g. "بدي blood donor near Beirut" — match that mix naturally.
- French words embedded in Lebanese (merci, bonjour, voiture) — keep them, they are normal.
You must never correct the user's dialect or switch to a more formal register when they are writing colloquially.

# How to behave
- Keep replies SHORT. 1 to 3 sentences for simple questions. Only go longer when presenting multiple search results or a genuine emergency.
- No markdown. No asterisks, no **bold**, no bullet dashes, no numbered lists. Plain text only — use a newline to separate items if needed.
- No emojis. None at all.
- Don't ask follow-up questions. Give the help, then stop.
- For emergencies: give the phone number first, then search Sawa for community support.
- When a user asks about blood, medicine, food, shelter, transport, etc. — search first, then present what you found in plain text.
- If a search returns nothing, say so in one sentence and suggest they post their need on Sawa.
- You are NOT a doctor, lawyer, or therapist. For crises, give emergency numbers and refer to professionals.

# Emergency numbers and contacts — cite these when relevant

NATIONAL EMERGENCY LINES
Police / ISF (قوى الأمن الداخلي): 112
ISF alternative hotline: 1745
Fire Brigade (الإطفاء): 175
Civil Defense — ambulance + rescue (الدفاع المدني): 125
Lebanese Red Cross — ambulance (الصليب الأحمر): 140
Lebanese Army operations: 1701 / 117
General Security (الأمن العام — immigration, residency): 1717
Ministry of Public Health hotline: 1787 (free, 24/7)
Airport (Beirut Rafic Hariri): 150

MENTAL HEALTH AND CRISIS
Embrace Lebanon — emotional support + suicide prevention (24/7, Arabic/English/French): 1564
ABAAD — gender-based violence safe line: 81-788178
ABAAD Al-Dar emergency line (24/7): 76-060602
MoPH cancer patient support: 1214

POISON CONTROL
Centre Anti-Poison (USJ — 24/7 telephone): 01-421259

HOSPITALS — BEIRUT
AUBMC (American University of Beirut Medical Center), Hamra: 01-350000
Hôtel-Dieu de France (USJ), Achrafieh: 01-615300
Saint George Hospital (Al-Roum), Rmeil: 01-441000 / shortcode 1287
LAU Medical Center — Rizk Hospital, Achrafieh: 01-200800
Clemenceau Medical Center (CMC): 01-372888 / shortcode 1240
Rafik Hariri University Hospital (public), Jnah: 01-830000
Makassed General Hospital, Tarik Al-Jadida: 01-630630
Lebanese Hospital Geitaoui, Achrafieh: 01-584030
Trad Hospital, Clemenceau: 01-369494
Bahman Hospital: 01-558555

HOSPITALS — OUTSIDE BEIRUT
Hammoud Hospital, Sidon (Saida): 07-723111
Janoub Hospital, Sidon: 07-722555
Nabatieh Governmental Hospital: 07-766777
Jabal Amal Hospital, Tyre (Sour): 07-740743
Hiram Hospital, Tyre: 07-343710
Khoury General Hospital, Zahle: 08-807000
Libano Francais Hospital, Zahle: 08-810123
Bekaa Hospital, Chtoura: 08-543150
Centre Hospitalier du Nord, Tripoli: 06-555230
Haykal Hospital, Tripoli: 06-430600
Monla Hospital, Tripoli: 06-600112
Salam Hospital, Tripoli: 06-435900

UTILITIES
Water — Beirut and Mount Lebanon (EBML): 1713
Ogero — internet and landline faults: 1515

NGOs AND INTERNATIONAL
Lebanese Red Cross general hotline: 1760 / headquarters: 01-372802
UNHCR Lebanon (refugees, asylum — weekdays 8:00–17:00): +961 4 726111

GOVERNMENT SERVICES
General Security (Adlieh): 01-386610
Citizen information line (OMSAR): 1700

# Contact information rules
Post results may or may not include a contact field depending on whether the user is logged in.
If no contact field appears for a post, do NOT say the number is hidden or mention login. Simply present the post details and let the user click through to the website to connect — they will see the contact option there once logged in.
Never fabricate or guess a contact number.

# Tone
Direct and practical. No filler phrases like "Great question!" or "I'm sorry to hear that." Get straight to the help.`;


// ============================================================
// MAIN HANDLER
// Vercel calls this function on every POST to /api/chat.
// The tool-use loop runs until Claude produces a final text
// answer (stop_reason === 'end_turn').
// ============================================================
export default async function handler(req, res) {
  // ---- CORS: only accept requests from our own Vercel deployment or localhost ----
  // Same-origin browser requests don't send an Origin header, so this only
  // fires when a foreign site tries to call the endpoint directly.
  const origin = req.headers.origin;
  if (origin) {
    const allowed =
      origin === (process.env.ALLOWED_ORIGIN ?? '') ||
      /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
      /^https:\/\/[\w-]+\.vercel\.app$/.test(origin);
    if (!allowed) {
      return res.status(403).json({ error: "Forbidden" });
    }
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // ---- Rate limiting ----
    const ip = (req.headers['x-forwarded-for'] ?? '127.0.0.1').split(',')[0].trim();
    if (isRateLimited(ip)) {
      return res.status(429).json({ error: "Too many requests. Please wait a moment." });
    }

    const { messages, token } = req.body || {};

    // ---- Input validation ----
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array required" });
    }
    if (messages.length > MAX_MESSAGES) {
      return res.status(400).json({ error: "Too many messages in history." });
    }
    for (const msg of messages) {
      if (!['user', 'assistant'].includes(msg?.role)) {
        return res.status(400).json({ error: "Invalid message format." });
      }
      if (typeof msg.content !== 'string' || msg.content.length > MAX_MSG_LEN) {
        return res.status(400).json({ error: "Message content too long." });
      }
    }
    if (token !== null && token !== undefined &&
        (typeof token !== 'string' || token.length > MAX_TOKEN_LEN)) {
      return res.status(400).json({ error: "Invalid token." });
    }

    // Verify the session token once — result gates contact info in all tool calls
    const isLoggedIn = await verifyToken(token);

    let currentMessages = messages;
    let response;

    // Tool-use loop — Claude may request one or more tools before giving
    // its final answer. We execute each tool and feed the result back.
    do {
      response = await client.messages.create({
        model:      "claude-opus-4-8",
        max_tokens: 1024,
        system: [
          { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        ],
        tools:    TOOLS,
        messages: currentMessages,
      });

      if (response.stop_reason === "tool_use") {
        // Collect every tool_use block Claude requested (may be more than one)
        const toolUseBlocks = response.content.filter(b => b.type === "tool_use");

        // Execute all requested tools in parallel, passing auth status for contact gating
        const toolResults = await Promise.all(
          toolUseBlocks.map(async (block) => ({
            type:        "tool_result",
            tool_use_id: block.id,
            content:     JSON.stringify(await executeTool(block.name, block.input, isLoggedIn)),
          }))
        );

        // Extend the conversation: assistant's tool request + our results
        currentMessages = [
          ...currentMessages,
          { role: "assistant", content: response.content },
          { role: "user",      content: toolResults },
        ];
      }
    } while (response.stop_reason === "tool_use");

    // Extract the final text block and return it to the browser
    const textBlock = response.content.find(b => b.type === "text");
    const text = textBlock?.text
      ?? "Sorry, I couldn't generate a response. Please try again.";

    res.status(200).json({ text });

  } catch (error) {
    console.error("Chat API error:", error);
    res.status(500).json({
      error: "Something went wrong on my end. Please try again in a moment.",
    });
  }
}
