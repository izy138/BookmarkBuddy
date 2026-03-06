// ============================================
// BookmarkBuddy - Side Panel Script
// ============================================

const CATEGORIES = {
  "Streaming": ["netflix", "hulu", "max.com", "hbomax", "twitch", "youtube.com", "music.youtube", "disney", "peacock", "spotify"],
  "Development": ["github", "gitlab", "bitbucket", "stackoverflow", "codepen", "npmjs", "pypi", "vercel", "netlify", "dribbble", "figma"],
  "AI Tools": ["claude.ai", "openai.com", "chat.openai", "gemini.google", "perplexity", "huggingface"],
  "Education": ["instructure", "canvas", "zybooks", "coursera", "udemy", "edx", "khan", ".edu"],
  "Social": ["x.com", "twitter.com", "facebook", "instagram", "reddit", "tiktok", "linkedin", "threads.net"],
  "Communication": ["gmail", "mail.google", "outlook", "protonmail", "slack", "discord"],
  "Shopping": ["amazon", "ebay", "walmart", "target", "etsy", "autotrader", "zillow", "usps"],
  "News": ["nytimes", "bbc", "cnn", "reuters", "apnews"],
  "Reference": ["wikipedia", "docs.google", "notion"],
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

let chromeBookmarks = [];
let xPosts = [];
let favorites = new Set();
let activeTab = "all";
let sortBy = "newest";
let categoryFilter = "All";
let searchQuery = "";

const bookmarkList = document.getElementById("bookmarkList");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const categoryFilterEl = document.getElementById("categoryFilter");

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

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function truncate(str, len) {
  if (!str || str.length <= len) return str || "";
  return str.slice(0, len).trim() + "…";
}

async function loadBookmarks() {
  const data = await chrome.runtime.sendMessage({ type: "GET_ALL_BOOKMARKS" });
  chromeBookmarks = data?.bookmarks || [];
  xPosts = data?.xPosts || [];
  favorites = new Set(chromeBookmarks.filter(b => b.isFavorite).map(b => b.id));

  const cats = new Set(chromeBookmarks.map(b => categorize(b.url)));
  categoryFilterEl.innerHTML = '<option value="All" style="background:#1e293b">All Categories</option>';
  [...cats].sort().forEach(c => {
    const opt = document.createElement("option");
    opt.value = c; opt.textContent = c; opt.style.background = "#1e293b";
    categoryFilterEl.appendChild(opt);
  });

  updateCounts();
  renderBookmarks();
}

function updateCounts() {
  const barCount = chromeBookmarks.filter(b => b.rootFolder === "Bookmarks Bar").length;
  const otherCount = chromeBookmarks.filter(b => b.rootFolder === "Other Bookmarks").length;
  const mobileCount = chromeBookmarks.filter(b => b.rootFolder === "Mobile Bookmarks").length;

  document.getElementById("totalCount").textContent = `${chromeBookmarks.length} bookmarks`;
  document.getElementById("allCount").textContent = chromeBookmarks.length;
  document.getElementById("barCount").textContent = barCount;
  document.getElementById("otherCount").textContent = otherCount;
  document.getElementById("mobileCount").textContent = mobileCount;
  document.getElementById("favCount").textContent = favorites.size;
  document.getElementById("xCount").textContent = xPosts.length;
}

function renderBookmarks() {
  const isXTab = activeTab === "x-posts";
  categoryFilterEl.style.display = isXTab ? "none" : "";

  let list;
  if (isXTab) {
    list = [...xPosts];
  } else {
    list = [...chromeBookmarks];
    if (activeTab === "favorites") list = list.filter(b => favorites.has(b.id));
    if (activeTab === "bar") list = list.filter(b => b.rootFolder === "Bookmarks Bar");
    if (activeTab === "other") list = list.filter(b => b.rootFolder === "Other Bookmarks");
    if (activeTab === "mobile") list = list.filter(b => b.rootFolder === "Mobile Bookmarks");
    if (categoryFilter !== "All") list = list.filter(b => categorize(b.url) === categoryFilter);
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(b =>
      b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q) ||
      categorize(b.url).toLowerCase().includes(q) || (b.metadata?.postText || "").toLowerCase().includes(q)
    );
  }

  switch (sortBy) {
    case "newest": list.sort((a, b) => b.dateAdded - a.dateAdded); break;
    case "oldest": list.sort((a, b) => a.dateAdded - b.dateAdded); break;
    case "alpha": list.sort((a, b) => a.title.localeCompare(b.title)); break;
  }

  if (list.length === 0) {
    const msg = isXTab ? "No X posts saved" : "No bookmarks found";
    const sub = isXTab ? "Bookmark posts on X to see them here" : "Try a different search or filter";
    bookmarkList.innerHTML = `
      <div class="empty-state">
        <div class="emoji">📭</div>
        <div class="msg">${msg}</div>
        <div class="sub">${sub}</div>
      </div>`;
    return;
  }

  bookmarkList.innerHTML = list.map(b => {
    const cat = categorize(b.url);
    const colors = CAT_COLORS[cat] || CAT_COLORS["Other"];
    const domain = getDomain(b.url);
    const isFav = favorites.has(b.id);
    const isXPost = isXTab;
    const initial = (b.title || domain).charAt(0).toUpperCase();

    let xPreviewHtml = "";
    if (isXPost && b.metadata?.postText) {
      xPreviewHtml = `
        <div class="x-preview">
          ${b.metadata.author ? `<div class="x-author">${escapeHtml(b.metadata.author)} ${b.metadata.authorHandle ? escapeHtml(b.metadata.authorHandle) : ''}</div>` : ''}
          ${escapeHtml(truncate(b.metadata.postText, 180))}
        </div>`;
    }

    // No fav button on X posts
    const favBtnHtml = isXPost ? '' : `
      <button data-action="toggle-fav" data-id="${b.id}" class="${isFav ? 'fav-active' : ''}" title="Favorite">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      </button>`;

    return `
      <div class="bookmark-card" data-id="${b.id}" data-url="${escapeHtml(b.url)}">
        <div class="bk-favicon">
          ${domain ? `<img src="https://favicon.im/${encodeURIComponent(domain)}" alt="" data-favicon loading="lazy">` : ''}
          <span class="fallback" style="${domain ? '' : 'display:flex'}">${initial}</span>
        </div>
        <div class="bk-info">
          <div class="bk-title">${escapeHtml(b.title)}</div>
          <div class="bk-meta">
            <span class="bk-domain">${domain}</span>
            ${isXPost ? '<span class="x-badge">𝕏 Post</span>' : ''}
            <span class="bk-category" style="background:${colors.bg};color:${colors.text}">${cat}</span>
            <span class="bk-time">${timeAgo(b.dateAdded)}</span>
          </div>
          ${xPreviewHtml}
        </div>
        <div class="card-actions">
          ${favBtnHtml}
          <button data-action="delete" data-id="${b.id}" class="delete-btn" title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>`;
  }).join("");
}

