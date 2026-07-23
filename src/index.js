const fs = require("node:fs/promises");
const fss = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const DOWNLOAD_DIR = path.join(ROOT, "downloads");
const RIPSNIP_PROFILE_DIR = path.join(ROOT, "ripsnip-profile");
const RIPSNIP_URL = "https://ripsnip.com/";
const DEFAULT_EDGE_CDP = "http://127.0.0.1:9222";
const MEDIA_EXT_RE = /\.(mp4|webm|mov|m4v)(?:[?#].*)?$/i;
const STREAM_RE = /\.(m3u8|mpd)(?:[?#].*)?$/i;

function log(message) {
  console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const cdpIndex = args.indexOf("--edge-cdp");
  return {
    url: args.find((arg) => /^https?:\/\//i.test(arg)),
    fromEdge: args.includes("--from-edge"),
    showRipsnip: args.includes("--show-ripsnip"),
    keepOpen: args.includes("--keep-open"),
    edgeCdp: cdpIndex >= 0 && args[cdpIndex + 1] ? args[cdpIndex + 1] : DEFAULT_EDGE_CDP,
  };
}

function getClipboardUrl() {
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-Command", "Get-Clipboard"],
    { encoding: "utf8" }
  );
  if (result.status !== 0) return null;
  const match = result.stdout.match(/https?:\/\/\S+/i);
  return match ? match[0].trim().replace(/[)\]}.,;]+$/, "") : null;
}

function normalizeInputUrl(rawUrl) {
  if (!rawUrl) {
    throw new Error("Link bulunamadi. Linki arguman olarak ver veya clipboard'a kopyala.");
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Gecersiz URL: ${rawUrl}`);
  }

  if (!/redgifs\.com$/i.test(parsed.hostname) && !parsed.hostname.endsWith(".redgifs.com")) {
    throw new Error("Bu yardimci yalnizca Redgifs linkleri icin tasarlandi.");
  }

  return parsed.toString();
}

function sanitizeName(value) {
  return value
    .replace(/^https?:\/\//i, "")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function fileNameFromUrl(mediaUrl, sourceUrl) {
  const mediaPath = new URL(mediaUrl).pathname;
  const extMatch = mediaPath.match(/\.(mp4|webm|mov|m4v)$/i);
  const ext = extMatch ? extMatch[0].toLowerCase() : ".mp4";
  const source = new URL(sourceUrl);
  const sourceName = sanitizeName(source.pathname.split("/").filter(Boolean).pop() || source.hostname);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${sourceName || "video"}-${stamp}${ext}`;
}

async function visibleLocator(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      if ((await locator.count()) > 0 && (await locator.isVisible({ timeout: 1000 }))) {
        return locator;
      }
    } catch {
      // Try the next selector.
    }
  }
  return null;
}

async function clickFirst(page, label, locators) {
  for (const locator of locators) {
    try {
      const count = await locator.count();
      for (let i = 0; i < Math.min(count, 6); i += 1) {
        const item = locator.nth(i);
        if (await item.isVisible({ timeout: 700 })) {
          await item.click({ timeout: 8000 });
          log(`${label} tiklandi.`);
          return true;
        }
      }
    } catch {
      // Try the next locator.
    }
  }
  return false;
}

function isMediaUrl(url) {
  return MEDIA_EXT_RE.test(url) || STREAM_RE.test(url);
}

async function findRedgifsPage(browser) {
  const pages = browser
    .contexts()
    .flatMap((context) => context.pages())
    .reverse();

  for (const page of pages) {
    try {
      const hostname = new URL(page.url()).hostname;
      if (hostname === "redgifs.com" || hostname.endsWith(".redgifs.com")) {
        return page;
      }
    } catch {
      // Ignore non-standard URLs.
    }
  }

  return null;
}

async function waitForClipboardRedgifsUrl(previousValue, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = getClipboardUrl();
    if (value && value !== previousValue) {
      try {
        return normalizeInputUrl(value);
      } catch {
        // Clipboard changed, but it is not the Redgifs share URL yet.
      }
    }
    await sleep(500);
  }
  return null;
}

