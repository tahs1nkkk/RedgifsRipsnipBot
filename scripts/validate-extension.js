const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..", "edge-extension");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const referenced = new Set();

referenced.add(manifest.background.service_worker);
referenced.add(manifest.action.default_popup);
for (const icon of Object.values(manifest.icons || {})) referenced.add(icon);
for (const icon of Object.values(manifest.action.default_icon || {})) referenced.add(icon);
for (const entry of manifest.content_scripts || []) {
  for (const file of entry.js || []) referenced.add(file);
  if (entry.js.some((file) => /^content-(?!ripsnip)/.test(path.basename(file)))) {
    const sharedIndex = entry.js.indexOf("common/settings.js");
    if (sharedIndex < 0) throw new Error(`Missing common settings in: ${entry.matches.join(", ")}`);
  }
}

for (const file of referenced) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Manifest references missing file: ${file}`);
}

for (const htmlName of fs.readdirSync(root).filter((name) => name.endsWith(".html"))) {
  const html = fs.readFileSync(path.join(root, htmlName), "utf8");
  const assetPattern = /<(?:script|link)\b[^>]+(?:src|href)="([^"]+)"/g;
  for (const match of html.matchAll(assetPattern)) {
    const asset = match[1];
    if (/^(?:https?:|data:|#)/i.test(asset)) continue;
    if (!fs.existsSync(path.join(root, asset))) throw new Error(`${htmlName} references missing asset: ${asset}`);
    referenced.add(asset);
  }
}

function collectJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectJs(full);
    return entry.isFile() && entry.name.endsWith(".js") ? [full] : [];
  });
}

for (const file of collectJs(root)) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${path.relative(root, file)}: ${result.stderr.trim()}`);
}

console.log(`Extension validation passed (${referenced.size} manifest assets).`);
