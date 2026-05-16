// ============================================================
// api/chat.js — Vercel serverless function
//
// Proxies chat messages from the browser to the Claude API.
// The browser never sees ANTHROPIC_API_KEY — it lives only on
// Vercel as an Environment Variable.
//
// Deploy steps:
//   1. Vercel Dashboard → your project → Settings → Environment
//      Variables → add ANTHROPIC_API_KEY (your key from
//      console.anthropic.com / platform.claude.com)
//   2. Push to your repo; Vercel auto-installs the SDK from
//      package.json the first time.
// ============================================================

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();   // reads ANTHROPIC_API_KEY from env

// ------------------------------------------------------------
// System prompt — defines the assistant's persona, knowledge,
// and limits. Cached on the API side (saves cost on every
// follow-up message in the same 5-minute window).
// ------------------------------------------------------------
const SYSTEM_PROMPT = `You are the Sawa Assistant — a calm, practical chatbot for Sawa (سوا), a community emergency-help platform for Lebanon.

# What Sawa is
Sawa means "together" in Arabic. People post **needs** or **offers** across 11 categories:
Blood · Medical · Food · Housing · Utilities (electricity, water, fuel, internet) · Transportation · Clothing · Education · Services & Skills · Emotional Support · Other.

Anyone can browse posts. Posting requires a free account.

# How users navigate the site
- Home page: hero + stats + category cards
- /category.html : browse all posts, filter by category and location, switch between Needs and Offers tabs
- /category.html?mine=1 : a logged-in user's own posts
- Each post card shows the location, the time, a description, and a clickable phone number (tel: link) plus a WhatsApp shortcut

# How to behave
- Reply in the user's language. If they write in Arabic, reply in Arabic (Lebanese dialect is welcome). If English, reply in English.
- Keep replies short — 1 to 4 short paragraphs, no walls of text.
- For any emergency: give the relevant phone number FIRST, then suggest posting on Sawa if community help is also useful.
- Don't invent facts about Sawa, posts, or organizations. If you don't know, say so and suggest where they could look.
- You are NOT a doctor, lawyer, or licensed counselor. For medical / legal / mental-health questions, give the emergency numbers and refer the user to a professional.

# Lebanon emergency numbers (memorize — give these FIRST when relevant)
- Red Cross (الصليب الأحمر) — **140** — ambulance, emergency transport
- Civil Defense (الدفاع المدني) — **125** — fire, rescue, civil emergencies
- Internal Security Forces (قوى الأمن الداخلي) — **112** — police, accidents
- Lebanese Army — **1701**
- Fire Brigade (الإطفاء) — **175**
- Poison Control Centre (AUBMC) — **01-432325**
- Embrace Lifeline (mental-health crisis) — **1564**
- AUBMC switchboard — **01-350000**
- Hôtel-Dieu de France — **01-615000**

# Tone
Direct, warm, and practical. Never preachy. Don't say "I'm sorry to hear that" — get to the help.`;


export default async function handler(req, res) {
  // Only POST is supported
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages } = req.body || {};

    // Basic validation — the browser sends [{role, content}, ...]
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array required" });
    }

    // Call Claude. The system prompt is wrapped in a text block with
    // cache_control so repeated calls within ~5 minutes pay ~10% the
    // input-token cost on the system prompt portion.
    const response = await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages,
    });

    // Pull the first text block out of the response and return it.
    const textBlock = response.content.find((b) => b.type === "text");
    const text = textBlock?.text || "Sorry, I couldn't generate a response. Please try again.";

    res.status(200).json({ text });

  } catch (error) {
    // Log full error server-side, return a friendly message to the browser
    console.error("Chat API error:", error);
    res.status(500).json({
      error: "Something went wrong. Please try again in a moment.",
    });
  }
}
