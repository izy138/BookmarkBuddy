// ============================================
// BookmarkBuddy - Popup Script
// ============================================

const CATEGORIES = {
  "Streaming": ["netflix", "hulu", "max.com", "hbomax", "twitch", "youtube.com", "music.youtube", "disney", "peacock", "crunchyroll", "spotify"],
  "Development": ["github", "gitlab", "bitbucket", "stackoverflow", "codepen", "jsfiddle", "npmjs", "pypi", "crates.io", "vercel", "netlify", "heroku", "dribbble", "figma"],
  "AI Tools": ["claude.ai", "openai.com", "chat.openai", "gemini.google", "perplexity", "huggingface", "midjourney"],
  "Education": ["instructure", "canvas", "zybooks", "coursera", "udemy", "edx", "khan", ".edu"],
  "Social": ["x.com", "twitter.com", "facebook", "instagram", "reddit", "tiktok", "linkedin", "threads.net", "mastodon"],
  "Communication": ["gmail", "mail.google", "outlook", "protonmail", "slack", "discord", "teams"],
  "Shopping": ["amazon", "ebay", "walmart", "target", "etsy", "shopify", "autotrader", "zillow"],
  "News": ["nytimes", "bbc", "cnn", "reuters", "apnews", "theguardian", "washingtonpost"],
  "Reference": ["wikipedia", "docs.google", "notion", "obsidian", "roamresearch"],
};

const CAT_COLORS = {
  "Streaming": { bg: "#fef3c7", text: "#92400e" },
  "Development": { bg: "#dbeafe", text: "#1e40af" },
  "AI Tools": { bg: "#ede9fe", text: "#5b21b6" },
  "Education": { bg: "#d1fae5", text: "#065f46" },
  "Social": { bg: "#fce7f3", text: "#9d174d" },
  "Communication": { bg: "#e0e7ff", text: "#3730a3" },
  "Shopping": { bg: "#ffedd5", text: "#9a3412" },
  "News": { bg: "#fef9c3", text: "#854d0e" },
  "Reference": { bg: "#f0fdf4", text: "#166534" },
  "Other": { bg: "#f3f4f6", text: "#374151" },
};

// --- State ---
let allBookmarks = [];
let favorites = new Set();
let activeTab = "all";
let sortBy = "newest";
let categoryFilter = "All";
let searchQuery = "";
let selectedIds = new Set();

// --- DOM refs ---
const bookmarkList = document.getElementById("bookmarkList");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const categoryFilterEl = document.getElementById("categoryFilter");
const totalCountEl = document.getElementById("totalCount");
const allCountEl = document.getElementById("allCount");
const favCountEl = document.getElementById("favCount");
const xCountEl = document.getElementById("xCount");
const dupeCountEl = document.getElementById("dupeCount");
const actionsRow = document.getElementById("actionsRow");
const selectedCountEl = document.getElementById("selectedCount");

// --- Categorize ---
function categorize(url) {
  const lower = url.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORIES)) {
    if (keywords.some(k => lower.includes(k))) return cat;
  }
  return "Other";
}

function getDomain(url) {
  try { return new URL(url).hostname.replace("www.", ""); } catch { return url; }
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function findDuplicates(bookmarks) {
  const domainMap = {};
  bookmarks.forEach(b => {
    const domain = getDomain(b.url);
    if (!domainMap[domain]) domainMap[domain] = [];
    domainMap[domain].push(b);
  });
  const dupeIds = new Set();
  Object.values(domainMap).forEach(items => {
    if (items.length > 1) items.forEach(i => dupeIds.add(i.id));
  });
  return dupeIds;
}

// --- Load bookmarks ---
async function loadBookmarks() {
  const bookmarks = await chrome.runtime.sendMessage({ type: "GET_ALL_BOOKMARKS" });
  allBookmarks = bookmarks || [];
  favorites = new Set(allBookmarks.filter(b => b.isFavorite).map(b => b.id));

  // Populate category filter
  const cats = new Set(allBookmarks.map(b => categorize(b.url)));
  categoryFilterEl.innerHTML = '<option value="All" style="background:#1e293b">All Categories</option>';
  [...cats].sort().forEach(c => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    opt.style.background = "#1e293b";
    categoryFilterEl.appendChild(opt);
  });

  updateCounts();
  renderBookmarks();
}

function updateCounts() {
  const dupes = findDuplicates(allBookmarks);
  const xPosts = allBookmarks.filter(b => b.metadata?.source === "x.com" || b.url.includes("x.com/") || b.url.includes("twitter.com/"));

  totalCountEl.textContent = `${allBookmarks.length} bookmarks`;
  allCountEl.textContent = allBookmarks.length;
  favCountEl.textContent = favorites.size;
  xCountEl.textContent = xPosts.length;
  dupeCountEl.textContent = dupes.size;
}

