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
        theme: "light-slate",
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

// --- Trash folder (for soft delete) ---
async function getTrashFolder() {
  // Try to find existing trash folder first
  const searchResults = await chrome.bookmarks.search({ title: "BookmarkBuddy Trash" });
  const existingTrash = searchResults.find(r => !r.url && r.title === "BookmarkBuddy Trash");
  if (existingTrash) return existingTrash;

  // Create trash folder under Other Bookmarks (or first root folder)
  const tree = await chrome.bookmarks.getTree();
  const rootChildren = tree[0]?.children || [];
  const otherBookmarks = rootChildren.find(
    n => n.title && (n.title === "Other Bookmarks" || n.title === "Other bookmarks")
  );
  const parentId = otherBookmarks?.id || rootChildren[0]?.id || "1";

  const children = await chrome.bookmarks.getChildren(parentId);
  let trash = children.find(c => !c.url && c.title === "BookmarkBuddy Trash");
  if (!trash) {
    trash = await chrome.bookmarks.create({ parentId, title: "BookmarkBuddy Trash" });
  }
  return trash;
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
    (async () => {
      try {
        const nodes = await chrome.bookmarks.get(message.id);
        const node = nodes[0];
        if (!node) { sendResponse({ status: "error", msg: "Bookmark not found" }); return; }
        const trashFolder = await getTrashFolder();
        const trashData = await chrome.storage.local.get("bb_trash");
        const trash = trashData.bb_trash || {};
        trash[message.id] = { parentId: node.parentId, deletedAt: Date.now() };
        await chrome.storage.local.set({ bb_trash: trash });
        await chrome.bookmarks.move(message.id, { parentId: trashFolder.id });
        sendResponse({ status: "moved_to_trash", id: message.id });
      } catch (err) {
        sendResponse({ status: "error", msg: err?.message || "Move failed" });
      }
    })();
    return true;
  }

  if (message.type === "RESTORE_BOOKMARK") {
    (async () => {
      const trashData = await chrome.storage.local.get("bb_trash");
      const trash = trashData.bb_trash || {};
      const info = trash[message.id];
      if (!info) { sendResponse({ status: "error" }); return; }
      await chrome.bookmarks.move(message.id, { parentId: info.parentId });
      delete trash[message.id];
      await chrome.storage.local.set({ bb_trash: trash });
      sendResponse({ status: "restored" });
    })();
    return true;
  }

  if (message.type === "RESTORE_BOOKMARKS_BULK") {
    (async () => {
      const trashData = await chrome.storage.local.get("bb_trash");
      const trash = trashData.bb_trash || {};
      let restored = 0;
      for (const id of message.ids) {
        const info = trash[id];
        if (info) {
          try {
            await chrome.bookmarks.move(id, { parentId: info.parentId });
            delete trash[id];
            restored++;
          } catch (_) {}
        }
      }
      await chrome.storage.local.set({ bb_trash: trash });
      sendResponse({ status: "restored", count: restored });
    })();
    return true;
  }

  if (message.type === "PERMANENT_DELETE_BOOKMARKS_BULK") {
    Promise.all(message.ids.map(id => chrome.bookmarks.remove(id))).then(() => {
      chrome.storage.local.get(["bb_categories", "bb_favorites", "bb_trash"], (result) => {
        const categories = result.bb_categories || {};
        const idSet = new Set(message.ids);
        message.ids.forEach(id => delete categories[id]);
        const favorites = (result.bb_favorites || []).filter(f => !idSet.has(f));
        const trash = result.bb_trash || {};
        message.ids.forEach(id => delete trash[id]);
        chrome.storage.local.set({ bb_categories: categories, bb_favorites: favorites, bb_trash: trash });
      });
      sendResponse({ status: "deleted", count: message.ids.length });
    });
    return true;
  }

  if (message.type === "PERMANENT_DELETE_BOOKMARK") {
    chrome.bookmarks.remove(message.id).then(() => {
      chrome.storage.local.get(["bb_categories", "bb_favorites", "bb_trash"], (result) => {
        const categories = result.bb_categories || {};
        delete categories[message.id];
        const favorites = (result.bb_favorites || []).filter(f => f !== message.id);
        const trash = result.bb_trash || {};
        delete trash[message.id];
        chrome.storage.local.set({ bb_categories: categories, bb_favorites: favorites, bb_trash: trash });
      });
      sendResponse({ status: "deleted" });
    });
    return true;
  }

  if (message.type === "DELETE_BOOKMARKS_BULK") {
    (async () => {
      try {
        const trashFolder = await getTrashFolder();
        const trashData = await chrome.storage.local.get("bb_trash");
        const trash = { ...(trashData.bb_trash || {}) };
        for (const id of message.ids) {
          try {
            const nodes = await chrome.bookmarks.get(id);
            if (nodes[0]) {
              trash[id] = { parentId: nodes[0].parentId, deletedAt: Date.now() };
              await chrome.bookmarks.move(id, { parentId: trashFolder.id });
            }
          } catch (_) {}
        }
        await chrome.storage.local.set({ bb_trash: trash });
        sendResponse({ status: "moved_to_trash", count: message.ids.length });
      } catch (err) {
        sendResponse({ status: "error", msg: err?.message || "Move failed" });
      }
    })();
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
    (async () => {
      let windowId = sender.tab?.windowId;
      if (!windowId) {
        const win = await chrome.windows.getLastFocused();
        windowId = win?.id;
      }
      if (windowId) await chrome.sidePanel.open({ windowId });
      sendResponse({ status: "opened" });
    })();
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

// --- Root folder name normalization ---
// Chrome's root bookmark tree (id "0") has children like:
//   id "1" = "Bookmarks Bar"
//   id "2" = "Other bookmarks" (or "Other Bookmarks")
//   id "3" = "Mobile bookmarks" (or "Mobile Bookmarks")
// Shopping List is usually a subfolder inside "Other bookmarks" managed by Chrome
const ROOT_FOLDER_MAP = {
  "bookmarks bar": "Bookmarks Bar",
  "bookmark bar": "Bookmarks Bar",
  "other bookmarks": "Other Bookmarks",
  "mobile bookmarks": "Mobile Bookmarks",
  "shopping list": "Shopping List",
};

function normalizeRootFolder(name) {
  const lower = (name || "").toLowerCase();
  return ROOT_FOLDER_MAP[lower] || name;
}

// --- Get all bookmarks with metadata ---
async function getAllBookmarks() {
  const tree = await chrome.bookmarks.getTree();
  const storageData = await chrome.storage.local.get(["bb_favorites", "bb_categories"]);
  const favorites = new Set(storageData.bb_favorites || []);
  const categories = storageData.bb_categories || {};

  const bookmarks = [];
  const xPosts = [];

  // The root node (id "0") has children that are the top-level folders
  const rootChildren = tree[0]?.children || [];

  function traverse(nodes, rootFolder = "", folderPath = "", skipTrash = false) {
    for (const node of nodes) {
      if (skipTrash && !node.url && node.title === "BookmarkBuddy Trash") continue;
      if (node.url) {
        const meta = categories[node.id] || {};
        const isXPost = meta.source === "x.com" ||
          meta.source === "x-bookmarks-scrape" ||
          meta.source === "x-likes-import";

        const entry = {
          id: node.id,
          title: node.title || node.url,
          url: node.url,
          dateAdded: node.dateAdded,
          folder: folderPath,
          rootFolder: rootFolder,
          isFavorite: favorites.has(node.id),
          metadata: meta,
        };

        if (isXPost) {
          xPosts.push(entry);
        } else {
          bookmarks.push(entry);
        }
      }
      if (node.children) {
        traverse(node.children, rootFolder, node.title || folderPath, skipTrash);
      }
    }
  }

  // Traverse each root-level folder separately to tag rootFolder (skip trash)
  for (const rootNode of rootChildren) {
    const rootName = normalizeRootFolder(rootNode.title);

    // Check for Shopping List as a subfolder
    if (rootNode.children) {
      const shoppingIdx = rootNode.children.findIndex(
        c => c.title && c.title.toLowerCase() === "shopping list" && !c.url
      );
      if (shoppingIdx !== -1) {
        const shoppingNode = rootNode.children[shoppingIdx];
        traverse(shoppingNode.children || [], "Shopping List", "Shopping List", true);
        // Also traverse the rest of this root's children (excluding shopping list)
        const otherChildren = rootNode.children.filter((_, i) => i !== shoppingIdx);
        traverse(otherChildren, rootName, rootName, true);
        continue;
      }
    }

    if (rootNode.url) {
      // Rare: a bookmark directly under root
      const meta = categories[rootNode.id] || {};
      bookmarks.push({
        id: rootNode.id,
        title: rootNode.title || rootNode.url,
        url: rootNode.url,
        dateAdded: rootNode.dateAdded,
        folder: rootName,
        rootFolder: rootName,
        isFavorite: favorites.has(rootNode.id),
        metadata: meta,
      });
    } else if (rootNode.children) {
      traverse(rootNode.children, rootName, rootName, true);
    }
  }

  // Get trash bookmarks (excluded from main list)
  const trashBookmarks = [];
  try {
    const trashFolder = await getTrashFolder();
    const trashChildren = await chrome.bookmarks.getChildren(trashFolder.id);
    for (const node of trashChildren) {
      if (node.url) {
        const meta = categories[node.id] || {};
        trashBookmarks.push({
          id: node.id,
          title: node.title || node.url,
          url: node.url,
          dateAdded: node.dateAdded,
          folder: "Trash",
          rootFolder: "Trash",
          isFavorite: favorites.has(node.id),
          metadata: meta,
        });
      }
    }
  } catch (_) {}

  return { bookmarks, xPosts, trashBookmarks };
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
