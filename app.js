// ============================================================
// app.js — Shared JavaScript for SAWA
// Every HTML page loads this file via <script src="app.js">.
// It sets up the Supabase client, handles authentication state,
// and provides utility functions used across all pages.
// ============================================================


// ============================================================
// 1. SUPABASE CONFIGURATION
// Replace these two placeholder values with your real credentials.
// Where to find them:
//   Supabase Dashboard → Your Project → Settings → API
//   SUPABASE_URL      = "Project URL"
//   SUPABASE_ANON_KEY = "anon / public" key (safe to expose in frontend)
// ============================================================
const SUPABASE_URL      = 'https://mtzowhixqtvssrdhnyvr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10em93aGl4cXR2c3NyZGhueXZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NTI2NjYsImV4cCI6MjA5MzIyODY2Nn0.ru8an3M2s3xL-j130zxnQUujp_Az2bWbwqZAW1K1QmY';

// window.supabase is provided by the CDN script loaded before this file.
// We name our client "db" to avoid clashing with the CDN's own "supabase" global.
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// ============================================================
// 2. GLOBAL AUTH STATE
// currentUser is null for guests, or a Supabase User object when logged in.
// Other scripts on each page read this variable to show/hide features.
// ============================================================
let currentUser = null;


// ============================================================
// 3. INITIALIZE AUTH ON PAGE LOAD
// Reads the saved session from localStorage (Supabase stores the JWT there).
// Also subscribes to future auth changes (login, logout, token refresh).
// ============================================================
async function initAuth() {
  // Try to restore an existing session (e.g., user refreshed the page)
  const { data: { session } } = await db.auth.getSession();
  currentUser = session?.user ?? null;
  updateNavbar();

  // Listen for auth events so the navbar stays in sync
  db.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user ?? null;
    updateNavbar();
  });
}


// ============================================================
// 4. UPDATE NAVBAR AUTH AREA
// Swaps in a "Login" button for guests, or the user's email + "Logout"
// for signed-in users. Targets the <div id="navbar-auth"> on each page.
// ============================================================
function updateNavbar() {
  const authArea = document.getElementById('navbar-auth');
  if (!authArea) return;

  // Show or hide the "My Posts" nav link (sits beside Home / Browse)
  const myPostsItem = document.getElementById('nav-myposts');
  if (myPostsItem) myPostsItem.style.display = currentUser ? '' : 'none';

  if (currentUser) {
    authArea.innerHTML = `
      <span class="navbar-email">${escapeHtml(currentUser.email)}</span>
      <button class="btn-logout" onclick="signOut()">Logout</button>
    `;
  } else {
    authArea.innerHTML = `<a href="login.html" class="btn btn-primary btn-sm">Login</a>`;
  }
}


// ============================================================
// 5. SIGN OUT
// Clears the Supabase session and redirects to the homepage.
// ============================================================
async function signOut() {
  await db.auth.signOut();
  showToast('Logged out successfully.');
  setTimeout(() => { window.location.href = 'index.html'; }, 800);
}


// ============================================================
// 6. TOAST NOTIFICATIONS
// Displays a small message that slides up from the bottom-right.
// type: 'success' (green), 'error' (red), or '' (dark/neutral).
// Auto-hides after 3 seconds.
// ============================================================
function showToast(message, type = '') {
  // Create the element once and reuse it
  let toast = document.getElementById('global-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'global-toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.className = `toast ${type}`;

  // Double rAF ensures the browser has painted before we add .show
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });

  // Clear any pending hide timer, then schedule a new one
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 3000);
}


// ============================================================
// 7. RELATIVE TIME HELPER
// Converts a UTC timestamp string to a human-readable "time ago" string.
// Examples: "just now", "5m ago", "2h ago", "3d ago", "12 Jan"
// ============================================================
function timeAgo(dateStr) {
  const diffMs   = Date.now() - new Date(dateStr).getTime();
  const diffMin  = Math.floor(diffMs / 60000);
  const diffHrs  = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffMin  <  1) return 'just now';
  if (diffMin  < 60) return `${diffMin}m ago`;
  if (diffHrs  < 24) return `${diffHrs}h ago`;
  if (diffDays <  7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}


