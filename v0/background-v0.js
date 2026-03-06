// ============================================
// BookmarkBuddy - Background Service Worker
// ============================================

// --- Context Menu Setup ---
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "save-to-bookmark-boss",
    title: "Save to BookmarkBuddy",
    contexts: ["page", "link"],
  });

  chrome.contextMenus.create({
    id: "save-to-bookmark-boss-favorite",
    title: "Save to BookmarkBuddy ⭐ (as Favorite)",
    contexts: ["page", "link"],
  });

  // Initialize storage
  chrome.storage.local.get(["bb_favorites", "bb_categories", "bb_settings"], (result) => {
    if (!result.bb_favorites) chrome.storage.local.set({ bb_favorites: [] });
    if (!result.bb_categories) chrome.storage.local.set({ bb_categories: {} });
    if (!result.bb_settings) chrome.storage.local.set({
      bb_settings: {
        autoCapture: true,
        showNotifications: true,
        defaultView: "grid",
        defaultSort: "newest",
      }
    });
  });
});

// --- Context Menu Click Handler ---
chrome.contextMenus.onClicked.addListener((info, tab) => {
  const url = info.linkUrl || info.pageUrl;
  const title = tab?.title || url;

  saveBookmark(url, title, info.menuItemId === "save-to-bookmark-boss-favorite");
});

// --- Save Bookmark Helper ---
async function saveBookmark(url, title, asFavorite = false, metadata = {}) {
  // Check if bookmark already exists
  const existing = await chrome.bookmarks.search({ url });
  if (existing.length > 0) {
    // Notify that it already exists
    notifyUser("Already bookmarked", `"${truncate(title, 40)}" is already saved.`);
    return { status: "duplicate", bookmark: existing[0] };
  }

  // Find or create BookmarkBuddy folder
  const folder = await getOrCreateFolder("BookmarkBuddy");

  // Create the bookmark
  const bookmark = await chrome.bookmarks.create({
    parentId: folder.id,
    title: title,
    url: url,
  });

  // Save metadata (category, favorite status, source info)
  const categoryData = await chrome.storage.local.get("bb_categories");
  const categories = categoryData.bb_categories || {};
  categories[bookmark.id] = {
    ...metadata,
    source: metadata.source || "context_menu",
    savedAt: Date.now(),
  };
  await chrome.storage.local.set({ bb_categories: categories });

  // Handle favorite
  if (asFavorite) {
    const favData = await chrome.storage.local.get("bb_favorites");
    const favorites = favData.bb_favorites || [];
    if (!favorites.includes(bookmark.id)) {
      favorites.push(bookmark.id);
      await chrome.storage.local.set({ bb_favorites: favorites });
    }
  }

  notifyUser("Bookmark saved!", `"${truncate(title, 40)}" added to BookmarkBuddy${asFavorite ? " ⭐" : ""}`);
  return { status: "created", bookmark };
}

// --- Folder helper ---
async function getOrCreateFolder(name) {
  const results = await chrome.bookmarks.search({ title: name });
  const folder = results.find(r => !r.url);
  if (folder) return folder;

  return chrome.bookmarks.create({ title: name });
}

