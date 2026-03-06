// ============================================
// BookmarkBuddy - X Bookmarks Page Scraper
// ============================================
// Activates on x.com/i/bookmarks to capture all visible posts
// with a floating toolbar and optional auto-scroll.

(function () {
  "use strict";

  // Only run on the bookmarks page
  if (!window.location.pathname.startsWith("/i/bookmarks")) return;

  const capturedPosts = new Map(); // tweetId -> post data
  let isAutoScrolling = false;
  let autoScrollInterval = null;
  let observer = null;

  // --- Extract post data from an article element ---
  function extractPost(article) {
    try {
      const timeLink = article.querySelector('a[href*="/status/"] time')?.closest("a");
      if (!timeLink) return null;

      const href = timeLink.getAttribute("href");
      const match = href.match(/\/([^/]+)\/status\/(\d+)/);
      if (!match) return null;

      const authorHandle = match[1];
      const tweetId = match[2];
      const postUrl = `https://x.com/${authorHandle}/status/${tweetId}`;

      // Already captured?
      if (capturedPosts.has(tweetId)) return null;

      // Author display name
      const nameEl = article.querySelector('[data-testid="User-Name"]');
      let author = "";
      if (nameEl) {
        const spans = nameEl.querySelectorAll("span");
        for (const span of spans) {
          const text = span.textContent.trim();
          if (text && !text.startsWith("@") && !text.includes("·") && text.length > 0) {
            author = text;
            break;
          }
        }
      }

      // Post text
      const textEl = article.querySelector('[data-testid="tweetText"]');
      const postText = textEl ? textEl.textContent.trim() : "";

      // Build a nice title
      const title = postText
        ? `${author || `@${authorHandle}`}: "${postText.slice(0, 80)}${postText.length > 80 ? '…' : ''}" on X`
        : `${author || `@${authorHandle}`}'s post on X`;

      return { tweetId, postUrl, author, authorHandle: `@${authorHandle}`, postText, title };
    } catch (e) {
      console.error("[BookmarkBuddy] Extract error:", e);
      return null;
    }
  }

  // --- Scan all visible articles ---
  function scanArticles() {
    const articles = document.querySelectorAll("article");
    let newCount = 0;
    articles.forEach(article => {
      const post = extractPost(article);
      if (post) {
        capturedPosts.set(post.tweetId, post);
        newCount++;
      }
    });
    updateUI();
    return newCount;
  }

  // --- Create floating capture bar ---
  function createCaptureBar() {
    const bar = document.createElement("div");
    bar.id = "bb-capture-bar";
    bar.innerHTML = `
      <div class="bb-capture-inner">
        <div class="bb-capture-left">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2.5">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
          <span class="bb-capture-title">BookmarkBuddy</span>
          <span class="bb-capture-count" id="bb-count">0 posts captured</span>
        </div>
        <div class="bb-capture-right">
          <button id="bb-scan-btn" class="bb-btn bb-btn-secondary">Scan Page</button>
          <button id="bb-autoscroll-btn" class="bb-btn bb-btn-secondary">Start Auto-Scroll</button>
          <button id="bb-save-btn" class="bb-btn bb-btn-primary" disabled>Save All</button>
        </div>
      </div>
    `;
    document.body.appendChild(bar);

    // Events
    document.getElementById("bb-scan-btn").addEventListener("click", () => {
      const found = scanArticles();
      showCaptureFeedback(found > 0 ? `+${found} new` : "No new posts");
    });

    document.getElementById("bb-autoscroll-btn").addEventListener("click", toggleAutoScroll);
    document.getElementById("bb-save-btn").addEventListener("click", saveAllCaptured);
  }

  function updateUI() {
    const countEl = document.getElementById("bb-count");
    const saveBtn = document.getElementById("bb-save-btn");
    if (countEl) countEl.textContent = `${capturedPosts.size} post${capturedPosts.size !== 1 ? 's' : ''} captured`;
    if (saveBtn) saveBtn.disabled = capturedPosts.size === 0;
  }

  function showCaptureFeedback(text) {
    const countEl = document.getElementById("bb-count");
    if (!countEl) return;
    const original = countEl.textContent;
    countEl.textContent = text;
    countEl.style.color = "#10b981";
    setTimeout(() => {
      countEl.textContent = `${capturedPosts.size} post${capturedPosts.size !== 1 ? 's' : ''} captured`;
      countEl.style.color = "";
    }, 1500);
  }

  // --- Auto-scroll ---
  function toggleAutoScroll() {
    const btn = document.getElementById("bb-autoscroll-btn");
    if (isAutoScrolling) {
      stopAutoScroll();
      btn.textContent = "Start Auto-Scroll";
      btn.classList.remove("bb-btn-active");
    } else {
      startAutoScroll();
      btn.textContent = "Stop Auto-Scroll";
      btn.classList.add("bb-btn-active");
    }
  }

  function startAutoScroll() {
    isAutoScrolling = true;
    let lastHeight = 0;
    let staleCount = 0;

    autoScrollInterval = setInterval(() => {
      scanArticles();
      window.scrollBy({ top: 600, behavior: "smooth" });

      const currentHeight = document.documentElement.scrollHeight;
      if (currentHeight === lastHeight) {
        staleCount++;
        if (staleCount > 5) {
          // Reached the bottom
          stopAutoScroll();
          document.getElementById("bb-autoscroll-btn").textContent = "Done — Reached End";
          document.getElementById("bb-autoscroll-btn").classList.remove("bb-btn-active");
          showCaptureFeedback("Scroll complete!");
        }
      } else {
        staleCount = 0;
      }
      lastHeight = currentHeight;
    }, 1200);
  }

  function stopAutoScroll() {
    isAutoScrolling = false;
    if (autoScrollInterval) {
      clearInterval(autoScrollInterval);
      autoScrollInterval = null;
    }
  }

  // --- Save all captured posts ---
  async function saveAllCaptured() {
    const saveBtn = document.getElementById("bb-save-btn");
    if (capturedPosts.size === 0) return;

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";

    const posts = Array.from(capturedPosts.values());
    let imported = 0;
    let skipped = 0;

    // Batch send to background
    const BATCH = 10;
    for (let i = 0; i < posts.length; i += BATCH) {
      const batch = posts.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map(post =>
          chrome.runtime.sendMessage({
            type: "IMPORT_X_BOOKMARK",
            url: post.postUrl,
            title: post.title,
            metadata: {
              source: "x-bookmarks-scrape",
              author: post.author,
              authorHandle: post.authorHandle,
              postText: post.postText,
              tweetId: post.tweetId,
            },
          })
        )
      );
      results.forEach(r => {
        if (r?.status === "created") imported++;
        else skipped++;
      });

      // Update button with progress
      const pct = Math.round(((i + batch.length) / posts.length) * 100);
      saveBtn.textContent = `Saving… ${pct}%`;
    }

    saveBtn.textContent = `✓ Saved ${imported}${skipped > 0 ? ` (${skipped} existed)` : ''}`;
    saveBtn.style.background = "#10b981";

    showToast(`Saved ${imported} X bookmark${imported !== 1 ? 's' : ''} to BookmarkBuddy!`);

    // Reset after delay
    setTimeout(() => {
      saveBtn.textContent = "Save All";
      saveBtn.style.background = "";
      saveBtn.disabled = capturedPosts.size === 0;
    }, 3000);
  }

  // --- Toast (reuse from content-x.js if available, otherwise create) ---
  function showToast(message) {
    const existing = document.getElementById("bb-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "bb-toast";
    toast.innerHTML = `
      <div class="bb-toast-inner">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        <span>${message}</span>
      </div>
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("bb-toast-show"));
    setTimeout(() => {
      toast.classList.remove("bb-toast-show");
      toast.classList.add("bb-toast-hide");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // --- MutationObserver to catch dynamically loaded posts ---
  function startObserving() {
    observer = new MutationObserver(() => {
      scanArticles();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // --- Inject styles ---
  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      #bb-capture-bar {
        position: fixed; top: 0; left: 0; right: 0; z-index: 999998;
        background: linear-gradient(180deg, rgba(11,17,33,0.98) 0%, rgba(11,17,33,0.95) 100%);
        backdrop-filter: blur(12px);
        border-bottom: 1px solid rgba(99,102,241,0.2);
        box-shadow: 0 4px 20px rgba(0,0,0,0.4);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        animation: bb-slideDown 0.3s ease;
      }
      @keyframes bb-slideDown {
        from { transform: translateY(-100%); }
        to { transform: translateY(0); }
      }
      .bb-capture-inner {
        max-width: 1200px; margin: 0 auto; padding: 10px 20px;
        display: flex; align-items: center; justify-content: space-between; gap: 16px;
      }
      .bb-capture-left { display: flex; align-items: center; gap: 10px; }
      .bb-capture-title { color: #f1f5f9; font-size: 14px; font-weight: 700; }
      .bb-capture-count {
        color: #94a3b8; font-size: 13px; font-weight: 500;
        background: rgba(255,255,255,0.06); padding: 3px 10px; border-radius: 6px;
        transition: color 0.3s;
      }
      .bb-capture-right { display: flex; align-items: center; gap: 8px; }
      .bb-btn {
        padding: 7px 16px; border-radius: 8px; border: none; cursor: pointer;
        font-size: 13px; font-weight: 600; font-family: inherit; transition: all 0.15s;
      }
      .bb-btn-secondary {
        background: rgba(255,255,255,0.06); color: #94a3b8;
        border: 1px solid rgba(255,255,255,0.1);
      }
      .bb-btn-secondary:hover { background: rgba(255,255,255,0.1); color: #e2e8f0; }
      .bb-btn-active {
        background: rgba(239,68,68,0.15) !important;
        color: #fca5a5 !important;
        border-color: rgba(239,68,68,0.3) !important;
      }
      .bb-btn-primary {
        background: #6366f1; color: #fff;
      }
      .bb-btn-primary:hover:not(:disabled) { background: #4f46e5; }
      .bb-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
    `;
    document.head.appendChild(style);
  }

  // --- Initialize ---
  // Wait a bit for the page to load
  setTimeout(() => {
    injectStyles();
    createCaptureBar();
    startObserving();
    // Initial scan
    setTimeout(scanArticles, 1000);
    console.log("[BookmarkBuddy] Bookmarks page scraper activated");
  }, 1500);

  // Cleanup on navigation
  window.addEventListener("beforeunload", () => {
    stopAutoScroll();
    if (observer) observer.disconnect();
  });
})();