// ============================================================
// 8. SVG ICON HELPERS — used inside post cards
// ============================================================
const IC = {
  location: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  clock:    `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  user:     `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  tag:      `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
  phone:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.71 3.53a2 2 0 0 1 1.99-2.18h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.18 6.18l1.57-1.57a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  lock:     `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
};

// ============================================================
// 9. RENDER A SINGLE POST CARD
// Builds the HTML string for one post card.
//
// post:    a row from the posts_public view (includes author_name, etc.)
// isOwner: true when the logged-in user created this post —
//          shows Edit / Delete / Mark Resolved buttons.
// ============================================================
function renderPostCard(post, isOwner = false) {
  // Contact section: show phone, "login to see", or nothing
  let phoneHTML = '';
  if (post.contact_phone) {
    // tel: strips spaces so the OS opens the dialer directly
    const telHref = 'tel:' + post.contact_phone.replace(/\s/g, '');
    // WhatsApp expects digits only (no +, no spaces)
    const waHref  = 'https://wa.me/' + post.contact_phone.replace(/\D/g, '');
    // escapeHtml on the href values prevents attribute-injection XSS
    // (e.g. a phone stored as `" onmouseover="...` would break out of the attribute)
    phoneHTML = `
      <div class="post-contact">
        ${IC.phone}
        <a href="${escapeHtml(telHref)}">${escapeHtml(post.contact_phone)}</a>
        <span class="contact-sep">·</span>
        <a href="${escapeHtml(waHref)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>
      </div>`;
  } else if (!currentUser) {
    phoneHTML = `<div class="post-contact muted">${IC.lock} Login to see contact</div>`;
  }

  // Owner-only controls at the bottom of the card
  const ownerHTML = isOwner ? `
    <div class="post-actions">
      <button class="btn btn-sm btn-outline" onclick="openEditModal('${post.id}')">Edit</button>
      <button class="btn btn-sm btn-danger"  onclick="deletePost('${post.id}')">Delete</button>
      <button class="btn btn-sm btn-primary" onclick="resolvePost('${post.id}')">Resolved</button>
    </div>` : '';

  const badgeLabel  = post.type === 'need' ? 'Needs Help' : 'Offering Help';
  const categoryMeta = post.category_name
    ? `<span class="post-meta-item">${IC.tag} ${escapeHtml(post.category_name)}</span>` : '';
  const authorMeta   = post.author_name
    ? `<span class="post-meta-item">${IC.user} ${escapeHtml(post.author_name)}</span>` : '';

  return `
    <div class="post-card ${post.type}-card" id="post-${post.id}">
      <span class="post-badge ${post.type}">${badgeLabel}</span>
      <h3>${escapeHtml(post.title)}</h3>
      <div class="post-meta">
        <span class="post-meta-item">${IC.location} ${escapeHtml(post.location)}</span>
        <span class="post-meta-item">${IC.clock} ${timeAgo(post.created_at)}</span>
        ${categoryMeta}
        ${authorMeta}
      </div>
      ${post.description ? `<p class="post-desc">${escapeHtml(post.description)}</p>` : ''}
      ${phoneHTML}
      ${ownerHTML}
    </div>`;
}


// ============================================================
// 9. HTML ESCAPING — SECURITY CRITICAL
// Always escape user-generated strings before inserting them into
// the DOM via innerHTML. This prevents Cross-Site Scripting (XSS)
// attacks where a malicious user could inject JavaScript via a post.
// ============================================================
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}


// ============================================================
// 10. SAWA ASSISTANT — floating AI chat widget
// Injects a green FAB in the bottom-right that opens a chat
// panel. Conversation history persists in localStorage across
// navigations. Messages are POSTed to /api/chat which proxies
// to the Claude API (the API key never reaches the browser).
// ============================================================
const CHAT_STORAGE_KEY = 'sawa_chat_history';
const CHAT_WELCOME     = "Hi! I'm the Sawa Assistant. أهلا بك. Ask me anything about Sawa — how to find help, how to post, or Lebanese emergency contacts. English or Arabic both work.";

let chatHistory = [];   // [{role:'user'|'assistant', content:'...'}, ...]
let chatBusy    = false;

