// ============================================
// BookmarkBuddy - Full Page Manager Script
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

// --- State ---
let chromeBookmarks = [];
let xPosts = [];
let favorites = new Set();
let activeTab = "all";
let sortBy = "newest";
let categoryFilter = "All";
let searchQuery = "";
let viewMode = "grid";
let selectedIds = new Set();
let editingId = null;
let expandedDomains = new Set();

// --- DOM ---
const grid = document.getElementById("bookmarkGrid");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const categoryFilterEl = document.getElementById("categoryFilter");
const bulkBar = document.getElementById("bulkBar");
const infoBar = document.getElementById("infoBar");
const editModal = document.getElementById("editModal");
const toastEl = document.getElementById("toast");
const toastMsg = document.getElementById("toastMsg");

// --- Helpers ---
function categorize(url) {
  const lower = url.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORIES)) {
    if (keywords.some(k => lower.includes(k))) return cat;
  }
  return "Other";
}
function getDomain(url) { try { return new URL(url).hostname.replace("www.", ""); } catch { return url; } }
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
function escapeHtml(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
function truncate(s, n) { if (!s || s.length <= n) return s || ""; return s.slice(0, n).trim() + "…"; }

function getDuplicateDomains(bks) {
  const m = {};
  bks.forEach(b => { const d = getDomain(b.url); (m[d] = m[d] || []).push(b); });
  const result = {};
  Object.entries(m).forEach(([domain, arr]) => {
    if (arr.length > 1) result[domain] = arr;
  });
  return result;
}

function showToast(msg) {
  toastMsg.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove("show"), 2500);
}

// --- Load ---
async function loadBookmarks() {
  const data = await chrome.runtime.sendMessage({ type: "GET_ALL_BOOKMARKS" });
  chromeBookmarks = data?.bookmarks || [];
  xPosts = data?.xPosts || [];
  favorites = new Set(chromeBookmarks.filter(b => b.isFavorite).map(b => b.id));

  const cats = new Set(chromeBookmarks.map(b => categorize(b.url)));
  categoryFilterEl.innerHTML = '<option value="All" style="background:#1e293b">All Categories</option>';
  [...cats].sort().forEach(c => {
    const o = document.createElement("option");
    o.value = c; o.textContent = c; o.style.background = "#1e293b";
    categoryFilterEl.appendChild(o);
  });

  const settings = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
  if (settings) {
    document.getElementById("autoCapture").checked = settings.autoCapture !== false;
  }

  updateCounts();
  render();
}

function updateCounts() {
  const dupeDomains = getDuplicateDomains(chromeBookmarks);
  const dupeCount = Object.keys(dupeDomains).length;
  const barCount = chromeBookmarks.filter(b => b.rootFolder === "Bookmarks Bar").length;
  const otherCount = chromeBookmarks.filter(b => b.rootFolder === "Other Bookmarks").length;
  const mobileCount = chromeBookmarks.filter(b => b.rootFolder === "Mobile Bookmarks").length;
  const shoppingCount = chromeBookmarks.filter(b => b.rootFolder === "Shopping List").length;
  const uniqueCats = new Set(chromeBookmarks.map(b => categorize(b.url)));

  document.getElementById("totalCount").textContent = `${chromeBookmarks.length} bookmarks across ${uniqueCats.size} categories`;
  document.getElementById("allCount").textContent = chromeBookmarks.length;
  document.getElementById("barCount").textContent = barCount;
  document.getElementById("otherCount").textContent = otherCount;
  document.getElementById("mobileCount").textContent = mobileCount;
  document.getElementById("shoppingCount").textContent = shoppingCount;
  document.getElementById("favCount").textContent = favorites.size;
  document.getElementById("xCount").textContent = xPosts.length;
  document.getElementById("dupeCount").textContent = dupeCount;
}

