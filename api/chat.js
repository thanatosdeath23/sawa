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

// search_posts: queries the posts_public view with optional filters.
// The * in ilike patterns is PostgREST's wildcard (equivalent to SQL %).
async function searchPosts({ query, category, type, location } = {}) {
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

  // Format for the AI — drop raw ISO timestamp, replace with readable relative time
  return posts.map(p => ({
    title:       p.title,
    description: p.description,
    location:    p.location,
    type:        p.type,          // "need" or "offer"
    category:    p.category_name,
    author:      p.author_name,
    contact:     p.contact_phone ?? "(login required to see phone number)",
    posted:      timeAgo(p.created_at),
  }));
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

// Dispatcher — routes a tool call from Claude to the right function
async function executeTool(name, input) {
  if (name === "search_posts") return await searchPosts(input);
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

# How to behave
- Reply in the same language as the user. Arabic (Lebanese dialect welcome) or English.
- Keep replies SHORT. 1 to 3 sentences for simple questions. Only go longer when presenting multiple search results or a genuine emergency.
- No markdown. No asterisks, no **bold**, no bullet dashes, no numbered lists. Plain text only — use a newline to separate items if needed.
- No emojis. None at all.
- Don't ask follow-up questions. Give the help, then stop.
- For emergencies: give the phone number first, then search Sawa for community support.
- When a user asks about blood, medicine, food, shelter, transport, etc. — search first, then present what you found in plain text.
- If a search returns nothing, say so in one sentence and suggest they post their need on Sawa.
- You are NOT a doctor, lawyer, or therapist. For crises, give emergency numbers and refer to professionals.

# Lebanon emergency numbers — give these FIRST when relevant
Red Cross (الصليب الأحمر): 140 — ambulance, emergency transport
Civil Defense (الدفاع المدني): 125 — fire, rescue, civil emergencies
Police (قوى الأمن الداخلي): 112
Lebanese Army: 1701
Fire Brigade: 175
Poison Control (AUBMC): 01-432325
Embrace mental-health lifeline: 1564
AUBMC hospital: 01-350000
Hôtel-Dieu de France: 01-615000

# Tone
Direct and practical. No filler phrases like "Great question!" or "I'm sorry to hear that." Get straight to the help.`;


// ============================================================
// MAIN HANDLER
// Vercel calls this function on every POST to /api/chat.
// The tool-use loop runs until Claude produces a final text
// answer (stop_reason === 'end_turn').
// ============================================================
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array required" });
    }

    let currentMessages = messages;
    let response;

    // Tool-use loop — Claude may request one or more tools before giving
    // its final answer. We execute each tool and feed the result back.
    do {
      response = await client.messages.create({
        model:      "claude-haiku-4-5-20251001",
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

        // Execute all requested tools in parallel
        const toolResults = await Promise.all(
          toolUseBlocks.map(async (block) => ({
            type:        "tool_result",
            tool_use_id: block.id,
            content:     JSON.stringify(await executeTool(block.name, block.input)),
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