async function clickVideoMoreMenu(page) {
  await page.bringToFront().catch(() => {});
  await page.mouse.move(20, 20).catch(() => {});
  await sleep(200);

  const candidate = await page.evaluate(() => {
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };

    const visibleVideos = [...document.querySelectorAll("video")]
      .map((video) => {
        const rect = video.getBoundingClientRect();
        const width = Math.max(0, Math.min(rect.right, viewport.width) - Math.max(rect.left, 0));
        const height = Math.max(0, Math.min(rect.bottom, viewport.height) - Math.max(rect.top, 0));
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width,
          height,
          area: width * height,
        };
      })
      .filter((rect) => rect.area > 50000)
      .sort((a, b) => b.area - a.area);

    const videoRect = visibleVideos[0] || {
      left: 0,
      right: viewport.width,
      top: 0,
      bottom: viewport.height,
      width: viewport.width,
      height: viewport.height,
    };

    const clickableSelector = [
      "button",
      "[role='button']",
      "[tabindex]",
      "a",
      "[aria-label]",
      "[data-testid]",
    ].join(",");

    const candidates = [...document.querySelectorAll(clickableSelector)]
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const label = [
          el.getAttribute("aria-label"),
          el.getAttribute("title"),
          el.getAttribute("data-testid"),
          el.textContent,
        ]
          .filter(Boolean)
          .join(" ")
          .trim();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          width: rect.width,
          height: rect.height,
          label,
          visible:
            rect.width >= 8 &&
            rect.height >= 8 &&
            rect.width <= 100 &&
            rect.height <= 100 &&
            rect.right > 0 &&
            rect.bottom > 0 &&
            rect.left < viewport.width &&
            rect.top < viewport.height &&
            style.visibility !== "hidden" &&
            style.display !== "none" &&
            Number(style.opacity || 1) > 0.05,
        };
      })
      .filter((item) => item.visible)
      .filter((item) => {
        const inVideoRightBand =
          item.x >= videoRect.left + videoRect.width * 0.72 &&
          item.x <= videoRect.right + 40 &&
          item.y >= videoRect.top + videoRect.height * 0.45 &&
          item.y <= videoRect.bottom + 20;
        const notTopNav = item.y > viewport.height * 0.35;
        return inVideoRightBand && notTopNav;
      });

    const explicit = candidates
      .filter((item) => /more|options|overflow|menu|ellipsis|share|\.\.\./i.test(item.label))
      .sort((a, b) => b.y - a.y)[0];
    if (explicit) return explicit;

    const lowerRight = candidates.sort((a, b) => b.y - a.y || b.x - a.x)[0];
    if (lowerRight) return lowerRight;

    return {
      x: Math.min(viewport.width - 20, Math.max(20, videoRect.right - 32)),
      y: Math.min(viewport.height - 20, Math.max(20, videoRect.bottom - 88)),
      width: 0,
      height: 0,
      label: "video-right-bottom-fallback",
    };
  });

  await page.mouse.click(candidate.x, candidate.y);
  log(
    `Video uc nokta hedefi tiklandi: x=${Math.round(candidate.x)} y=${Math.round(
      candidate.y
    )} ${candidate.label ? `(${candidate.label.slice(0, 60)})` : ""}`
  );
}

async function copyCurrentRedgifsShareLink(page) {
  await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(200);

  const previousClipboard = getClipboardUrl();

  await clickVideoMoreMenu(page);
  await sleep(600);

  const clickedShare = await clickFirst(page, "Share", [
    page.getByRole("menuitem", { name: /^share$/i }),
    page.getByRole("button", { name: /^share$/i }),
    page.getByText(/^share$/i),
  ]);
  if (!clickedShare) {
    throw new Error("Redgifs Share secenegi bulunamadi. Video ustundeki uc nokta menusu acik olmayabilir.");
  }

  await sleep(1200);

  const clickedCopy = await clickFirst(page, "Copy Link", [
    page.getByRole("button", { name: /copy link/i }),
    page.getByText(/copy link/i),
  ]);
  if (!clickedCopy) {
    throw new Error("Redgifs Copy Link secenegi bulunamadi.");
  }

  const copiedUrl = await waitForClipboardRedgifsUrl(previousClipboard);
  if (!copiedUrl) {
    throw new Error("Copy Link tiklandi ama clipboard'da Redgifs linki yakalanamadi.");
  }

  return copiedUrl;
}