// --- Events ---
searchInput.addEventListener("input", e => { searchQuery = e.target.value; renderBookmarks(); });
sortSelect.addEventListener("change", e => { sortBy = e.target.value; renderBookmarks(); });
categoryFilterEl.addEventListener("change", e => { categoryFilter = e.target.value; renderBookmarks(); });

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    activeTab = tab.dataset.tab;
    renderBookmarks();
  });
});

bookmarkList.addEventListener("error", (e) => {
  if (e.target.tagName === "IMG" && e.target.dataset.favicon !== undefined) {
    e.target.style.display = "none";
    const fallback = e.target.nextElementSibling;
    if (fallback) fallback.style.display = "flex";
  }
}, true);

bookmarkList.addEventListener("click", e => {
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

  const delBtn = e.target.closest("[data-action='delete']");
  if (delBtn) {
    e.stopPropagation();
    const id = delBtn.dataset.id;
    chrome.runtime.sendMessage({ type: "DELETE_BOOKMARK", id }, () => {
      chromeBookmarks = chromeBookmarks.filter(b => b.id !== id);
      xPosts = xPosts.filter(b => b.id !== id);
      favorites.delete(id);
      updateCounts();
      renderBookmarks();
    });
    return;
  }

  const card = e.target.closest(".bookmark-card");
  if (card) {
    chrome.tabs.create({ url: card.dataset.url });
  }
});

document.getElementById("openFullPage").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("src/manager.html") });
});

loadBookmarks();
