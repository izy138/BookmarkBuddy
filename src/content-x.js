// ============================================
// BookmarkBuddy - X/Twitter Content Script
// ============================================
// Intercepts bookmark actions on x.com and saves the post to the extension.
// X shows the bookmark option inside the share dropdown (React portal), so the
// bookmark click is NOT inside the tweet article. We store the article when
// the share button is clicked, then use it when the bookmark option is selected.

(function () {
  "use strict";

  let lastProcessedUrl = "";
  let storedArticle = null; // Tweet being shared when user opens share menu
  const DEBOUNCE_MS = 500;
  const STORED_ARTICLE_TTL = 10000; // 10s - clear if dropdown closed without bookmarking

  // --- Utility: Extract post data from a tweet article element ---
  function extractPostData(articleEl) {
    if (!articleEl) return null;

    try {
      // Find the post link (timestamp link contains the post URL)
      const timeLink = articleEl.querySelector('a[href*="/status/"] time')?.closest("a");
      const postUrl = timeLink ? `https://x.com${new URL(timeLink.href).pathname}` : null;

      if (!postUrl) return null;

      // Author info
      const authorNameEl = articleEl.querySelector('[data-testid="User-Name"]');
      let author = "";
      let authorHandle = "";
      if (authorNameEl) {
        const spans = authorNameEl.querySelectorAll("span");
        for (const span of spans) {
          const text = span.textContent.trim();
          if (text && !text.startsWith("@") && !author) author = text;
          if (text.startsWith("@")) { authorHandle = text; break; }
        }
      }

      // Post text
      const tweetTextEl = articleEl.querySelector('[data-testid="tweetText"]');
      const postText = tweetTextEl ? tweetTextEl.textContent.trim() : "";

      // Post image
      const imgEl = articleEl.querySelector('[data-testid="tweetPhoto"] img');
      const postImage = imgEl ? imgEl.src : null;

      const title = `${author || authorHandle || "Post"}: "${truncateText(postText, 80)}" on X`;

      return { postUrl, author, authorHandle, postText, postImage, title };
    } catch (e) {
      console.error("[BookmarkBuddy] Error extracting post data:", e);
      return null;
    }
  }

  // --- Check if clicked element is the bookmark option (in share dropdown) ---
  function isBookmarkOption(el) {
    if (!el) return false;
    const btn = el.closest('[data-testid="bookmark"], [data-testid="appBookmark"], [data-testid="removeBookmark"]');
    if (btn) return btn.getAttribute("data-testid") !== "removeBookmark";

    // Fallback: menu item with bookmark text (dropdown uses various structures)
    const text = (el.textContent || el.getAttribute("aria-label") || "").toLowerCase();
    return text.includes("bookmark") && !text.includes("remove");
  }

  // --- Check if clicked element is the share button ---
  function isShareButton(el) {
    if (!el) return false;
    return !!el.closest('[data-testid="share"]');
  }

  // --- Watch for share + bookmark flow ---
  function setupBookmarkInterceptor() {
    document.addEventListener("click", (e) => {
      // 1. Share button clicked → store the tweet article for later
      if (isShareButton(e.target)) {
        const article = e.target.closest("article");
        if (article) {
          storedArticle = article;
          setTimeout(() => { storedArticle = null; }, STORED_ARTICLE_TTL);
        }
        return;
      }

      // 2. Bookmark option clicked (in dropdown - usually NOT inside article)
      if (!isBookmarkOption(e.target)) return;

      const article = e.target.closest("article") || storedArticle;
      const postData = extractPostData(article);

      if (!postData || !postData.postUrl) return;

      storedArticle = null; // consumed

      if (postData.postUrl === lastProcessedUrl) return;
      lastProcessedUrl = postData.postUrl;
      setTimeout(() => { lastProcessedUrl = ""; }, DEBOUNCE_MS);

      chrome.runtime.sendMessage({
        type: "SAVE_X_BOOKMARK",
        url: postData.postUrl,
        title: postData.title,
        author: postData.author,
        authorHandle: postData.authorHandle,
        postText: postData.postText,
        postImage: postData.postImage,
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn("[BookmarkBuddy]", chrome.runtime.lastError.message);
          return;
        }
        if (response?.status === "created") {
          showToast("Saved to BookmarkBuddy!");
        } else if (response?.status === "duplicate") {
          showToast("Already in BookmarkBuddy");
        }
      });
    }, true);
  }

  // --- Toast notification overlay ---
  function showToast(message) {
    // Remove any existing toast
    const existing = document.getElementById("bb-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "bb-toast";
    toast.innerHTML = `
      <div class="bb-toast-inner">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2.5">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
        </svg>
        <span>${message}</span>
      </div>
    `;
    document.body.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => toast.classList.add("bb-toast-show"));

    // Remove after 2.5s
    setTimeout(() => {
      toast.classList.remove("bb-toast-show");
      toast.classList.add("bb-toast-hide");
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // --- Utility ---
  function truncateText(text, maxLen) {
    if (!text) return "";
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen).trim() + "…";
  }

  // --- Initialize ---
  // Check if auto-capture is enabled
  chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (settings) => {
    if (chrome.runtime.lastError) {
      // Extension context invalidated, just set up anyway
      setupBookmarkInterceptor();
      return;
    }
    if (settings?.autoCapture !== false) {
      setupBookmarkInterceptor();
    }
  });

  console.log("[BookmarkBuddy] Content script loaded on", window.location.hostname);
})();
