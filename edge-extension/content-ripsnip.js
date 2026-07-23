(() => {
  if (window.__rgRipsnipRunnerLoaded) return;
  window.__rgRipsnipRunnerLoaded = true;
  let isRunning = false;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function sendStatus(text, level = "busy") {
    chrome.runtime.sendMessage({ type: "RIPSNIP_STATUS", text, level });
  }

  function isMediaUrl(url) {
    return /\.(mp4|webm|mov|m4v)(?:[?#].*)?$/i.test(String(url || ""));
  }

  function clickElement(el) {
    const target = el.closest("button,[role='button'],a,input") || el;
    const rect = target.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, pointerType: "mouse", clientX: x, clientY: y }));
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: x, clientY: y }));
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: x, clientY: y }));
    target.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, pointerType: "mouse", clientX: x, clientY: y }));
    target.click();
  }

  function visible(el) {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity || 1) > 0.05
    );
  }

  async function waitUntil(fn, timeoutMs = 15000, intervalMs = 100) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const result = fn();
      if (result) return result;
      await sleep(intervalMs);
    }
    return null;
  }

  function findMediaUrl() {
    const urls = [];
    for (const video of document.querySelectorAll("video")) {
      if (video.currentSrc) urls.push(video.currentSrc);
      if (video.src) urls.push(video.src);
      for (const source of video.querySelectorAll("source")) {
        if (source.src) urls.push(source.src);
      }
    }
    for (const link of document.querySelectorAll("a[href]")) {
      if (isMediaUrl(link.href)) urls.push(link.href);
    }
    return [...new Set(urls)].find(isMediaUrl) || null;
  }

  function findDownloadControl() {
    const mediaLink = [...document.querySelectorAll("a[href]")].find((link) => visible(link) && isMediaUrl(link.href));
    if (mediaLink) return mediaLink;

    const controls = [...document.querySelectorAll("a,button,input[type='button'],input[type='submit']")]
      .filter(visible)
      .map((el) => ({
        el,
        text: `${el.textContent || ""} ${el.value || ""} ${el.getAttribute("aria-label") || ""}`.replace(/\s+/g, " ").trim(),
        href: el.href || ""
      }));

    return (
      controls.find((item) => /^download$/i.test(item.text))?.el ||
      controls.find((item) => /^indir$/i.test(item.text))?.el ||
      controls.find((item) => isMediaUrl(item.href))?.el ||
      null
    );
  }

  async function fillInput(url) {
    const input = await waitUntil(
      () => document.querySelector("input[type='url'], input[name='url'], input[type='text'], textarea"),
      10000,
      50
    );
    if (!input) throw new Error("Ripsnip URL input not found.");
    input.focus();
    input.value = url;
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: url }));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function submitForm() {
    const submit = await waitUntil(
      () =>
        [...document.querySelectorAll("button,input[type='submit']")]
          .filter(visible)
          .find((el) => /^submit$/i.test(`${el.textContent || ""} ${el.value || ""}`.replace(/\s+/g, " ").trim())),
      10000,
      50
    );
    if (!submit) throw new Error("Ripsnip submit button not found.");
    clickElement(submit);
  }

  async function run(url) {
    if (isRunning) return;
    isRunning = true;

    try {
      if (location.origin !== "https://ripsnip.com" || (location.pathname !== "/" && location.pathname !== "")) {
        sessionStorage.setItem("rg-ripsnip-pending-url", url);
        location.assign("https://ripsnip.com/");
        return;
      }

      sendStatus("Ripsnip: filling link...");
      await fillInput(url);
      await submitForm();
      sendStatus("Ripsnip: waiting for result...");

      const started = Date.now();
      let clickedDownload = false;

      while (Date.now() - started < 120000) {
        const mediaUrl = findMediaUrl();
        if (mediaUrl) {
          chrome.runtime.sendMessage({ type: "RIPSNIP_DOWNLOAD_URL", url: mediaUrl });
          isRunning = false;
          return;
        }

        const control = findDownloadControl();
        if (control && !clickedDownload) {
          const href = control.href || "";
          if (isMediaUrl(href)) {
            chrome.runtime.sendMessage({ type: "RIPSNIP_DOWNLOAD_URL", url: href });
            isRunning = false;
            return;
          }

          clickedDownload = true;
          chrome.runtime.sendMessage({ type: "RIPSNIP_WATCH_MEDIA" });
          clickElement(control);
          sendStatus("Ripsnip: download clicked...");
          isRunning = false;
          return;
        }

        await sleep(Date.now() - started < 20000 ? 250 : 500);
      }

      throw new Error("Ripsnip result timed out.");
    } catch (error) {
      sendStatus(error.message || "Ripsnip failed.", "error");
      isRunning = false;
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "RUN_RIPSNIP" && message.url) {
      run(message.url);
    }
  });

  const pendingUrl = sessionStorage.getItem("rg-ripsnip-pending-url");
  if (pendingUrl && location.origin === "https://ripsnip.com" && (location.pathname === "/" || location.pathname === "")) {
    sessionStorage.removeItem("rg-ripsnip-pending-url");
    run(pendingUrl);
  }
})();
