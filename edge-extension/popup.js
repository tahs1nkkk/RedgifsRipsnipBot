const { SETTINGS_KEY, DEFAULT_SETTINGS } = globalThis.RG_SETTINGS;

const controls = [...document.querySelectorAll("[data-setting]")];
const buttonSizeValue = document.getElementById("buttonSizeValue");
const ripsnipRow = document.getElementById("ripsnipRow");
const ripsnipHint = document.getElementById("ripsnipHint");
const folderStatus = document.getElementById("folderStatus");

function readSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(SETTINGS_KEY, (items) => {
      resolve({ ...DEFAULT_SETTINGS, ...(items && items[SETTINGS_KEY] || {}) });
    });
  });
}

function writeSettings(settings) {
  settings.feedButtons = true;
  settings.profileButtons = true;
  return chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

function ripsnipTabOpen() {
  return new Promise((resolve) => {
    chrome.tabs.query({ url: ["https://ripsnip.com/*", "https://www.ripsnip.com/*"] }, (tabs) => {
      resolve(Boolean((tabs || []).length));
    });
  });
}

function activeTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve((tabs || [])[0] || null));
  });
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}

async function downloadCurrentScrolllerMedia() {
  const button = document.getElementById("downloadScrolllerCurrent");
  const status = document.getElementById("scrolllerActionStatus");
  const tab = await activeTab();
  if (!tab || !/^https:\/\/(?:[^/]+\.)?scrolller\.com\//i.test(tab.url || "")) {
    status.textContent = "Önce bir Scrolller sekmesini aktif et";
    status.dataset.level = "error";
    return;
  }

  button.disabled = true;
  status.textContent = "Medya aranıyor…";
  status.dataset.level = "idle";
  try {
    let response;
    try {
      response = await sendTabMessage(tab.id, { type: "RG_SCROLLLER_DOWNLOAD_CURRENT" });
    } catch {
      // Existing tabs may not have the newest content script. Inject the v2
      // stack on demand instead of requiring another page reload.
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["common/settings.js", "content-folders.js", "content-scrolller-v2.js"]
      });
      response = await sendTabMessage(tab.id, { type: "RG_SCROLLLER_DOWNLOAD_CURRENT" });
    }
    if (!response?.ok) throw new Error(response?.error || "İndirme başlatılamadı");
    status.textContent = "İndirme başlatıldı ✓";
    status.dataset.level = "done";
  } catch (error) {
    status.textContent = String(error?.message || error);
    status.dataset.level = "error";
  } finally {
    button.disabled = false;
  }
}

async function sendScrolllerToolCommand(message) {
  const status = document.getElementById("scrolllerActionStatus");
  const tab = await activeTab();
  if (!tab || !/^https:\/\/(?:[^/]+\.)?scrolller\.com\//i.test(tab.url || "")) {
    status.textContent = "Önce bir Scrolller sekmesini aktif et";
    status.dataset.level = "error";
    return null;
  }
  try {
    try {
      return await sendTabMessage(tab.id, message);
    } catch {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["common/settings.js", "content-folders.js", "content-scrolller-v2.js"]
      });
      return await sendTabMessage(tab.id, message);
    }
  } catch (error) {
    status.textContent = String(error?.message || error);
    status.dataset.level = "error";
    return null;
  }
}

async function startScrolllerElementPicker() {
  const response = await sendScrolllerToolCommand({ type: "RG_SCROLLLER_PICK_HIDE" });
  if (response?.ok) window.close();
}

async function resetScrolllerHiddenElements() {
  const status = document.getElementById("scrolllerActionStatus");
  const response = await sendScrolllerToolCommand({ type: "RG_SCROLLLER_RESET_HIDDEN" });
  if (!response?.ok) return;
  status.textContent = "Gizlenen öğeler geri getirildi ✓";
  status.dataset.level = "done";
}

function sanitizePath(value) {
  return String(value || "RedGifsDownloader")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "RedGifsDownloader";
}

function renderControl(control, settings) {
  const key = control.dataset.setting;
  const value = settings[key];
  if (control.type === "checkbox") {
    control.checked = Boolean(value);
  } else if (control.type === "range") {
    control.value = Number(value) || DEFAULT_SETTINGS[key];
  } else {
    control.value = value ?? DEFAULT_SETTINGS[key] ?? "";
  }
}

function sanitizeFolder(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/^[.\s-]+|[.\s-]+$/g, "")
    .slice(0, 40);
}