// --- Render ---
function render() {
  const isXTab = activeTab === "x-posts";
  const isDupeTab = activeTab === "duplicates";

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
    if (activeTab === "shopping") list = list.filter(b => b.rootFolder === "Shopping List");
    if (isDupeTab) {
      const dupeDomains = getDuplicateDomains(chromeBookmarks);
      const dupeIds = new Set();
      Object.values(dupeDomains).forEach(arr => arr.forEach(b => dupeIds.add(b.id)));
      list = list.filter(b => dupeIds.has(b.id));
    }
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

  if (isDupeTab) {
    const dupeDomains = getDuplicateDomains(chromeBookmarks);
    const domainCount = Object.keys(dupeDomains).length;
    document.getElementById("infoText").textContent = `Found ${domainCount} domain${domainCount !== 1 ? 's' : ''} with multiple bookmarks. Expand each group to review.`;
    infoBar.classList.add("show");
  } else {
    infoBar.classList.remove("show");
  }

  bulkBar.classList.toggle("show", selectedIds.size > 0);
  document.getElementById("selectedCount").textContent = `${selectedIds.size} selected`;
  document.getElementById("selectAllBtn").textContent = selectedIds.size === list.length ? "Deselect All" : "Select All";

  if (list.length === 0) {
    grid.className = viewMode === "list" ? "grid list-view" : "grid";
    const emptyMsg = isXTab ? "No X posts saved yet" : "No bookmarks found";
    const emptySub = isXTab ? "Bookmark posts on X to see them here" : "Try adjusting your search or filters";
    grid.innerHTML = `<div class="empty-state"><div class="emoji">📭</div><div class="msg">${emptyMsg}</div><div class="sub">${emptySub}</div></div>`;
    return;
  }

  if (isDupeTab) {
    renderDuplicatesGrouped(list);
    return;
  }

  grid.className = viewMode === "list" ? "grid list-view" : "grid";
  grid.innerHTML = list.map(b => renderCard(b, isXTab)).join("");
}

function renderCard(b, isXContext = false) {
  const cat = categorize(b.url);
  const colors = CAT_COLORS[cat] || CAT_COLORS["Other"];
  const domain = getDomain(b.url);
  const isFav = favorites.has(b.id);
  const isXPost = isXContext;
  const initial = (b.title || domain).charAt(0).toUpperCase();
  const sel = selectedIds.has(b.id);

  let xPreview = "";
  if (isXPost && b.metadata?.postText && viewMode === "grid") {
    xPreview = `
      <div class="x-preview-card">
        ${b.metadata.author ? `<div class="x-author">${escapeHtml(b.metadata.author)} ${b.metadata.authorHandle ? `<span style="color:#64748b;font-weight:400">${escapeHtml(b.metadata.authorHandle)}</span>` : ''}</div>` : ''}
        <div class="x-text">${escapeHtml(truncate(b.metadata.postText, 200))}</div>
      </div>`;
  }

  let folderBadge = "";
  if (activeTab === "all" && b.rootFolder) {
    const folderColors = {
      "Bookmarks Bar": { bg: "rgba(99,102,241,0.12)", text: "#a5b4fc" },
      "Other Bookmarks": { bg: "rgba(156,163,175,0.12)", text: "#9ca3af" },
      "Mobile Bookmarks": { bg: "rgba(52,211,153,0.12)", text: "#6ee7b7" },
      "Shopping List": { bg: "rgba(251,191,36,0.12)", text: "#fbbf24" },
    };
    const fc = folderColors[b.rootFolder] || { bg: "rgba(255,255,255,0.06)", text: "#94a3b8" };
    folderBadge = `<span class="folder-badge" style="background:${fc.bg};color:${fc.text}">${b.rootFolder}</span>`;
  }

  const favBtn = isXContext ? '' : `
    <button class="card-fav-btn" data-action="toggle-fav" data-id="${b.id}" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="${isFav ? '#f59e0b' : 'none'}" stroke="${isFav ? '#f59e0b' : '#475569'}" stroke-width="2">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
    </button>`;

  return `
    <div class="card ${sel ? 'selected' : ''}" data-id="${b.id}" data-url="${escapeHtml(b.url)}">
      <div class="card-top">
        <input type="checkbox" class="card-checkbox" ${sel ? 'checked' : ''} data-action="select" data-id="${b.id}">
        <div class="card-favicon">
          ${domain ? `<img src="https://favicon.im/${encodeURIComponent(domain)}?larger=true" alt="" data-favicon loading="lazy">` : ''}
          <span class="fallback" style="${domain ? '' : 'display:flex'}">${initial}</span>
        </div>
        <div class="card-text">
          <div class="card-title">${escapeHtml(b.title)}</div>
          <div class="card-domain">${domain}</div>
        </div>
        ${favBtn}
      </div>
      ${xPreview}
      <div class="card-meta">
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          ${isXPost ? '<span class="x-badge">𝕏 Post</span>' : ''}
          <span class="card-category" style="background:${colors.bg};color:${colors.text}">${cat}</span>
          ${folderBadge}
        </div>
        <span class="card-time">${timeAgo(b.dateAdded)}</span>
      </div>
      <div class="card-hover-actions">
        <button data-action="open" data-url="${escapeHtml(b.url)}" title="Open">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </button>
        <button data-action="edit" data-id="${b.id}" title="Edit">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="del" data-action="delete" data-id="${b.id}" title="Delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>`;
}

