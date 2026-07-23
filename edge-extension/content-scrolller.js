(() => {
  if (window.__rgScrolllerLoaded) return;
  window.__rgScrolllerLoaded = true;
  console.info("%c[rg-scrolller] content script yüklendi", "color:#3b82f6;font-weight:bold");

  const BUTTON_ID = "rg-scrl-button";
  const STATUS_ID = "rg-scrl-status";
  const { SETTINGS_KEY, DEFAULT_SETTINGS } = globalThis.RG_SETTINGS;

  let settings = { ...DEFAULT_SETTINGS };
  let statusTimer = null;
  let hideTimer = null;
  // The media element the floating button is currently anchored to.
  // The button itself lives in documentElement (position:fixed) — the site's
  // DOM is never mutated, so Scrolller's virtual scrolling / fullscreen
  // viewer can't be broken by us.
  let anchoredMedia = null;

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function setStatus(text, level = "idle") {
    const el = document.getElementById(STATUS_ID);
    if (!el) return;
    if (statusTimer) clearTimeout(statusTimer);
    el.textContent = level === "error" ? text : "";
    el.dataset.level = level;
    if (text && level === "error") {
      statusTimer = setTimeout(() => {
        el.textContent = "";
        el.dataset.level = "idle";
        statusTimer = null;
      }, 4000);
    }
  }

  function toErr(e) {
    const t = String(e?.message || e || "");
    if (/not found|no media/i.test(t)) return "E_NO_MEDIA";
    if (/timed out/i.test(t)) return "E_TIMEOUT";
    if (/failed/i.test(t)) return "E_DOWNLOAD";
    return "E_FAILED";
  }

  function dlIcon() {
    return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3v11m0 0 4-4m-4 4-4-4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
    </svg>`;
  }

  function ensureUi() { installUi(); }

  function installUi() {
    if (document.getElementById(BUTTON_ID)) return;

    if (!document.getElementById("rg-scrl-style")) {
    const style = document.createElement("style");
    style.id = "rg-scrl-style";
    style.textContent = `
      #${STATUS_ID} {
        position: fixed; z-index: 2147483647; left: 50%; bottom: 28px;
        transform: translateX(-50%); max-width: min(280px, calc(100vw - 32px));
        padding: 9px 13px; border-radius: 999px; color: #fff;
        background: rgba(153,27,27,.68); backdrop-filter: blur(6px);
        font: 500 12px/1.25 system-ui,-apple-system,Segoe UI,sans-serif;
        text-align: center; pointer-events: none; display: none;
      }
      #${STATUS_ID}:not(:empty) { display: block; }
      #${BUTTON_ID} {
        position: fixed; z-index: 2147483647;
        width: 44px; height: 44px;
        border: 0; border-radius: 999px; padding: 0;
        display: none; place-items: center;
        color: #fff; background: rgba(37,99,235,.84);
        box-shadow: 0 8px 22px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.16);
        cursor: pointer;
        transition: background .12s;
      }
      #${BUTTON_ID}:hover { background: rgba(37,99,235,1); }
      #${BUTTON_ID}:disabled { opacity: .55; cursor: wait; }
      #${BUTTON_ID} svg { width: 55%; height: 55%; pointer-events: none; }
    `;
    document.documentElement.appendChild(style);
    }

    if (!document.getElementById(STATUS_ID)) {
      const status = document.createElement("div");
      status.id = STATUS_ID;
      status.dataset.level = "idle";
      document.documentElement.appendChild(status);
    }

    const btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.type = "button";
    btn.title = "İndir";
    btn.setAttribute("aria-label", "İndir");
    btn.innerHTML = dlIcon();
    btn.addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); });
    btn.addEventListener("click", runDownload);
    document.documentElement.appendChild(btn);
    console.info("%c[rg-scrolller] indirme butonu DOM'a eklendi", "color:#22c55e;font-weight:bold");
  }

  // ── URL / quality helpers ─────────────────────────────────────────────────

  // Scrolller CDN files embed their resolution: slug-1080x1920.mp4
  function resArea(url) {
    const m = String(url).match(/(\d{2,5})x(\d{2,5})\.(?:mp4|webm|m4v|jpg|jpeg|png|webp|gif)/i);
    return m ? Number(m[1]) * Number(m[2]) : 0;
  }

  // Order candidates best-first: i.redd.it originals, then by resolution desc.
  function orderByQuality(urls) {
    const unique = [...new Set(urls.filter(u => u && /^https?:\/\//i.test(u)))];
    const originals = unique.filter(u => /^https?:\/\/i\.redd\.it\//i.test(u));
    const rest = unique.filter(u => !originals.includes(u));
    rest.sort((a, b) => resArea(b) - resArea(a));
    return [...originals, ...rest];
  }

  function videoUrls(video) {
    return orderByQuality([
      video.currentSrc,
      video.src,
      ...[...video.querySelectorAll("source[src]")].map(s => s.src)
    ]);
  }

  // Known content-media hosts (reddit CDNs, redgifs, imgur, scrolller mirror)
  const MEDIA_HOST_RE = /redd\.it|redgifs|gifdeliverynetwork|imgur|scrolller|redditmedia/i;
  const MEDIA_EXT_RE = /\.(jpg|jpeg|png|webp|gif|mp4|webm|m4v|mov)(?:[?#]|$)/i;

  function deriveRedditOriginals(urls) {
    const derived = [];
    for (const u of urls) {
      try {
        const p = new URL(u);
        if (/^(preview|external-preview)\.redd\.it$/i.test(p.hostname)) {
          const o = new URL(u);
          o.hostname = "i.redd.it";
          o.search = "";
          derived.push(o.toString());
        }
      } catch { /* ignore */ }
    }
    return derived;
  }

  function imageUrls(img) {
    const urls = [];
    for (const part of (img.srcset || "").split(",")) {
      const [u] = part.trim().split(/\s+/);
      if (u) urls.push(u);
    }
    const pic = img.closest("picture");
    if (pic) {
      for (const s of pic.querySelectorAll("source[srcset]")) {
        for (const part of (s.srcset || "").split(",")) {
          const [u] = part.trim().split(/\s+/);
          if (u) urls.push(u);
        }
      }
    }
    urls.push(img.currentSrc, img.src);
    return orderByQuality([...deriveRedditOriginals(urls), ...urls]);
  }

  // Extract media URLs from a CSS background-image (Scrolller renders many
  // thumbnails this way, so there's no <img>/<video> under the cursor).
  function bgImageUrls(el) {
    if (!(el instanceof HTMLElement)) return [];
    const bg = window.getComputedStyle(el).backgroundImage || "";
    if (!bg || bg === "none") return [];
    const urls = [];
    const re = /url\((['"]?)(https?:\/\/[^'")]+)\1\)/gi;
    let m;
    while ((m = re.exec(bg))) urls.push(m[2]);
    const usable = urls.filter(u => MEDIA_HOST_RE.test(u) || MEDIA_EXT_RE.test(u));
    return orderByQuality([...deriveRedditOriginals(usable), ...usable]);
  }

  function mediaUrlsOf(media) {
    if (media instanceof HTMLVideoElement) return videoUrls(media);
    if (media instanceof HTMLImageElement) return imageUrls(media);
    return bgImageUrls(media);
  }

  function isEligible(media) {
    if (!(media instanceof Element)) return false;
    const r = media.getBoundingClientRect();
    if (r.width < 100 || r.height < 100) return false;

    if (media instanceof HTMLVideoElement) {
      const urls = videoUrls(media);
      if (!urls.length) return false;
      // Scrolller frequently serves videos from RedGifs/GifDeliveryNetwork.
      // content-redgifs.js is not injected on the Scrolller host, so these must
      // stay eligible here and be sent through the normal direct-download path.
      return true;
    }

    if (media instanceof HTMLImageElement) {
      const src = [media.currentSrc, media.src, media.srcset].filter(Boolean).join(" ");
      if (/logo|icon|avatar|profile|badge|sprite/i.test(src)) return false;
      return imageUrls(media).length > 0;
    }

    // Fallback: any element painted with a content background-image
    return bgImageUrls(media).length > 0;
  }

  function containsPoint(el, x, y) {
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  // Scrolller paints transparent link/overlay layers over the actual media.
  // elementsFromPoint therefore often returns only wrappers, not the nested
  // img/video. Search bounded descendants of the hit stack as a fallback.
  function mediaAtPoint(x, y) {
    const stack = document.elementsFromPoint(x, y);
    const direct = stack.find(isEligible);
    if (direct) return direct;

    const candidates = [];
    for (const host of stack.slice(0, 12)) {
      if (!(host instanceof Element)) continue;
      for (const media of host.querySelectorAll("video, img")) {
        if (containsPoint(media, x, y) && isEligible(media)) candidates.push(media);
      }
      if (isEligible(host)) candidates.push(host);
    }

    // Some Scrolller overlays are siblings rather than ancestors of the media,
    // so the hit stack cannot reach the underlying element. Fall back to the
    // bounded set of visible page media whose rectangle contains the pointer.
    if (!candidates.length) {
      for (const media of document.querySelectorAll("video, img")) {
        if (containsPoint(media, x, y) && isEligible(media)) candidates.push(media);
      }
    }

    return candidates.sort((a, b) => {
      const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
      return ar.width * ar.height - br.width * br.height;
    })[0] || null;
  }

  // ── Tile resolution (read-only, no DOM mutation) ──────────────────────────

  function tileRootOf(media) {
    const mr = media.getBoundingClientRect();
    const mediaArea = Math.max(1, mr.width * mr.height);
    let best = media.parentElement || media;
    let node = media.parentElement;
    for (let d = 0; node && d < 8; d += 1, node = node.parentElement) {
      if (node === document.body || node === document.documentElement) break;
      const r = node.getBoundingClientRect();
      if (r.width * r.height > mediaArea * 4 || r.width > window.innerWidth * 0.96) break;
      best = node;
    }
    return best;
  }

  function byVisibleAreaDesc(a, b) {
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    return rb.width * rb.height - ra.width * ra.height;
  }

  // Video is preferred: Scrolller inserts the <video> on hover next to the
  // preview thumbnail, and the video is what the user actually wants.
  function bestMediaInTile(tile, fallback) {
    const vids = [...tile.querySelectorAll("video")].filter(isEligible).sort(byVisibleAreaDesc);
    if (vids[0]) return vids[0];
    const imgs = [...tile.querySelectorAll("img")].filter(isEligible).sort(byVisibleAreaDesc);
    if (imgs[0]) return imgs[0];
    return fallback; // may be a background-image element
  }

  // ── Button anchoring ──────────────────────────────────────────────────────

  function positionButton() {
    const btn = document.getElementById(BUTTON_ID);
    if (!btn) return;

    if (!settings.scrolllerButtons) {
      btn.style.display = "none";
      return;
    }

    const size = clamp(Number(settings.buttonSize) || 44, 28, 72);
    btn.style.width = `${size}px`;
    btn.style.height = `${size}px`;

    // Never hide the only control just because Scrolller's overlay prevented a
    // media match. Keep a fixed fallback button that can resolve media on click.
    if (!anchoredMedia || !anchoredMedia.isConnected) {
      anchoredMedia = null;
      btn.dataset.rgFallback = "1";
      btn.style.left = "auto";
      btn.style.right = "18px";
      btn.style.top = "92px";
      btn.style.display = "grid";
      return;
    }

    const r = anchoredMedia.getBoundingClientRect();
    const visW = Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0));
    const visH = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
    if (visW < 80 || visH < 80) {
      anchoredMedia = null;
      positionButton();
      return;
    }

    delete btn.dataset.rgFallback;
    btn.style.right = "auto";
    // Top-left corner of the media
    btn.style.left = `${clamp(r.left + 10, 8, window.innerWidth - size - 8)}px`;
    btn.style.top = `${clamp(r.top + 10, 8, window.innerHeight - size - 8)}px`;
    btn.style.display = "grid";
  }

  function scheduleHide() {
    if (settings.buttonVisibility === "always") return;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      const btn = document.getElementById(BUTTON_ID);
      if (btn && !btn.matches(":hover")) {
        anchoredMedia = null;
        positionButton();
      }
    }, 350);
  }

  function mostCentralMedia() {
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    // Sample a vertical line of points through the viewport center; this catches
    // background-image tiles (no <img>/<video> node) via elementsFromPoint.
    for (const fy of [0.5, 0.4, 0.6, 0.35, 0.65]) {
      const hit = mediaAtPoint(cx, window.innerHeight * fy);
      if (hit) return hit;
    }
    return null;
  }

  function largestVisibleMedia() {
    return [...document.querySelectorAll("video, img")]
      .filter(isEligible)
      .map((media) => {
        const r = media.getBoundingClientRect();
        const visibleWidth = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
        const visibleHeight = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
        return { media, area: visibleWidth * visibleHeight };
      })
      .filter((item) => item.area > 10000)
      .sort((a, b) => b.area - a.area)[0]?.media || null;
  }

  // ── Download ──────────────────────────────────────────────────────────────

  function sendDownload(urls, folder = "") {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("Timed out.")), 20000);
      chrome.runtime.sendMessage(
        { type: "DIRECT_DOWNLOAD", urls, allowRipsnipFallback: false, folderName: folder || "" },
        (res) => {
          clearTimeout(t);
          if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
          if (!res || res.ok === false) { reject(new Error(res?.error || "Media not found.")); return; }
          resolve(res);
        }
      );
    });
  }

  async function runDownload(event) {
    event.preventDefault();
    event.stopPropagation();
    const btn = event.currentTarget;
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    setStatus("", "idle");

    try {
      if (!anchoredMedia || !anchoredMedia.isConnected) {
        anchoredMedia = mostCentralMedia() || largestVisibleMedia();
      }
      if (!anchoredMedia) throw new Error("No media found.");
      const tile = tileRootOf(anchoredMedia);
      const media = bestMediaInTile(tile, anchoredMedia);
      const urls = mediaUrlsOf(media);
      if (!urls.length) throw new Error("No media found.");
      const folder = window.rgChooseFolder ? await window.rgChooseFolder() : "";
      if (folder === null) return; // cancelled
      await sendDownload(urls, folder);
    } catch (err) {
      setStatus(toErr(err), "error");
    } finally {
      btn.disabled = false;
      positionButton();
    }
  }

  // ── Events ────────────────────────────────────────────────────────────────

  let mmPending = false;
  let lastX = 0, lastY = 0;
  function onMove(event) {
    lastX = event.clientX;
    lastY = event.clientY;
    if (mmPending) return;
    mmPending = true;
    window.requestAnimationFrame(() => {
      mmPending = false;
      if (!settings.scrolllerButtons) return;
      ensureUi();

      const btn = document.getElementById(BUTTON_ID);
      // elementsFromPoint returns the whole stack, so media under the
      // floating button (or under Scrolller's own overlays) is still found.
      const stack = document.elementsFromPoint(lastX, lastY);
      if (btn && stack.includes(btn)) {
        if (hideTimer) clearTimeout(hideTimer);
        return;
      }

      const media = mediaAtPoint(lastX, lastY);
      if (media) {
        if (hideTimer) clearTimeout(hideTimer);
        anchoredMedia = media;
        positionButton();
      } else {
        scheduleHide();
      }
    });
  }
  // Capture phase + both event types: some SPAs stopPropagation on bubbling
  // pointer events, which would otherwise starve a document-level listener.
  document.addEventListener("mousemove", onMove, { passive: true, capture: true });
  document.addEventListener("pointermove", onMove, { passive: true, capture: true });

  window.addEventListener("scroll", () => window.requestAnimationFrame(positionButton), { passive: true, capture: true });
  window.addEventListener("resize", () => window.requestAnimationFrame(positionButton));

  setInterval(() => {
    if (document.hidden || !settings.scrolllerButtons) return;
    ensureUi(); // SPA re-renders may drop our nodes; re-add if missing
    if (settings.buttonVisibility === "always" && (!anchoredMedia || !anchoredMedia.isConnected)) {
      anchoredMedia = mostCentralMedia();
    }
    positionButton();
  }, 700);

  // ── Settings ──────────────────────────────────────────────────────────────

  function loadSettings() {
    chrome.storage.local.get(SETTINGS_KEY, items => {
      settings = { ...DEFAULT_SETTINGS, ...(items?.[SETTINGS_KEY] || {}) };
      installUi();
      if (settings.buttonVisibility === "always") anchoredMedia = mostCentralMedia();
      positionButton();
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[SETTINGS_KEY]) return;
    settings = { ...DEFAULT_SETTINGS, ...(changes[SETTINGS_KEY].newValue || {}) };
    if (settings.scrolllerButtons && (!anchoredMedia || !anchoredMedia.isConnected)) {
      anchoredMedia = mostCentralMedia() || largestVisibleMedia();
    }
    positionButton();
  });

  loadSettings();
})();
