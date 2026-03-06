# BookmarkBuddy 🔖

A modern, visual Chrome bookmarks manager with smart categorization, favorites, duplicate detection, and X/Twitter integration.

## Features

- **Card Grid Layout** — Visual bookmark cards with favicons, titles, domains, and category tags. Toggle between grid and list views.
- **Smart Auto-Categorization** — Bookmarks are automatically categorized (Streaming, Development, AI Tools, Education, Social, Communication, Shopping, News, Reference) based on their URL.
- **Favorites / Pinned** — Star any bookmark to pin it. View all favorites in a dedicated tab.
- **Duplicate Detection** — Identifies domains with multiple bookmarks so you can clean up redundant saves.
- **X/Twitter Integration** — Automatically captures posts when you press X's bookmark button. Also saves post metadata (author, text preview). Includes a dedicated "X Posts" tab.
- **Right-Click Context Menu** — Right-click any page or link and select "Save to BookmarkBuddy" to save it. Option to save directly as a favorite.
- **Search & Sort** — Search across titles, URLs, and categories. Sort by newest, oldest, or alphabetical.
- **Bulk Operations** — Select multiple bookmarks and delete them all at once.
- **Edit & Delete** — Hover any bookmark to edit its title/URL or delete it.
- **Side Panel** — Open the manager as a Chrome Side Panel for quick access while browsing.
- **Full Page Manager** — Rich, full-page interface for managing large bookmark collections.

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right)
4. Click **"Load unpacked"**
5. Select the `bookmark-manager-extension` folder
6. The BookmarkBuddy icon will appear in your toolbar!

## How to Use

### Toolbar Popup
Click the BookmarkBuddy icon in your toolbar for a quick-access popup with search, tabs, and sorting.

### Side Panel
Click the "Panel" button in the popup (or right-click the extension icon → "Open Side Panel") to open the manager in Chrome's side panel.

### Full Page Manager
Click the "Full" button in the popup to open the complete manager in a new tab with the card grid layout and all features.

### X/Twitter Integration

**Auto-capture (any X page):**
1. Visit x.com
2. Press the bookmark button on any post
3. The post URL + metadata will automatically save to BookmarkBuddy
4. A small toast notification confirms the save
5. View all saved X posts in the "X Posts" tab

**Import X Bookmarks (page capture):**
X doesn't include bookmarks in their data export, so we capture them directly:
1. Click "Import from 𝕏" in the full page manager
2. Under the "X Bookmarks" tab, click "Open x.com/i/bookmarks"
3. A floating "BookmarkBuddy" capture bar appears at the top of the page
4. Scroll down to load more posts, or click "Start Auto-Scroll" to load them automatically
5. Click "Save All" when done — all captured posts are imported with metadata

**Import X Likes (file import):**
1. Click "Import from 𝕏" in the full page manager
2. Switch to the "X Likes" tab
3. Follow the steps to download your X data archive (Settings → Your Account → Download an archive)
4. Unzip and drag `data/like.js` into the dropzone
5. Click "Import Likes" — all your likes are imported with text previews

You can toggle auto-capture on/off in the full page manager header.

### Right-Click Menu
Right-click on any webpage or link and choose:
- **"Save to BookmarkBuddy"** — Saves the page/link
- **"Save to BookmarkBuddy ⭐ (as Favorite)"** — Saves and marks as favorite

## Architecture

```
bookmark-manager-extension/
├── manifest.json              # Chrome Extension manifest (MV3)
├── icons/                     # Extension icons
├── src/
│   ├── background.js          # Service worker (context menus, bookmark CRUD, messaging)
│   ├── content-x.js           # X/Twitter content script (intercepts bookmark clicks)
│   ├── content-x-bookmarks.js # X bookmarks page scraper (capture bar + auto-scroll)
│   ├── content-x.css          # Toast notification styles for X
│   ├── popup.html/js          # Toolbar popup UI
│   ├── sidepanel.html/js      # Side panel UI
│   └── manager.html/js        # Full page manager UI (card grid + X import)
```

## Permissions

- `bookmarks` — Read/write Chrome bookmarks
- `storage` — Store favorites, categories, and settings
- `contextMenus` — Right-click "Save to BookmarkBuddy" menu
- `activeTab` — Access current tab info when saving
- `sidePanel` — Chrome Side Panel API
- Host permissions for `x.com` and `twitter.com` for the content script