// --- Duplicates: grouped by domain ---
function renderDuplicatesGrouped(list) {
  const domainMap = {};
  list.forEach(b => {
    const d = getDomain(b.url);
    (domainMap[d] = domainMap[d] || []).push(b);
  });

  const sortedDomains = Object.entries(domainMap).sort((a, b) => b[1].length - a[1].length);

  let html = "";
  for (const [domain, items] of sortedDomains) {
    const isExpanded = expandedDomains.has(domain);
    const favicon = `https://favicon.im/${encodeURIComponent(domain)}?larger=true`;
    const initial = domain.charAt(0).toUpperCase();

    html += `
      <div class="dupe-group" data-domain="${escapeHtml(domain)}">
        <div class="dupe-group-header ${isExpanded ? 'expanded' : ''}" data-action="toggle-domain" data-domain="${escapeHtml(domain)}">
          <div class="dupe-group-left">
            <svg class="dupe-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
            <div class="card-favicon" style="width:28px;height:28px;border-radius:8px;">
              <img src="${favicon}" alt="" data-favicon loading="lazy" style="width:100%;height:100%;object-fit:cover;">
              <span class="fallback">${initial}</span>
            </div>
            <span class="dupe-group-domain">${escapeHtml(domain)}</span>
            <span class="dupe-group-count">${items.length} bookmark${items.length !== 1 ? 's' : ''}</span>
          </div>
          <div class="dupe-group-right">
            <button class="dupe-select-all" data-action="select-domain" data-domain="${escapeHtml(domain)}" title="Select all in group">
              Select All
            </button>
          </div>
        </div>
        <div class="dupe-group-items ${isExpanded ? 'show' : ''}">
          ${items.map(b => renderCard(b, false)).join("")}
        </div>
      </div>`;
  }

  grid.innerHTML = html;
  grid.className = "grid-dupes";
}

// --- Events ---
searchInput.addEventListener("input", e => { searchQuery = e.target.value; render(); });
sortSelect.addEventListener("change", e => { sortBy = e.target.value; render(); });
categoryFilterEl.addEventListener("change", e => { categoryFilter = e.target.value; render(); });

document.addEventListener("keydown", e => {
  if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); searchInput.focus(); }
  if (e.key === "Escape") { editModal.classList.remove("show"); importModal.classList.remove("show"); }
});

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    activeTab = tab.dataset.tab;
    selectedIds.clear();
    render();
  });
});