function setupChat() {
  // Restore any prior conversation from this device
  try {
    const saved = localStorage.getItem(CHAT_STORAGE_KEY);
    if (saved) chatHistory = JSON.parse(saved);
  } catch (e) { chatHistory = []; }

  // Inject the FAB + chat panel at the end of <body>
  const widget = document.createElement('div');
  widget.innerHTML = `
    <button class="chat-fab" id="chat-fab" aria-label="Open Sawa assistant">
      <img src="logo.png" width="32" height="32" alt="" aria-hidden="true" style="object-fit:contain;display:block;">
    </button>

    <div class="chat-panel" id="chat-panel" role="dialog" aria-label="Sawa assistant chat">
      <header class="chat-header">
        <div class="chat-title">
          <img src="logo.png" width="26" height="26" alt="" aria-hidden="true" style="object-fit:contain;display:block;">
          <span>Sawa Assistant</span>
        </div>
        <button class="chat-close" id="chat-close" aria-label="Close chat">&times;</button>
      </header>

      <div class="chat-messages" id="chat-messages"></div>

      <form class="chat-form" id="chat-form" autocomplete="off">
        <input type="text" id="chat-input"
               placeholder="Ask me anything..."
               maxlength="500" required />
        <button type="submit" class="chat-send" aria-label="Send message">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </form>
    </div>
  `;
  document.body.appendChild(widget);

  // Wire up events
  document.getElementById('chat-fab').addEventListener('click', toggleChat);
  document.getElementById('chat-close').addEventListener('click', toggleChat);
  document.getElementById('chat-form').addEventListener('submit', handleChatSubmit);

  renderChatMessages();
}


function toggleChat() {
  const panel = document.getElementById('chat-panel');
  const fab   = document.getElementById('chat-fab');
  const isOpen = panel.classList.toggle('open');
  fab.classList.toggle('hidden', isOpen);
  if (isOpen) {
    // Auto-focus the input once the open-animation has settled
    setTimeout(() => document.getElementById('chat-input').focus(), 220);
  }
}


// Render the full history into the messages container.
// Always shows the welcome bubble first.
function renderChatMessages() {
  const container = document.getElementById('chat-messages');
  let html = `<div class="chat-msg chat-msg-bot">${escapeHtml(CHAT_WELCOME)}</div>`;

  for (const msg of chatHistory) {
    const role = msg.role === 'user' ? 'user' : 'bot';
    const text = typeof msg.content === 'string' ? msg.content : '';
    html += `<div class="chat-msg chat-msg-${role}">${escapeHtml(text)}</div>`;
  }

  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
}


async function handleChatSubmit(e) {
  e.preventDefault();
  if (chatBusy) return;

  const input = document.getElementById('chat-input');
  const text  = input.value.trim();
  if (!text) return;

  input.value = '';
  chatBusy = true;

  // Add the user message and re-render
  chatHistory.push({ role: 'user', content: text });
  renderChatMessages();

  // Animated "..." while we wait for the API
  const container = document.getElementById('chat-messages');
  const typing = document.createElement('div');
  typing.className = 'chat-msg chat-msg-bot chat-typing';
  typing.innerHTML = '<span></span><span></span><span></span>';
  container.appendChild(typing);
  container.scrollTop = container.scrollHeight;

  try {
    // Send the session token so the server can decide whether to show contact info
    let token = null;
    try {
      const { data } = await db.auth.getSession();
      token = data.session?.access_token ?? null;
    } catch (_) {}

    const response = await fetch('/api/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ messages: chatHistory, token }),
    });

    typing.remove();

    if (!response.ok) throw new Error('Server error');

    const data = await response.json();
    chatHistory.push({ role: 'assistant', content: data.text });

    // Keep history bounded — last 20 messages is plenty of context
    if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatHistory));

    renderChatMessages();
  } catch (error) {
    typing.remove();
    chatHistory.push({
      role: 'assistant',
      content: "Sorry, I couldn't reach the assistant right now. Please try again in a moment.",
    });
    renderChatMessages();
  } finally {
    chatBusy = false;
    document.getElementById('chat-input').focus();
  }
}


// ============================================================
// 11. BOOT — run initAuth + setupChat on every page
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  setupChat();
});
