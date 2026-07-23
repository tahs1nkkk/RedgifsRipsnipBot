/*
 * Popup for the Orion / iOS build.
 *
 * A trimmed rewrite rather than a copy of the desktop popup: everything that
 * depends on chrome.scripting, chrome.tabs or a download folder was removed
 * instead of being left in place to fail silently. ios-bridge.js forces
 * buttonVisibility, rightShiftDownload and a 48px floor on buttonSize, so those
 * are not offered here either.
 */
(() => {
  "use strict";

  const { SETTINGS_KEY, DEFAULT_SETTINGS, withDefaults } = globalThis.RG_SETTINGS;
  const MIN_BUTTON_SIZE = 48;
  const inputs = [...document.querySelectorAll("[data-setting]")];
  const sizeValue = document.getElementById("buttonSizeValue");

  function read() {
    return new Promise((resolve) => {
      chrome.storage.local.get(SETTINGS_KEY, (items) => resolve(withDefaults(items && items[SETTINGS_KEY])));
    });
  }

  function write(settings) {
    return new Promise((resolve) => chrome.storage.local.set({ [SETTINGS_KEY]: settings }, resolve));
  }

  function render(settings) {
    for (const input of inputs) {
      const key = input.dataset.setting;
      if (input.type === "checkbox") input.checked = Boolean(settings[key]);
      else input.value = settings[key];
    }
    if (sizeValue) sizeValue.textContent = `${Math.max(MIN_BUTTON_SIZE, Number(settings.buttonSize) || MIN_BUTTON_SIZE)} px`;
  }

  async function update(key, value) {
    const settings = await read();
    settings[key] = value;
    await write(settings);
    render(settings);
  }

  for (const input of inputs) {
    const key = input.dataset.setting;
    const event = input.type === "range" ? "input" : "change";
    input.addEventListener(event, () => {
      if (input.type === "checkbox") return void update(key, input.checked);
      if (input.type === "range") {
        const size = Math.max(MIN_BUTTON_SIZE, Number(input.value) || MIN_BUTTON_SIZE);
        if (sizeValue) sizeValue.textContent = `${size} px`;
        return void update(key, size);
      }
      update(key, input.value);
    });
  }

  document.getElementById("reset")?.addEventListener("click", async () => {
    const settings = { ...DEFAULT_SETTINGS, buttonSize: MIN_BUTTON_SIZE };
    await write(settings);
    render(settings);
  });

  const version = document.getElementById("version");
  if (version) version.textContent = `v${chrome.runtime.getManifest().version}`;

  read().then(render);
})();