async function saveFolders(folders) {
  const current = await readSettings();
  current.mediaFolders = folders;
  await writeSettings(current);
}

function setFolderStatus(text, level = "idle") {
  if (!folderStatus) return;
  folderStatus.textContent = text || "";
  folderStatus.dataset.level = level;
}

function renderFolders(settings) {
  const list = document.getElementById("folderList");
  if (!list) return;
  const folders = Array.isArray(settings.mediaFolders) ? settings.mediaFolders : [];
  list.innerHTML = "";

  folders.forEach((name, index) => {
    const row = document.createElement("div");
    row.className = "folder-row";

    const input = document.createElement("input");
    input.className = "text-input wide";
    input.type = "text";
    input.value = name;
    input.spellcheck = false;
    input.addEventListener("change", async () => {
      const next = [...folders];
      const name = sanitizeFolder(input.value);
      next[index] = name;
      await saveFolders(next.filter(Boolean));
      setFolderStatus(name ? `"${name}" kaydedildi` : "Boş klasör silindi", "done");
      renderFolders(await readSettings());
    });

    const del = document.createElement("button");
    del.type = "button";
    del.className = "folder-del";
    del.textContent = "Sil";
    del.addEventListener("click", async () => {
      const next = folders.filter((_, i) => i !== index);
      await saveFolders(next);
      renderFolders(await readSettings());
    });

    row.append(input, del);
    list.appendChild(row);
  });
}

async function render(settings) {
  for (const control of controls) renderControl(control, settings);
  buttonSizeValue.textContent = `${settings.buttonSize || DEFAULT_SETTINGS.buttonSize}px`;
  renderFolders(settings);

  const open = await ripsnipTabOpen();
  const ripsnipToggle = document.querySelector('[data-setting="ripsnipWhenOpen"]');
  ripsnipToggle.disabled = !open;
  if (!open) ripsnipToggle.checked = false;
  ripsnipRow.classList.toggle("is-disabled", !open);

  if (open) {
    ripsnipHint.textContent = "Açık sekme algılandı; istersen Ripsnip üzerinden indirir";
  } else {
    ripsnipHint.innerHTML = '<a href="#" id="openRipsnip">Önce siteyi açmanız lazım</a>; kapalıyken CDN kullanılır';
    document.getElementById("openRipsnip").addEventListener("click", (event) => {
      event.preventDefault();
      chrome.tabs.create({ url: "https://ripsnip.com/" });
      window.close();
    });
  }
}

async function updateSetting(control) {
  const current = await readSettings();
  const key = control.dataset.setting;

  if (control.type === "checkbox") {
    current[key] = control.checked;
  } else if (control.type === "range") {
    current[key] = Number(control.value);
  } else if (key === "downloadPath") {
    current[key] = sanitizePath(control.value);
    control.value = current[key];
  } else {
    current[key] = control.value;
  }

  await writeSettings(current);
  await render(current);
}

async function init() {
  document.getElementById("version").textContent = `v${chrome.runtime.getManifest().version}`;
  const settings = await readSettings();
  await render(settings);

  for (const control of controls) {
    const eventName = control.type === "range" ? "input" : "change";
    control.addEventListener(eventName, () => updateSetting(control));
  }

  const folderNew = document.getElementById("folderNew");
  document.getElementById("folderAdd").addEventListener("click", async () => {
    const name = sanitizeFolder(folderNew.value);
    if (!name) { folderNew.focus(); return; }
    const s = await readSettings();
    const folders = Array.isArray(s.mediaFolders) ? s.mediaFolders : [];
    if (!folders.includes(name)) folders.push(name);
    await saveFolders(folders);
    setFolderStatus(`"${name}" eklendi`, "done");
    folderNew.value = "";
    renderFolders(await readSettings());
  });
  folderNew.addEventListener("keydown", (event) => {
    if (event.key === "Enter") document.getElementById("folderAdd").click();
  });

  document.getElementById("reset").addEventListener("click", async () => {
    await writeSettings({ ...DEFAULT_SETTINGS });
    await render({ ...DEFAULT_SETTINGS });
  });
  document.getElementById("openDebugGuide").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("debug-guide.html") });
    window.close();
  });
  document.getElementById("downloadScrolllerCurrent").addEventListener("click", downloadCurrentScrolllerMedia);
  document.getElementById("pickScrolllerElement").addEventListener("click", startScrolllerElementPicker);
  document.getElementById("resetScrolllerElements").addEventListener("click", resetScrolllerHiddenElements);
}

init();