document.querySelectorAll(".view-toggle button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".view-toggle button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    viewMode = btn.dataset.view;
    render();
  });
});

grid.addEventListener("error", (e) => {
  if (e.target.tagName === "IMG" && e.target.dataset.favicon !== undefined) {
    e.target.style.display = "none";
    const fallback = e.target.nextElementSibling;
    if (fallback) fallback.style.display = "flex";
  }
}, true);

grid.addEventListener("click", e => {
  const domainToggle = e.target.closest("[data-action='toggle-domain']");
  if (domainToggle) {
    const domain = domainToggle.dataset.domain;
    if (expandedDomains.has(domain)) expandedDomains.delete(domain);
    else expandedDomains.add(domain);
    render();
    return;
  }

  const selectDomain = e.target.closest("[data-action='select-domain']");
  if (selectDomain) {
    e.stopPropagation();
    const domain = selectDomain.dataset.domain;
    const dupeDomains = getDuplicateDomains(chromeBookmarks);
    const items = dupeDomains[domain] || [];
    const allSelected = items.every(b => selectedIds.has(b.id));
    items.forEach(b => {
      if (allSelected) selectedIds.delete(b.id);
      else selectedIds.add(b.id);
    });
    render();
    return;
  }

  const action = e.target.closest("[data-action]");
  if (!action) {
    const card = e.target.closest(".card");
    if (card && !e.target.closest(".card-hover-actions") && !e.target.closest(".card-fav-btn") && !e.target.closest(".card-checkbox")) {
      chrome.tabs.create({ url: card.dataset.url });
    }
    return;
  }

  const act = action.dataset.action;
  const id = action.dataset.id;

  if (act === "select") {
    e.stopPropagation();
    if (selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id);
    render();
  }
  if (act === "toggle-fav") {
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: "TOGGLE_FAVORITE", id }, () => {
      if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
      updateCounts(); render();
    });
  }
  if (act === "open") {
    e.stopPropagation();
    chrome.tabs.create({ url: action.dataset.url });
  }
  if (act === "edit") {
    e.stopPropagation();
    const allItems = [...chromeBookmarks, ...xPosts];
    const bk = allItems.find(b => b.id === id);
    if (bk) {
      editingId = id;
      document.getElementById("editTitle").value = bk.title;
      document.getElementById("editUrl").value = bk.url;
      editModal.classList.add("show");
    }
  }
  if (act === "delete") {
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: "DELETE_BOOKMARK", id }, () => {
      chromeBookmarks = chromeBookmarks.filter(b => b.id !== id);
      xPosts = xPosts.filter(b => b.id !== id);
      favorites.delete(id); selectedIds.delete(id);
      updateCounts(); render(); showToast("Bookmark deleted");
    });
  }
});

document.getElementById("selectAllBtn").addEventListener("click", () => {
  let list = getFilteredList();
  if (selectedIds.size === list.length) selectedIds.clear();
  else list.forEach(b => selectedIds.add(b.id));
  render();
});

document.getElementById("bulkDelete").addEventListener("click", () => {
  if (selectedIds.size === 0) return;
  const ids = [...selectedIds];
  chrome.runtime.sendMessage({ type: "DELETE_BOOKMARKS_BULK", ids }, () => {
    const idSet = new Set(ids);
    chromeBookmarks = chromeBookmarks.filter(b => !idSet.has(b.id));
    xPosts = xPosts.filter(b => !idSet.has(b.id));
    ids.forEach(id => { favorites.delete(id); });
    selectedIds.clear();
    updateCounts(); render();
    showToast(`${ids.length} bookmark${ids.length > 1 ? 's' : ''} deleted`);
  });
});

document.getElementById("modalClose").addEventListener("click", () => editModal.classList.remove("show"));
document.getElementById("editCancel").addEventListener("click", () => editModal.classList.remove("show"));
editModal.addEventListener("click", e => { if (e.target === editModal) editModal.classList.remove("show"); });