async function findVideoSource(page) {
  const sources = await page.evaluate(() => {
    const urls = [];
    for (const video of document.querySelectorAll("video")) {
      if (video.currentSrc) urls.push(video.currentSrc);
      if (video.src) urls.push(video.src);
      for (const source of video.querySelectorAll("source")) {
        if (source.src) urls.push(source.src);
      }
    }
    for (const link of document.querySelectorAll("a[href]")) {
      const href = link.href;
      if (/\.(mp4|webm|mov|m4v)([?#].*)?$/i.test(href)) urls.push(href);
    }
    return [...new Set(urls)];
  });

  return sources.find((url) => isMediaUrl(url) && !url.startsWith("blob:")) || null;
}

async function waitForMediaUrl(page, mediaCandidates, timeoutMs = 90000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const direct = mediaCandidates.find((url) => MEDIA_EXT_RE.test(url));
    if (direct) return direct;

    if (isMediaUrl(page.url())) return page.url();

    const source = await findVideoSource(page).catch(() => null);
    if (source) return source;

    await sleep(1000);
  }
  return null;
}

async function downloadMedia(requestContext, mediaUrl, sourceUrl, refererUrl) {
  if (STREAM_RE.test(mediaUrl)) {
    throw new Error(`Streaming playlist yakalandi ama bu surum mp4/webm indirir: ${mediaUrl}`);
  }

  await fs.mkdir(DOWNLOAD_DIR, { recursive: true });
  const targetPath = path.join(DOWNLOAD_DIR, fileNameFromUrl(mediaUrl, sourceUrl));

  log("Medya indiriliyor...");
  const response = await requestContext.get(mediaUrl, {
    timeout: 0,
    headers: {
      referer: refererUrl,
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari/537.36",
    },
  });

  if (!response.ok()) {
    throw new Error(`Medya indirilemedi: HTTP ${response.status()}`);
  }

  const body = await response.body();
  await fs.writeFile(targetPath, body);
  return targetPath;
}

async function downloadViaRipsnip(sourceUrl, args) {
  await fs.mkdir(RIPSNIP_PROFILE_DIR, { recursive: true });
  const context = await chromium.launchPersistentContext(RIPSNIP_PROFILE_DIR, {
    channel: "msedge",
    headless: !args.showRipsnip,
    acceptDownloads: true,
    viewport: { width: 1280, height: 860 },
    locale: "tr-TR",
  });

  const mediaCandidates = [];
  context.on("response", async (response) => {
    const url = response.url();
    const headers = response.headers();
    const contentType = headers["content-type"] || "";
    if (isMediaUrl(url) || /^video\//i.test(contentType)) {
      if (!mediaCandidates.includes(url)) {
        mediaCandidates.push(url);
        log(`Medya adayi yakalandi: ${url}`);
      }
    }
  });

  try {
    const page = await context.newPage();
    log(args.showRipsnip ? "Ripsnip Edge'de aciliyor..." : "Ripsnip arka planda aciliyor...");
    await page.goto(RIPSNIP_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});

    const input = await visibleLocator(page, [
      "input[type='url']",
      "input[type='text']",
      "textarea",
      "[contenteditable='true']",
      "input:not([type])",
    ]);
    if (!input) throw new Error("Link yapistirma alani bulunamadi.");

    await input.fill(sourceUrl);
    log("Link yapistirildi.");

    const submitted = await clickFirst(page, "Submit/Download butonu", [
      page.getByRole("button", { name: /submit|download|get|start|convert|indir/i }),
      page.locator("button[type='submit']"),
      page.locator("input[type='submit']"),
      page.locator("button"),
    ]);
    if (!submitted) throw new Error("Submit butonu bulunamadi.");

    log("Sonuc bekleniyor. Site bazen gec cevap verebilir...");
    await page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => {});

    let mediaPage = page;
    let mediaUrl = await waitForMediaUrl(page, mediaCandidates, 5000);

    if (!mediaUrl) {
      const popupPromise = context.waitForEvent("page", { timeout: 80000 }).catch(() => null);
      const downloadPromise = page.waitForEvent("download", { timeout: 80000 }).catch(() => null);

      const clicked = await clickFirst(page, "Download butonu", [
        page.getByRole("link", { name: /download|indir/i }),
        page.getByRole("button", { name: /download|indir/i }),
        page.locator("a[href*='download' i]"),
        page.locator("a[href$='.mp4' i]"),
      ]);

      if (!clicked) throw new Error("Download butonu bulunamadi.");

      const download = await downloadPromise;
      if (download) {
        await fs.mkdir(DOWNLOAD_DIR, { recursive: true });
        const suggested = sanitizeName(download.suggestedFilename() || "video.mp4");
        const targetPath = path.join(DOWNLOAD_DIR, suggested || fileNameFromUrl(sourceUrl, sourceUrl));
        await download.saveAs(targetPath);
        log(`Indirildi: ${targetPath}`);
        return;
      }

      const popup = await popupPromise;
      if (popup) {
        mediaPage = popup;
        await popup.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
        await popup.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
      }

      mediaUrl = await waitForMediaUrl(mediaPage, mediaCandidates, 90000);
    }

    if (!mediaUrl) {
      throw new Error("Medya URL'si yakalanamadi. Sayfa yapisi degismis veya elle islem gerekiyor olabilir.");
    }

    const targetPath = await downloadMedia(context.request, mediaUrl, sourceUrl, mediaPage.url());
    log(`Indirildi: ${targetPath}`);
  } finally {
    if (args.keepOpen) {
      log("Tarayici acik birakildi. Kapatmak icin bu pencereyi kapat.");
      while (fss.existsSync(RIPSNIP_PROFILE_DIR)) await sleep(1000);
    } else {
      await context.close();
    }
  }
}

async function getSourceUrlFromControlledEdge(args) {
  log(`Edge kontrol portuna baglaniliyor: ${args.edgeCdp}`);
  let browser;
  try {
    browser = await chromium.connectOverCDP(args.edgeCdp);
  } catch {
    throw new Error(
      "Kontrollu Edge'e baglanilamadi. Once masaustundeki 'Start Controlled Edge for Redgifs.bat' dosyasini calistir."
    );
  }
  try {
    const page = await findRedgifsPage(browser);
    if (!page) {
      throw new Error("Kontrollu Edge icinde acik Redgifs sekmesi bulunamadi.");
    }

    log(`Redgifs sekmesi bulundu: ${page.url()}`);
    return await copyCurrentRedgifsShareLink(page);
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = parseArgs();
  const sourceUrl = args.fromEdge
    ? await getSourceUrlFromControlledEdge(args)
    : normalizeInputUrl(args.url || getClipboardUrl());

  log(`Kaynak link: ${sourceUrl}`);
  await downloadViaRipsnip(sourceUrl, args);
}

main().catch((error) => {
  console.error(`\nHata: ${error.message}`);
  process.exitCode = 1;
});
