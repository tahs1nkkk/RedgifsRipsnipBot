/*
 * Native bridge for the TasuDownloader iOS app's in-app browser.
 *
 * Plays the role ios-bridge.js plays in the Orion build, but instead of
 * answering messages in JS it forwards them to the app over
 * webkit.messageHandlers.rgNative (the WithReply variant, so postMessage
 * returns a promise). The native side downloads with URLSession and saves
 * straight into Photos — no share sheet, no second tap.
 *
 * The site handlers are the same files the Edge extension ships; they cannot
 * tell the difference. Keep this file the only place that knows it is inside
 * an app.
 */
(() => {
  "use strict";

  if (globalThis.__rgNativeBridgeLoaded) return;
  globalThis.__rgNativeBridgeLoaded = true;

  const VERSION = "__RG_VERSION__";

  function post(payload) {
    let target = null;
    try {
      target = window.webkit.messageHandlers.rgNative;
    } catch {
      target = null;
    }
    if (!target) return Promise.reject(new Error("NO_NATIVE_BRIDGE"));
    try {
      return Promise.resolve(target.postMessage(payload));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  /* ---------------------------------------------------------------- chrome.* */

  const runtime = {
    lastError: undefined,
    getURL: (path) => String(path || ""),
    getManifest: () => ({ version: VERSION }),
    onMessage: { addListener() {}, removeListener() {} },
    sendMessage(message, callback) {
      const pending = post({ kind: "message", message: message || {} });
      if (typeof callback !== "function") return pending;
      pending
        .then((result) => {
          runtime.lastError = undefined;
          callback(result);
        })
        .catch((error) => {
          // Handlers read chrome.runtime.lastError inside the callback, so it
          // has to be set before and cleared after, extension-style.
          runtime.lastError = { message: String((error && error.message) || error) };
          try {
            callback(undefined);
          } finally {
            runtime.lastError = undefined;
          }
        });
    }
  };

  const changeListeners = new Set();

  const local = {
    get(keys, callback) {
      const pending = post({ kind: "storageGet", keys: keys === undefined ? null : keys }).then((r) => r || {});
      if (typeof callback !== "function") return pending;
      pending.then((r) => callback(r)).catch(() => callback({}));
    },
    set(items, callback) {
      const pending = post({ kind: "storageSet", items: items || {} }).then(() => {});
      if (typeof callback !== "function") return pending;
      pending.then(() => callback()).catch(() => callback());
    },
    remove(keys, callback) {
      const pending = post({ kind: "storageRemove", keys: keys === undefined ? null : keys }).then(() => {});
      if (typeof callback !== "function") return pending;
      pending.then(() => callback()).catch(() => callback());
    }
  };

  // The native settings screen calls this after every change so handlers that
  // subscribed to chrome.storage.onChanged restyle themselves live.
  window.__rgNativeSettingsChanged = (newValue) => {
    const changes = { rgRipsnipSettings: { newValue: newValue || {} } };
    for (const listener of [...changeListeners]) {
      try {
        listener(changes, "local");
      } catch {
        // One broken listener must not stop the rest.
      }
    }
  };

  const api = {
    runtime,
    storage: {
      local,
      onChanged: {
        addListener: (fn) => changeListeners.add(fn),
        removeListener: (fn) => changeListeners.delete(fn)
      }
    }
  };
  globalThis.chrome = api;
  globalThis.browser = api;

  /* -------------------------------------------------------------- mobile css */

  // Same overrides the Orion build loads from its manifest, embedded by the
  // generator. Injected at documentStart so buttons never flash hidden.
  const MOBILE_CSS = __RG_CSS__;

  function injectCss() {
    if (document.getElementById("rg-ios-app-css")) return;
    const style = document.createElement("style");
    style.id = "rg-ios-app-css";
    style.textContent = MOBILE_CSS;
    (document.head || document.documentElement).appendChild(style);
  }
  injectCss();
  document.addEventListener("DOMContentLoaded", injectCss);

  /* --------------------------------------------------------------- shadow ui */

  // Scrolller builds its controls inside shadow roots the stylesheet cannot
  // cross, so the touch overrides are pushed in from here (ported unchanged
  // from the Orion bridge).
  const SHADOW_HOSTS = ["rg-scrolller-v2-host", "rg-scrolller-card-buttons"];
  const SHADOW_STYLE_ID = "rg-ios-shadow-css";
  const SHADOW_CSS = `
    button {
      min-width: 44px !important;
      min-height: 44px !important;
      touch-action: manipulation !important;
      -webkit-tap-highlight-color: transparent !important;
    }
  `;

  function styleShadowUi() {
    const patch = () => {
      for (const id of SHADOW_HOSTS) {
        const root = document.getElementById(id)?.shadowRoot;
        if (!root || root.getElementById(SHADOW_STYLE_ID)) continue;
        const style = document.createElement("style");
        style.id = SHADOW_STYLE_ID;
        style.textContent = SHADOW_CSS;
        root.appendChild(style);
      }
    };
    patch();
    try {
      new MutationObserver(patch).observe(document.documentElement, { childList: true });
    } catch {
      // No observer: the buttons still work, just at desktop size.
    }
  }
  styleShadowUi();

  /* -------------------------------------------------------------- fab helper */

  // The handlers still build their buttons — the app just never shows them (see
  // the opacity rule in the generated CSS). They stay useful as *resolvers*: a
  // handler button knows the real source URL behind a thumbnail, which a raw
  // <video>/<img> src often is not. So the flow is media-first: find the media
  // the user is looking at, then hand off to the handler button covering it,
  // and only download the element's own src when no handler claims it.
  const BUTTON_SELECTOR = __RG_BUTTONS__;

  function onScreen(rect) {
    return rect.width >= 56 && rect.height >= 56
      && rect.bottom > 0 && rect.top < innerHeight
      && rect.right > 0 && rect.left < innerWidth;
  }

  function clickTarget(el) {
    // Scrolller's controls live in a shadow root; the element matched by the
    // selector is the host, and clicking a host does nothing.
    const inner = el.shadowRoot?.querySelector("button");
    (inner || el).click();
  }

  function handlerButtons() {
    return [...document.querySelectorAll(BUTTON_SELECTOR)]
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .filter((b) => b.rect.width > 0 && b.rect.height > 0);
  }

  // A handler pins its button to a corner of the media it belongs to, so the
  // button's centre lands inside that media's box (allow a little slack for
  // buttons nudged just outside it).
  function buttonFor(rect, buttons) {
    let best = null;
    let bestDistance = Infinity;
    const mx = rect.left + rect.width / 2;
    const my = rect.top + rect.height / 2;
    for (const button of buttons) {
      const bx = button.rect.left + button.rect.width / 2;
      const by = button.rect.top + button.rect.height / 2;
      const inside = bx >= rect.left - 12 && bx <= rect.right + 12
        && by >= rect.top - 12 && by <= rect.bottom + 12;
      if (!inside) continue;
      const distance = Math.hypot(bx - mx, by - my);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = button.el;
      }
    }
    return best;
  }

  function candidates() {
    const buttons = handlerButtons();
    const found = [];

    for (const el of document.querySelectorAll("video")) {
      const rect = el.getBoundingClientRect();
      if (!onScreen(rect)) continue;
      const src = el.currentSrc || el.src
        || [...el.querySelectorAll("source")].map((s) => s.src).find(Boolean) || "";
      found.push({ rect, src, image: false, button: buttonFor(rect, buttons) });
    }

    for (const el of document.querySelectorAll("img")) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 120 || !onScreen(rect)) continue;
      // A poster frame or a play-button overlay sits on top of a video that is
      // already a candidate; one entry per spot keeps the picker honest.
      if (found.some((m) => Math.abs(m.rect.left - rect.left) < 24 && Math.abs(m.rect.top - rect.top) < 24)) continue;
      found.push({
        rect,
        src: el.currentSrc || el.src || "",
        image: true,
        button: buttonFor(rect, buttons)
      });
    }

    // Media the handlers do not recognise and that has no usable src of its own
    // is noise in the picker and a dead tap in centre mode.
    return found.filter((m) => m.button || /^https?:/i.test(m.src));
  }

  function grab(media) {
    if (media.button) {
      clickTarget(media.button);
      return "clicked";
    }
    runtime.sendMessage({
      type: "DIRECT_DOWNLOAD",
      urls: [media.src],
      imageMode: media.image,
      fallbackSourceUrl: location.href
    });
    return media.image ? "image" : "video";
  }

  // Feeds scroll vertically, so "the one I am looking at" is the one nearest the
  // middle of the screen height; horizontal distance only breaks ties in grids.
  function centreMost(list) {
    const cx = innerWidth / 2;
    const cy = innerHeight / 2;
    let best = null;
    let bestScore = Infinity;
    for (const media of list) {
      const mx = media.rect.left + media.rect.width / 2;
      const my = media.rect.top + media.rect.height / 2;
      const score = Math.abs(my - cy) + Math.abs(mx - cx) * 0.25;
      if (score < bestScore) {
        bestScore = score;
        best = media;
      }
    }
    return best;
  }

  /* ------------------------------------------------------------ pick overlay */

  const PICKER_ID = "rg-native-picker";
  let pickerTimer = 0;

  function dismissPicker() {
    clearTimeout(pickerTimer);
    document.getElementById(PICKER_ID)?.remove();
  }

  function showPicker(list) {
    dismissPicker();
    const layer = document.createElement("div");
    layer.id = PICKER_ID;
    layer.style.cssText = [
      "position:fixed", "inset:0", "z-index:2147483600",
      "background:rgba(0,0,0,.28)", "-webkit-backdrop-filter:blur(2px)", "backdrop-filter:blur(2px)"
    ].join(";");
    layer.addEventListener("click", dismissPicker);

    list.forEach((media, index) => {
      const spot = document.createElement("button");
      spot.textContent = String(index + 1);
      const size = 54;
      const left = Math.min(innerWidth - size - 8, Math.max(8, media.rect.left + media.rect.width / 2 - size / 2));
      const top = Math.min(innerHeight - size - 8, Math.max(8, media.rect.top + media.rect.height / 2 - size / 2));
      spot.style.cssText = [
        "position:fixed", `left:${left}px`, `top:${top}px`,
        `width:${size}px`, `height:${size}px`, "border-radius:50%",
        "border:1.5px solid rgba(255,255,255,.55)",
        "background:rgba(255,255,255,.22)",
        "-webkit-backdrop-filter:blur(18px) saturate(180%)",
        "backdrop-filter:blur(18px) saturate(180%)",
        "color:#fff", "font:600 19px/1 -apple-system,system-ui,sans-serif",
        "box-shadow:0 6px 20px rgba(0,0,0,.35)", "cursor:pointer",
        "display:flex", "align-items:center", "justify-content:center",
        "-webkit-tap-highlight-color:transparent", "touch-action:manipulation"
      ].join(";");
      spot.addEventListener("click", (event) => {
        event.stopPropagation();
        dismissPicker();
        // The overlay has to be gone before the click lands, or it swallows the
        // synthetic click meant for the handler button underneath.
        setTimeout(() => grab(media), 0);
      });
      layer.appendChild(spot);
    });

    document.body.appendChild(layer);
    pickerTimer = setTimeout(dismissPicker, 5000);
  }

  /* ------------------------------------------------------------ entry point */

  // mode "centre": short tap — take the media in the middle of the screen.
  // mode "pick":   long press — mark every candidate and let the user choose.
  window.__rgFabDownload = (mode) => {
    dismissPicker();
    const list = candidates();

    if (mode === "pick") {
      if (!list.length) return "none";
      if (list.length === 1) return grab(list[0]);
      showPicker(list);
      return "picker";
    }

    const media = centreMost(list);
    if (media) return grab(media);

    // Pages with a single page-level button (Instagram's "download all",
    // Coomer post pages) expose no measurable media of their own.
    const fallback = handlerButtons()[0];
    if (fallback) {
      clickTarget(fallback.el);
      return "clicked";
    }
    return "none";
  };
})();