document.getElementById("editSave").addEventListener("click", () => {
  if (!editingId) return;
  const title = document.getElementById("editTitle").value;
  const url = document.getElementById("editUrl").value;
  chrome.runtime.sendMessage({ type: "UPDATE_BOOKMARK", id: editingId, title, url }, () => {
    const bk = chromeBookmarks.find(b => b.id === editingId) || xPosts.find(b => b.id === editingId);
    if (bk) { bk.title = title; bk.url = url; }
    editModal.classList.remove("show");
    editingId = null;
    render(); showToast("Bookmark updated");
  });
});

document.getElementById("autoCapture").addEventListener("change", e => {
  chrome.runtime.sendMessage({ type: "UPDATE_SETTINGS", settings: { autoCapture: e.target.checked } });
});

function getFilteredList() {
  const isXTab = activeTab === "x-posts";
  let list = isXTab ? [...xPosts] : [...chromeBookmarks];

  if (!isXTab) {
    if (activeTab === "favorites") list = list.filter(b => favorites.has(b.id));
    if (activeTab === "bar") list = list.filter(b => b.rootFolder === "Bookmarks Bar");
    if (activeTab === "other") list = list.filter(b => b.rootFolder === "Other Bookmarks");
    if (activeTab === "mobile") list = list.filter(b => b.rootFolder === "Mobile Bookmarks");
    if (activeTab === "shopping") list = list.filter(b => b.rootFolder === "Shopping List");
    if (activeTab === "duplicates") {
      const dupeDomains = getDuplicateDomains(chromeBookmarks);
      const dupeIds = new Set();
      Object.values(dupeDomains).forEach(arr => arr.forEach(b => dupeIds.add(b.id)));
      list = list.filter(b => dupeIds.has(b.id));
    }
    if (categoryFilter !== "All") list = list.filter(b => categorize(b.url) === categoryFilter);
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(b => b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q));
  }
  return list;
}

// --- Init ---
loadBookmarks();

// ============================================
// X/Twitter Data Import
// ============================================

const importModal = document.getElementById("importModal");
const importStart = document.getElementById("importStart");
const importProgress = document.getElementById("importProgress");
const importSummary = document.getElementById("importSummary");
const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");
const likesDropzone = document.getElementById("likesDropzone");
const likesFileInput = document.getElementById("likesFile");
const likesStatus = document.getElementById("likesStatus");

let parsedLikes = null;

document.querySelectorAll(".import-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".import-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    document.querySelectorAll(".import-tab-content").forEach(c => c.classList.remove("active"));
    const target = tab.dataset.importTab === "bookmarks" ? "importTabBookmarks" : "importTabLikes";
    document.getElementById(target).classList.add("active");
  });
});

document.getElementById("importXBtn").addEventListener("click", () => {
  parsedLikes = null;
  likesFileInput.value = "";
  likesStatus.textContent = "";
  likesDropzone.classList.remove("has-file");
  importStart.disabled = true;
  importProgress.style.display = "none";
  importSummary.style.display = "none";
  progressFill.style.width = "0%";
  document.querySelectorAll(".import-tab").forEach(t => t.classList.remove("active"));
  document.querySelector('.import-tab[data-import-tab="bookmarks"]').classList.add("active");
  document.querySelectorAll(".import-tab-content").forEach(c => c.classList.remove("active"));
  document.getElementById("importTabBookmarks").classList.add("active");
  importModal.classList.add("show");
});

document.getElementById("importModalClose").addEventListener("click", () => importModal.classList.remove("show"));
document.getElementById("importCancel").addEventListener("click", () => importModal.classList.remove("show"));
importModal.addEventListener("click", e => { if (e.target === importModal) importModal.classList.remove("show"); });

document.getElementById("openXBookmarks").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://x.com/i/bookmarks" });
  importModal.classList.remove("show");
});

