(() => {
  if (window.top !== window || window.__rgCoomerLoaded) return;
  window.__rgCoomerLoaded = true;

  const BUTTON_CLASS = "rg-coomer-download";
  const LINK_HOST_CLASS = "rg-coomer-media-link";
  const VIDEO_HOST_CLASS = "rg-coomer-video-host";
  const STYLE_ID = "rg-coomer-style";
  const SETTINGS_KEY = globalThis.RG_SETTINGS.SETTINGS_KEY;
  let settings = { ...globalThis.RG_SETTINGS.DEFAULT_SETTINGS };
  let scanScheduled = false;

  function isPostPage() {
    return /^\/[^/]+\/user\/[^/]+\/post\/[^/?]+\/?$/i.test(location.pathname);
  }

  function mediaKind(url) {
    let value = String(url || "");
    try {
      const parsed = new URL(value, location.href);
      value = `${parsed.pathname} ${parsed.searchParams.get("f") || ""}`;
    } catch { /* keep raw */ }
    if (/\.(?:jpg|jpeg|png|webp|gif)(?:\s|$)/i.test(value)) return "image";
    if (/\.(?:mp4|webm|mov|m4v)(?:\s|$)/i.test(value)) return "video";
    return "";
  }

  function directMediaUrl(value) {
    try {
      const parsed = new URL(String(value || ""), location.href);
      const isCoomerHost = parsed.hostname === "coomer.st" || parsed.hostname.endsWith(".coomer.st");
      return isCoomerHost && parsed.pathname.startsWith("/data/") && mediaKind(parsed.href)
        ? parsed.href
        : "";
    } catch {
      return "";
    }
  }

  function directThumbnailUrl(value) {
    try {
      const parsed = new URL(String(value || ""), location.href);
      return parsed.hostname === "img.coomer.st"
        && parsed.pathname.startsWith("/thumbnail/data/")
        && mediaKind(parsed.href) === "image"
        ? parsed.href
        : "";
    } catch {
      return "";
    }
  }

  function profileName() {
    const direct = document.querySelector(".post__user-name, .user-header__name");
    if (direct?.textContent?.trim()) return globalThis.RG_SETTINGS.cleanPathPart(direct.textContent.trim(), "user");
    const headerSpans = [...document.querySelectorAll("main section header h1 a span")];
    const xpathEquivalent = headerSpans.findLast?.((span) => span.textContent?.trim())
      || [...headerSpans].reverse().find((span) => span.textContent?.trim());
    if (xpathEquivalent?.textContent?.trim()) {
      return globalThis.RG_SETTINGS.cleanPathPart(xpathEquivalent.textContent.trim(), "user");
    }
    const id = location.pathname.match(/\/user\/([^/]+)/i)?.[1] || "user";
    return globalThis.RG_SETTINGS.cleanPathPart(id, "user");
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .${LINK_HOST_CLASS} {
        position: relative !important; display: inline-block !important; vertical-align: top !important;
        line-height: 0 !important; overflow: visible !important;
      }
      .${VIDEO_HOST_CLASS} { position: relative !important; }
      .${BUTTON_CLASS} {
        all: initial !important; position: absolute !important; left: 8px !important; top: 8px !important;
        z-index: 2147483647 !important; width: 40px !important; height: 40px !important;
        display: grid !important; place-items: center !important; box-sizing: border-box !important;
        border: 0 !important; border-radius: 999px !important; color: #fff !important;
        background: rgba(37,99,235,.94) !important; box-shadow: 0 6px 18px rgba(0,0,0,.48) !important;
        cursor: pointer !important; pointer-events: auto !important;
      }
      .${BUTTON_CLASS}:hover { background: #1d4ed8 !important; }
      .${BUTTON_CLASS}:disabled { opacity: .58 !important; cursor: wait !important; }
      .${BUTTON_CLASS} svg { width: 22px !important; height: 22px !important; pointer-events: none !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function sendDownload(url, fallbackUrl, userName) {
    // The already-rendered thumbnail is the fast, browser-context equivalent
    // of "Save image as". Coomer's full-size CDN can take 10-15 seconds even
    // before chrome.downloads returns an id, so use the loaded image first.
    const urls = [...new Set([fallbackUrl, url].filter(Boolean))];
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: "DIRECT_DOWNLOAD",
        urls,
        folderName: userName,
        skipReachability: true,
        fallbackOnNoTransfer: urls.length > 1,
        transferTimeoutMs: fallbackUrl ? 900 : 2500,
        namingUrl: url,
        preserveAlternatives: true,
        allowRipsnipFallback: false
      }, (result) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (!result || result.ok === false) reject(new Error(result?.error || "Download failed"));
        else resolve(result);
      });
    });
  }

  function makeButton(url, kind, fallbackUrl = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = BUTTON_CLASS;
    button.dataset.rgKind = kind;
    button.title = kind === "video" ? "Videoyu indir" : "Görseli indir";
    button.setAttribute("aria-label", button.title);
    button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3v11m0 0 4-4m-4 4-4-4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
    </svg>`;
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (button.disabled) return;
      button.disabled = true;
      try {
        await sendDownload(url, fallbackUrl, profileName());
        button.style.setProperty("background", "#15803d", "important");
        setTimeout(() => button.style.removeProperty("background"), 900);
      } catch (error) {
        console.error("[rg-coomer] download failed", error);
        button.style.setProperty("background", "#b91c1c", "important");
        button.title = String(error?.message || error || "E_FAILED");
      } finally {
        button.disabled = false;
      }
    });
    return button;
  }

  function removeButtons() {
    document.querySelectorAll(`.${BUTTON_CLASS}`).forEach((button) => button.remove());
    document.querySelectorAll(`.${LINK_HOST_CLASS}`).forEach((element) => element.classList.remove(LINK_HOST_CLASS));
    document.querySelectorAll(`.${VIDEO_HOST_CLASS}`).forEach((element) => element.classList.remove(VIDEO_HOST_CLASS));
  }

  function addLinkButton(anchor, url, kind) {
    if (anchor.querySelector(`:scope > .${BUTTON_CLASS}`)) return;
    anchor.classList.add(LINK_HOST_CLASS);
    const media = anchor.querySelector(kind === "image" ? "img" : "video");
    const loadedUrl = kind === "image"
      ? directThumbnailUrl(media?.currentSrc || media?.getAttribute("src"))
      : "";
    anchor.appendChild(makeButton(url, kind, loadedUrl));
  }

  function videoSource(video) {
    const values = [
      video.currentSrc,
      video.getAttribute("src"),
      ...[...video.querySelectorAll("source[src]")].map((source) => source.getAttribute("src"))
    ];
    const urls = [...new Set(values.map(directMediaUrl).filter(Boolean))];
    return urls.find((url) => /\.mp4(?:$|[?#])/i.test(url)) || urls[0] || "";
  }

  function addVideoButton(video, url) {
    const host = video.parentElement;
    if (!host || host.querySelector(`:scope > .${BUTTON_CLASS}[data-rg-kind="video"]`)) return;
    host.classList.add(VIDEO_HOST_CLASS);
    host.appendChild(makeButton(url, "video"));
  }

  function scan() {
    if (!settings.coomerButtons || !isPostPage()) {
      removeButtons();
      return;
    }
    ensureStyle();
    for (const anchor of document.querySelectorAll("main a[href]")) {
      const url = directMediaUrl(anchor.href);
      const kind = mediaKind(url);
      if (url && kind) addLinkButton(anchor, url, kind);
    }
    for (const video of document.querySelectorAll("main video")) {
      const url = videoSource(video);
      if (url) addVideoButton(video, url);
    }
  }

  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(() => {
      scanScheduled = false;
      scan();
    });
  }

  new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", scheduleScan);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[SETTINGS_KEY]) return;
    settings = { ...globalThis.RG_SETTINGS.DEFAULT_SETTINGS, ...(changes[SETTINGS_KEY].newValue || {}) };
    scheduleScan();
  });
  chrome.storage.local.get(SETTINGS_KEY, (items) => {
    settings = { ...globalThis.RG_SETTINGS.DEFAULT_SETTINGS, ...(items?.[SETTINGS_KEY] || {}) };
    scan();
  });
})();
