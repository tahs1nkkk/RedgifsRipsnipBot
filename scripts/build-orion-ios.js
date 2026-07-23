/*
 * Packages the Orion / iOS build.
 *
 * The site handlers are deliberately not forked: they are copied out of
 * edge-extension/ at build time, so a parser fix on the desktop side ships to
 * the phone with the next build. Only the manifest and ios-bridge.js live in
 * orion-ios/.
 *
 *   node scripts/build-orion-ios.js          # manifest v3 (try this first)
 *   node scripts/build-orion-ios.js --mv2    # manifest v2 fallback
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const shared = path.join(root, "edge-extension");
const iosSrc = path.join(root, "orion-ios");
const dist = path.join(root, "dist");
const outDir = path.join(dist, "orion-ios");

const useMv2 = process.argv.includes("--mv2");
const manifestName = useMv2 ? "manifest.mv2.json" : "manifest.mv3.json";
const manifest = JSON.parse(fs.readFileSync(path.join(iosSrc, manifestName), "utf8"));

// Files that orion-ios/ owns. Everything else is pulled from edge-extension/.
// popup.html/js are rewritten rather than copied: the desktop popup is full of
// controls that cannot work on a phone.
const IOS_OWNED = new Set(["ios-bridge.js", "ios-mobile.css", "popup.html", "popup.js"]);

function copyInto(relative) {
  const from = IOS_OWNED.has(relative) ? path.join(iosSrc, relative) : path.join(shared, relative);
  if (!fs.existsSync(from)) throw new Error(`Missing source file: ${relative}`);
  const to = path.join(outDir, relative);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  return to;
}

function collectReferences() {
  const files = new Set();
  for (const entry of manifest.content_scripts || []) {
    for (const file of entry.js || []) files.add(file);
    for (const file of entry.css || []) files.add(file);
  }
  for (const icon of Object.values(manifest.icons || {})) files.add(icon);

  const action = manifest.action || manifest.browser_action || {};
  if (action.default_popup) files.add(action.default_popup);
  for (const icon of Object.values(action.default_icon || {})) files.add(icon);

  for (const war of manifest.web_accessible_resources || []) {
    if (typeof war === "string") files.add(war);
    else for (const resource of war.resources || []) files.add(resource);
  }
  return files;
}

function collectHtmlAssets(htmlPath) {
  const html = fs.readFileSync(htmlPath, "utf8");
  const found = [];
  for (const match of html.matchAll(/<(?:script|link|img)\b[^>]+(?:src|href)="([^"]+)"/g)) {
    const asset = match[1];
    if (/^(?:https?:|data:|#)/i.test(asset)) continue;
    found.push(asset);
  }
  return found;
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const pending = [...collectReferences()];
const copied = new Set();
while (pending.length) {
  const relative = pending.shift();
  if (copied.has(relative)) continue;
  const written = copyInto(relative);
  copied.add(relative);
  // Popup and debug-guide pages pull in their own CSS/JS; follow those too.
  if (written.endsWith(".html")) pending.push(...collectHtmlAssets(written));
}

fs.writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

// The harness lives beside the built files so it can load them by relative path,
// but outside outDir so it never ends up inside the shipped .xpi.
fs.copyFileSync(path.join(iosSrc, "harness.html"), path.join(dist, "__harness.html"));

for (const relative of copied) {
  if (!relative.endsWith(".js")) continue;
  const result = spawnSync(process.execPath, ["--check", path.join(outDir, relative)], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${relative}: ${result.stderr.trim()}`);
}

// Orion installs a zipped extension; the .xpi extension is what its "install
// from file" picker expects, and it is a plain zip underneath.
const zipPath = path.join(dist, "RedGifsDownloader-orion-ios.zip");
const xpiPath = path.join(dist, "RedGifsDownloader-orion-ios.xpi");
fs.rmSync(zipPath, { force: true });
fs.rmSync(xpiPath, { force: true });

// Compress-Archive is deliberately avoided: Windows PowerShell 5.1 writes entry
// names with backslashes, so "common/settings.js" ships as "common\settings.js".
// A loader that does not normalise that cannot find RG_SETTINGS, every handler
// throws on its first line, and no button appears on any site. Going through
// .NET directly lets us write spec-compliant forward slashes.
const zipScript = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$src = '${outDir}'
$zip = [System.IO.Compression.ZipFile]::Open('${zipPath}', 'Create')
try {
  foreach ($file in Get-ChildItem -Path $src -Recurse -File) {
    $rel = $file.FullName.Substring($src.Length + 1).Replace('\\', '/')
    [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $rel)
  }
} finally {
  $zip.Dispose()
}
`;

const zip = spawnSync("powershell", ["-NoProfile", "-Command", zipScript], { encoding: "utf8" });
if (zip.status !== 0) {
  console.error(`Zip step failed: ${zip.stderr || zip.stdout}`);
  console.error(`Folder is ready at ${outDir} — zip its CONTENTS manually and rename to .xpi.`);
  process.exit(1);
}
fs.copyFileSync(zipPath, xpiPath);

// A backslash here would ship a package whose subfolder never resolves, so fail
// the build rather than hand over an archive that silently loads nothing.
const entryNames = [...fs.readFileSync(zipPath).toString("latin1").matchAll(/PK\x01\x02/g)].length;
if (fs.readFileSync(zipPath).toString("latin1").includes("common\\settings.js") || !entryNames) {
  console.error("Zip step produced backslash entry names — package would not load.");
  process.exit(1);
}

console.log(`Built ${useMv2 ? "manifest v2" : "manifest v3"} package: ${copied.size + 1} files`);
console.log(`  folder: ${outDir}`);
console.log(`  upload: ${xpiPath}`);