// --- Render ---
function renderBookmarks() {
  let list = [...allBookmarks];

  // Tab filter
  if (activeTab === "favorites") list = list.filter(b => favorites.has(b.id));
  if (activeTab === "x-posts") list = list.filter(b => b.metadata?.source === "x.com" || b.url.includes("x.com/") || b.url.includes("twitter.com/"));
  if (activeTab === "duplicates") {
    const dupeIds = findDuplicates(allBookmarks);
    list = list.filter(b => dupeIds.has(b.id));
  }

  // Category filter
  if (categoryFilter !== "All") list = list.filter(b => categorize(b.url) === categoryFilter);

  // Search
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(b =>
      b.title.toLowerCase().includes(q) ||
      b.url.toLowerCase().includes(q) ||
      categorize(b.url).toLowerCase().includes(q) ||
      (b.metadata?.postText || "").toLowerCase().includes(q)
    );
  }

  // Sort
  switch (sortBy) {
    case "newest": list.sort((a, b) => b.dateAdded - a.dateAdded); break;
    case "oldest": list.sort((a, b) => a.dateAdded - b.dateAdded); break;
    case "alpha": list.sort((a, b) => a.title.localeCompare(b.title)); break;
  }

  // Render
  if (list.length === 0) {
    bookmarkList.innerHTML = `
      <div class="empty-state">
        <div class="emoji">📭</div>
        <div class="msg">No bookmarks found</div>
      </div>
    `;
    return;
  }

  bookmarkList.innerHTML = list.map(b => {
    const cat = categorize(b.url);
    const colors = CAT_COLORS[cat] || CAT_COLORS["Other"];
    const domain = getDomain(b.url);
    const isFav = favorites.has(b.id);
    const isXPost = b.metadata?.source === "x.com" || b.url.includes("x.com/") && b.url.includes("/status/");
    const initial = (b.title || domain).charAt(0).toUpperCase();

    return `
      <div class="bookmark-card" data-id="${b.id}" data-url="${b.url}">
        <div class="bk-favicon">
          ${domain ? `<img src="https://favicon.im/${encodeURIComponent(domain)}" alt="" data-favicon loading="lazy">` : ''}
          <span class="fallback" style="${domain ? '' : 'display:flex'}">${initial}</span>
        </div>
        <div class="bk-info">
          <div class="bk-title">${escapeHtml(b.title)}</div>
          <div class="bk-meta">
            <span class="bk-domain">${domain}</span>
            ${isXPost ? '<span class="x-badge">𝕏</span>' : ''}
            <span class="bk-category" style="background:${colors.bg};color:${colors.text}">${cat}</span>
          </div>
        </div>
        <button class="fav-btn ${isFav ? 'is-fav' : ''}" data-action="toggle-fav" data-id="${b.id}" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="${isFav ? '#f59e0b' : 'none'}" stroke="${isFav ? '#f59e0b' : '#64748b'}" stroke-width="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </button>
      </div>
    `;
  }).join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// --- Event Listeners ---
searchInput.addEventListener("input", (e) => {
  searchQuery = e.target.value;
  renderBookmarks();
});

sortSelect.addEventListener("change", (e) => {
  sortBy = e.target.value;
  renderBookmarks();
});

categoryFilterEl.addEventListener("change", (e) => {
  categoryFilter = e.target.value;
  renderBookmarks();
});

// Tab clicks
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    activeTab = tab.dataset.tab;
    selectedIds.clear();
    updateActionsRow();
    renderBookmarks();
  });
});

// Bookmark card clicks
// Favicon error handling (CSP-safe: no inline onerror)
bookmarkList.addEventListener("error", (e) => {
  if (e.target.tagName === "IMG" && e.target.dataset.favicon !== undefined) {
    e.target.style.display = "none";
    const fallback = e.target.nextElementSibling;
    if (fallback) fallback.style.display = "flex";
  }
}, true);

bookmarkList.addEventListener("click", (e) => {
  const favBtn = e.target.closest("[data-action='toggle-fav']");
  if (favBtn) {
    e.stopPropagation();
    const id = favBtn.dataset.id;
    chrome.runtime.sendMessage({ type: "TOGGLE_FAVORITE", id }, () => {
      if (favorites.has(id)) favorites.delete(id);
      else favorites.add(id);
      updateCounts();
      renderBookmarks();
    });
    return;
  }

  const card = e.target.closest(".bookmark-card");
  if (card) {
    const url = card.dataset.url;
    chrome.tabs.create({ url });
  }
});

// Side panel button
document.getElementById("openSidePanel").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
});

// Full page (open manager.html in new tab)
document.getElementById("openFullPage").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("src/manager.html") });
});

// Delete selected
document.getElementById("deleteSelected").addEventListener("click", () => {
  if (selectedIds.size === 0) return;
  chrome.runtime.sendMessage({ type: "DELETE_BOOKMARKS_BULK", ids: [...selectedIds] }, () => {
    allBookmarks = allBookmarks.filter(b => !selectedIds.has(b.id));
    selectedIds.forEach(id => favorites.delete(id));
    selectedIds.clear();
    updateActionsRow();
    updateCounts();
    renderBookmarks();
  });
});

function updateActionsRow() {
  actionsRow.classList.toggle("show", selectedIds.size > 0);
  selectedCountEl.textContent = `${selectedIds.size} selected`;
}

// --- Initialize ---
loadBookmarks();