function parseXDataFile(content) {
  try {
    const direct = JSON.parse(content);
    if (Array.isArray(direct)) return direct;
    return null;
  } catch {
    const match = content.match(/=\s*(\[[\s\S]*\])\s*;?\s*$/);
    if (match) {
      try { return JSON.parse(match[1]); }
      catch (e) { console.error("[BookmarkBuddy] Parse error:", e); return null; }
    }
    return null;
  }
}

function extractLikesFromXData(data) {
  const results = [];
  for (const item of data) {
    const like = item.like || item;
    const tweetId = like.tweetId || like.tweet_id || like.id;
    const fullText = like.fullText || like.full_text || like.text || "";
    if (tweetId) {
      const title = fullText
        ? `Liked: "${fullText.slice(0, 80)}${fullText.length > 80 ? '…' : ''}" on X`
        : `X Liked Post ${tweetId}`;
      results.push({
        url: `https://x.com/i/status/${tweetId}`,
        title, tweetId, postText: fullText,
        source: "x-likes-import",
      });
    }
  }
  return results;
}

function setupDropzone(dropzone, fileInput, statusEl) {
  dropzone.addEventListener("click", (e) => {
    if (e.target === fileInput) return;
    fileInput.click();
  });
  dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("dragover"); });
  dropzone.addEventListener("dragleave", () => { dropzone.classList.remove("dragover"); });
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault(); dropzone.classList.remove("dragover");
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0], dropzone, statusEl);
  });
  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) handleFile(fileInput.files[0], dropzone, statusEl);
  });
}

function handleFile(file, dropzone, statusEl) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const data = parseXDataFile(e.target.result);
    if (!data || !Array.isArray(data) || data.length === 0) {
      statusEl.textContent = "⚠ Could not parse file";
      statusEl.style.color = "#f59e0b";
      dropzone.classList.remove("has-file");
      parsedLikes = null;
      importStart.disabled = true;
      return;
    }
    const items = extractLikesFromXData(data);
    parsedLikes = items;
    statusEl.textContent = `✓ ${items.length} likes found`;
    statusEl.style.color = "#10b981";
    dropzone.classList.add("has-file");
    importStart.disabled = items.length === 0;
  };
  reader.readAsText(file);
}

setupDropzone(likesDropzone, likesFileInput, likesStatus);

importStart.addEventListener("click", async () => {
  if (!parsedLikes || parsedLikes.length === 0) return;

  importStart.disabled = true;
  importProgress.style.display = "block";
  importSummary.style.display = "none";

  let imported = 0;
  let skipped = 0;
  const total = parsedLikes.length;
  const BATCH_SIZE = 10;

  for (let i = 0; i < parsedLikes.length; i += BATCH_SIZE) {
    const batch = parsedLikes.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(item =>
        chrome.runtime.sendMessage({
          type: "IMPORT_X_BOOKMARK",
          url: item.url,
          title: item.title,
          metadata: { source: item.source, postText: item.postText || "", tweetId: item.tweetId },
        })
      )
    );
    results.forEach(r => { if (r?.status === "created") imported++; else skipped++; });

    const progress = Math.min(100, Math.round(((i + batch.length) / total) * 100));
    progressFill.style.width = `${progress}%`;
    progressText.textContent = `Importing… ${i + batch.length} / ${total}`;

    if (i + BATCH_SIZE < parsedLikes.length) await new Promise(r => setTimeout(r, 50));
  }

  progressFill.style.width = "100%";
  progressText.textContent = "Complete!";
  importSummary.style.display = "flex";
  document.getElementById("importSummaryText").textContent =
    `Imported ${imported} like${imported !== 1 ? 's' : ''}${skipped > 0 ? `, ${skipped} already existed` : ''}`;

  await loadBookmarks();
  showToast(`${imported} X like${imported !== 1 ? 's' : ''} imported!`);
  setTimeout(() => importModal.classList.remove("show"), 2000);
});