// --- Message handler (from content scripts & popup/sidepanel) ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SAVE_X_BOOKMARK") {
    saveBookmark(
      message.url,
      message.title,
      false,
      {
        source: "x.com",
        author: message.author,
        authorHandle: message.authorHandle,
        postText: message.postText,
        postImage: message.postImage,
      }
    ).then(result => sendResponse(result));
    return true; // async response
  }

  if (message.type === "GET_ALL_BOOKMARKS") {
    getAllBookmarks().then(data => sendResponse(data));
    return true;
  }

  if (message.type === "DELETE_BOOKMARK") {
    chrome.bookmarks.remove(message.id).then(() => {
      // Clean up metadata
      chrome.storage.local.get(["bb_categories", "bb_favorites"], (result) => {
        const categories = result.bb_categories || {};
        delete categories[message.id];
        const favorites = (result.bb_favorites || []).filter(f => f !== message.id);
        chrome.storage.local.set({ bb_categories: categories, bb_favorites: favorites });
      });
      sendResponse({ status: "deleted" });
    });
    return true;
  }

  if (message.type === "DELETE_BOOKMARKS_BULK") {
    Promise.all(message.ids.map(id => chrome.bookmarks.remove(id))).then(() => {
      chrome.storage.local.get(["bb_categories", "bb_favorites"], (result) => {
        const categories = result.bb_categories || {};
        const idSet = new Set(message.ids);
        message.ids.forEach(id => delete categories[id]);
        const favorites = (result.bb_favorites || []).filter(f => !idSet.has(f));
        chrome.storage.local.set({ bb_categories: categories, bb_favorites: favorites });
      });
      sendResponse({ status: "deleted", count: message.ids.length });
    });
    return true;
  }

  if (message.type === "UPDATE_BOOKMARK") {
    chrome.bookmarks.update(message.id, {
      title: message.title,
      url: message.url,
    }).then(updated => sendResponse({ status: "updated", bookmark: updated }));
    return true;
  }

  if (message.type === "TOGGLE_FAVORITE") {
    chrome.storage.local.get("bb_favorites", (result) => {
      const favorites = result.bb_favorites || [];
      const idx = favorites.indexOf(message.id);
      if (idx > -1) favorites.splice(idx, 1);
      else favorites.push(message.id);
      chrome.storage.local.set({ bb_favorites: favorites });
      sendResponse({ status: "toggled", isFavorite: idx === -1 });
    });
    return true;
  }

  if (message.type === "OPEN_SIDE_PANEL") {
    chrome.sidePanel.open({ windowId: sender.tab.windowId });
    sendResponse({ status: "opened" });
    return true;
  }

  if (message.type === "GET_SETTINGS") {
    chrome.storage.local.get("bb_settings", (result) => {
      sendResponse(result.bb_settings || {});
    });
    return true;
  }

  if (message.type === "UPDATE_SETTINGS") {
    chrome.storage.local.get("bb_settings", (result) => {
      const settings = { ...(result.bb_settings || {}), ...message.settings };
      chrome.storage.local.set({ bb_settings: settings });
      sendResponse(settings);
    });
    return true;
  }

  if (message.type === "IMPORT_X_BOOKMARK") {
    importXBookmark(
      message.url,
      message.title,
      message.metadata || {}
    ).then(result => sendResponse(result));
    return true;
  }
});

// --- Import X Bookmark (silent, for bulk imports) ---
async function importXBookmark(url, title, metadata = {}) {
  // Check if already exists
  const existing = await chrome.bookmarks.search({ url });
  if (existing.length > 0) {
    return { status: "duplicate", bookmark: existing[0] };
  }

  // Find or create X Imports folder inside BookmarkBuddy folder
  const bbFolder = await getOrCreateFolder("BookmarkBuddy");
  const importFolderName = metadata.source === "x-likes-import" ? "X Likes" : "X Bookmarks";

  // Search for subfolder inside BookmarkBuddy
  const subResults = await chrome.bookmarks.getChildren(bbFolder.id);
  let importFolder = subResults.find(r => r.title === importFolderName && !r.url);
  if (!importFolder) {
    importFolder = await chrome.bookmarks.create({ parentId: bbFolder.id, title: importFolderName });
  }

  const bookmark = await chrome.bookmarks.create({
    parentId: importFolder.id,
    title: title,
    url: url,
  });

  // Save metadata
  const categoryData = await chrome.storage.local.get("bb_categories");
  const categories = categoryData.bb_categories || {};
  categories[bookmark.id] = {
    ...metadata,
    savedAt: Date.now(),
  };
  await chrome.storage.local.set({ bb_categories: categories });

  return { status: "created", bookmark };
}

// --- Get all bookmarks with metadata ---
async function getAllBookmarks() {
  const tree = await chrome.bookmarks.getTree();
  const storageData = await chrome.storage.local.get(["bb_favorites", "bb_categories"]);
  const favorites = new Set(storageData.bb_favorites || []);
  const categories = storageData.bb_categories || {};

  const bookmarks = [];
  function traverse(nodes, folderName = "") {
    for (const node of nodes) {
      if (node.url) {
        bookmarks.push({
          id: node.id,
          title: node.title || node.url,
          url: node.url,
          dateAdded: node.dateAdded,
          folder: folderName,
          isFavorite: favorites.has(node.id),
          metadata: categories[node.id] || {},
        });
      }
      if (node.children) {
        traverse(node.children, node.title || folderName);
      }
    }
  }
  traverse(tree);
  return bookmarks;
}

// --- Notification helper ---
function notifyUser(title, message) {
  // Use badge text briefly
  chrome.action.setBadgeText({ text: "✓" });
  chrome.action.setBadgeBackgroundColor({ color: "#6366f1" });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000);
}

// --- Utility ---
function truncate(str, len) {
  if (str.length <= len) return str;
  return str.slice(0, len) + "…";
}

// --- Open side panel on action click (optional) ---
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});
