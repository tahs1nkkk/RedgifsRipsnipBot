(function initRgSettings(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RG_SETTINGS = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";

  const SETTINGS_KEY = "rgRipsnipSettings";
  const DEFAULT_SETTINGS = Object.freeze({
    feedButtons: true,
    profileButtons: true,
    iframeButton: true,
    directDownloads: true,
    ripsnipFallback: false,
    buttonVisibility: "hover",
    redgifsAvatarDownload: true,
    ripsnipWhenOpen: false,
    hideRedgifsProfileAvatars: true,
    hideRedditProfileAvatars: true,
    redditImages: true,
    scrolllerButtons: true,
    scrolllerHiddenSelectors: [],
    coomerButtons: true,
    instagramButtons: true,
    downloadPath: "RedGifsDownloader",
    folderLayout: "organized",
    includeDateInFilename: false,
    buttonSize: 44,
    rightShiftDownload: false,
    mediaFolders: []
  });

  function withDefaults(value) {
    return { ...DEFAULT_SETTINGS, ...(value || {}) };
  }

  function cleanPathPart(value, fallback = "") {
    return String(value || fallback)
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/^[.\s-]+|[.\s-]+$/g, "")
      .replace(/\s+/g, " ")
      .slice(0, 80);
  }

  // Touch screens never fire :hover, so UI that fades in on hover would stay
  // invisible there. Handlers use this to keep those controls shown instead.
  function isTouchDevice() {
    return typeof matchMedia === "function" && matchMedia("(hover: none)").matches;
  }

  function siteFromUrl(value) {
    try {
      const host = new URL(value).hostname.toLowerCase();
      if (host === "redgifs.com" || host.endsWith(".redgifs.com")) return "RedGifs";
      if (host === "reddit.com" || host.endsWith(".reddit.com")) return "Reddit";
      if (host === "instagram.com" || host.endsWith(".instagram.com")) return "Instagram";
      if (host === "scrolller.com" || host.endsWith(".scrolller.com")) return "Scrolller";
      if (host === "coomer.st" || host.endsWith(".coomer.st")) return "Coomer";
    } catch {
      // Unknown or incomplete URL.
    }
    return "Other";
  }

  function mediaCategoryFromUrl(value) {
    try {
      const pathname = new URL(value).pathname;
      if (/\.(?:jpg|jpeg|png|webp|gif)$/i.test(pathname)) return "Fotoğraflar";
    } catch {
      if (/\.(?:jpg|jpeg|png|webp|gif)(?:[?#]|$)/i.test(String(value || ""))) return "Fotoğraflar";
    }
    return "Videolar";
  }

  function downloadDirectory(settingsValue, options = {}) {
    const settings = withDefaults(settingsValue);
    const base = cleanPathPart(options.downloadPath || settings.downloadPath, "RedGifsDownloader") || "RedGifsDownloader";
    const folder = cleanPathPart(options.folderName);
    const subFolder = cleanPathPart(options.subFolder);
    if (options.folderName && !folder) throw new Error("Invalid folder name.");

    if (settings.folderLayout === "legacy") {
      if (folder) return folder;
      return subFolder ? `${base}/${subFolder}` : base;
    }

    const site = cleanPathPart(options.site, "Other") || "Other";
    if (site === "RedGifs" && subFolder) {
      return [base, site, "Niches", subFolder].join("/");
    }

    const mediaCategory = options.mediaCategory === "Fotoğraflar" ? "Fotoğraflar" : "Videolar";
    if (site === "Coomer" && folder) {
      return [base, site, folder, mediaCategory].join("/");
    }
    return [base, site, mediaCategory, folder].filter(Boolean).join("/");
  }

  return Object.freeze({
    SETTINGS_KEY,
    DEFAULT_SETTINGS,
    withDefaults,
    cleanPathPart,
    isTouchDevice,
    siteFromUrl,
    mediaCategoryFromUrl,
    downloadDirectory
  });
});
