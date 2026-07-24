// Medya görünümü: site sekmeleri, kategoriler, ızgara, seçim ve toplu işlemler.
//
// İki tasarım kararı burada yaşıyor:
//  1) Video kapakları. R2 yalnız baytları saklıyor, Worker'da ffmpeg yok. İlk
//     kareyi tarayıcı yakalayıp /api/thumb'a bırakıyor; ikinci açılışta ızgara
//     videoyu hiç indirmiyor. Aynı anda en çok iki üretim çalışır.
//  2) Silme sayfayı yeniden yüklemez. Kart yerinde eriyip gider, ızgara kaldığı
//     yerde kalır — 500 dosyalık bir arşivde başa dönmek can sıkıcıydı.

import {
  $, $$, ALL_SITE, ICON, PALETTE, S, api, clear, confirmBox, dialog, el, fmtBytes,
  mediaURL, newId, promptBox, saveMeta, siteBrand, thumbURL, toast
} from "./core.js";
import { openViewer } from "./viewer.js";
import { openShare } from "./share.js";

const SITE_ORDER = ["RedGifs", "Reddit", "Instagram", "Scrolller", "Coomer", "Other"];
const PAGE = 120;

let shown = 0;
let sentinel = null;
let observer = null;

/* ------------------------------------------------------------------ süzme */

export function itemMeta(key) {
  return S.meta.items[key] || null;
}

function catOf(key) {
  const entry = itemMeta(key);
  return entry && entry.cat ? entry.cat : "";
}

function descendants(catId) {
  const out = new Set([catId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const cat of S.meta.cats) {
      if (cat.parent && out.has(cat.parent) && !out.has(cat.id)) { out.add(cat.id); grew = true; }
    }
  }
  return out;
}

export function visible() {
  const needle = S.query.toLocaleLowerCase("tr");
  const catSet = S.cat ? descendants(S.cat) : null;
  const rows = S.media.filter((item) => {
    if (S.site && item.site !== S.site) return false;
    if (catSet && !catSet.has(catOf(item.key))) return false;
    if (needle && !item.name.toLocaleLowerCase("tr").includes(needle)) return false;
    return true;
  });
  const by = {
    new: (a, b) => b.mtime - a.mtime,
    old: (a, b) => a.mtime - b.mtime,
    big: (a, b) => b.size - a.size,
    name: (a, b) => a.name.localeCompare(b.name, "tr")
  }[S.sort];
  return rows.sort(by);
}

/* ------------------------------------------------------------ site sekmeleri */

function tab(id, label, brand, count) {
  const node = el("button", {
    class: `site-tab${S.site === id ? " on" : ""}`, type: "button",
    style: `--tab-grad:${brand.grad};--tab-glow:${brand.glow}`,
    title: label,
    onclick: () => { S.site = id; S.picked.clear(); renderTabs(); renderGrid(); }
  },
    el("span", { class: "site-mark" }, brand.mark),
    el("span", { class: "site-name" }, label),
    el("span", { class: "site-num" }, String(count))
  );
  return node;
}

export function renderTabs() {
  const host = $("#site-tabs");
  clear(host);
  const counts = new Map();
  for (const item of S.media) counts.set(item.site, (counts.get(item.site) || 0) + 1);

  host.append(tab("", "Tümü", ALL_SITE, S.media.length));
  const seen = new Set(SITE_ORDER);
  for (const site of SITE_ORDER) {
    if (!counts.get(site) && site !== "Other") continue;
    host.append(tab(site, site === "Other" ? "Diğer" : site, siteBrand(site), counts.get(site) || 0));
  }
  // Uygulamanın bilmediği etiketler (özel arşivler) de sekmesini alsın.
  for (const [site, count] of counts) {
    if (!seen.has(site)) host.append(tab(site, site, siteBrand(site), count));
  }
}

/* -------------------------------------------------------------- kategoriler */

function catCount(catId) {
  const set = descendants(catId);
  return S.media.filter((item) => set.has(catOf(item.key))).length;
}

async function editCat(cat) {
  const draft = { name: cat.name, color: cat.color };
  const choice = await dialog({
    title: "Kategoriyi düzenle",
    build: (box) => {
      const input = el("input", { type: "text", value: cat.name, maxlength: 60 });
      input.addEventListener("input", () => { draft.name = input.value; });
      box.append(el("label", { class: "f" }, el("span", {}, "Ad"), input));
      const row = el("div", { class: "swatches" });
      for (const color of PALETTE) {
        const swatch = el("button", {
          type: "button", class: `swatch${color === cat.color ? " on" : ""}`,
          style: `background:${color}`,
          onclick: () => {
            row.querySelectorAll(".swatch").forEach((s) => s.classList.remove("on"));
            swatch.classList.add("on");
            draft.color = color;
          }
        });
        row.append(swatch);
      }
      box.append(el("label", { class: "f" }, el("span", {}, "Renk"), row));
    },
    buttons: [
      { label: "Sil", kind: "danger", value: "delete" },
      { label: "Vazgeç", value: null },
      { label: "Kaydet", kind: "primary", value: "save" }
    ]
  });

  if (choice === "save") {
    cat.name = draft.name.trim() || cat.name;
    cat.color = draft.color;
  } else if (choice === "delete") {
    const ok = await confirmBox("Kategori silinsin mi?",
      "Dosyalar silinmez, yalnız bu kategoriden çıkar.", "Sil", true);
    if (!ok) return;
    const doomed = descendants(cat.id);
    S.meta.cats = S.meta.cats.filter((c) => !doomed.has(c.id));
    for (const [key, entry] of Object.entries(S.meta.items)) {
      if (entry.cat && doomed.has(entry.cat)) delete entry.cat;
    }
    if (doomed.has(S.cat)) S.cat = "";
  } else {
    return;
  }
  saveMeta();
  renderCats();
  renderGrid();
}

async function addCat(parent = null) {
  const name = await promptBox(parent ? "Yeni alt kategori" : "Yeni kategori", "Kategori adı", "",
    parent ? "ör. Albüm 1" : "ör. Favoriler");
  if (!name) return;
  S.meta.cats.push({
    id: newId("c"), drive: S.drive, name, parent,
    color: PALETTE[S.meta.cats.length % PALETTE.length], order: S.meta.cats.length
  });
  saveMeta();
  renderCats();
}

function chip(cat) {
  const kids = S.meta.cats.filter((c) => c.parent === cat.id && c.drive === S.drive);
  const open = S.openCats.has(cat.id);
  const node = el("button", {
    class: `cat-chip${S.cat === cat.id ? " on" : ""}${open ? " open" : ""}`,
    type: "button",
    style: S.cat === cat.id ? `background:${cat.color}` : "",
    oncontextmenu: (event) => { event.preventDefault(); editCat(cat); },
    onclick: () => { S.cat = S.cat === cat.id ? "" : cat.id; S.picked.clear(); renderCats(); renderGrid(); }
  },
    el("span", { class: "cat-swatch", style: `background:${cat.color}` }),
    cat.name,
    el("span", { class: "site-num" }, String(catCount(cat.id)))
  );
  if (kids.length) {
    node.append(el("span", {
      class: "cat-caret", html: ICON.chevronDown,
      onclick: (event) => {
        event.stopPropagation();
        if (open) S.openCats.delete(cat.id); else S.openCats.add(cat.id);
        renderCats();
      }
    }));
  }
  return { node, kids, open };
}

export function renderCats() {
  const host = $("#cat-bar");
  clear(host);

  host.append(el("button", {
    class: `cat-chip${S.cat ? "" : " on"}`, type: "button",
    style: S.cat ? "" : "background:linear-gradient(115deg,#fbbf24,#ec4899)",
    onclick: () => { S.cat = ""; renderCats(); renderGrid(); }
  }, "Tümü"));

  for (const cat of S.meta.cats.filter((c) => !c.parent && c.drive === S.drive)) {
    const { node, kids, open } = chip(cat);
    host.append(node);
    if (open) {
      const row = el("div", { class: "cat-kids" });
      for (const kid of kids) row.append(chip(kid).node);
      row.append(el("button", {
        class: "cat-chip cat-add", type: "button", onclick: () => addCat(cat.id)
      }, "+ Alt kategori"));
      host.append(row);
    }
  }

  host.append(el("button", {
    class: "cat-chip cat-add", type: "button", onclick: () => addCat(null)
  }, "+ Kategori"));
}

/* ------------------------------------------------------------- video kapağı */

const queue = [];
let running = 0;

function pump() {
  while (running < 2 && queue.length) {
    const job = queue.shift();
    running += 1;
    job().catch(() => {}).finally(() => { running -= 1; pump(); });
  }
}

async function grabPoster(key) {
  const video = el("video", { preload: "metadata", muted: true, playsinline: true, crossorigin: "use-credentials" });
  video.src = mediaURL(key);
  await new Promise((resolve, reject) => {
    const stop = setTimeout(() => reject(new Error("zaman aşımı")), 20000);
    const fail = () => { clearTimeout(stop); reject(new Error("video açılamadı")); };
    video.addEventListener("error", fail, { once: true });
    video.addEventListener("loadedmetadata", () => {
      // Tam sıfırıncı kare çoğu videoda siyah; biraz ileri sararız.
      video.currentTime = Math.min(0.6, (video.duration || 1) * 0.1);
    }, { once: true });
    video.addEventListener("seeked", () => { clearTimeout(stop); resolve(); }, { once: true });
  });

  const width = Math.min(480, video.videoWidth || 480);
  const scale = width / (video.videoWidth || width);
  const canvas = el("canvas");
  canvas.width = width;
  canvas.height = Math.max(1, Math.round((video.videoHeight || 270) * scale));
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  video.src = "";

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.72));
  if (!blob) throw new Error("kare alınamadı");
  // Sunucuya bırakmak "en iyi çaba": başarısız olsa da kullanıcı kapağı görür.
  fetch(thumbURL(key), { method: "PUT", credentials: "same-origin", body: blob }).catch(() => {});
  return blob;
}

function wantPoster(key, img) {
  queue.push(async () => {
    try {
      const blob = await grabPoster(key);
      img.src = URL.createObjectURL(blob);
    } catch {
      img.replaceWith(el("div", { class: "fallback" }, "🎞"));
    }
  });
  pump();
}

/* ------------------------------------------------------------------ ızgara */

function togglePick(key, node) {
  if (S.picked.has(key)) S.picked.delete(key); else S.picked.add(key);
  node.classList.toggle("picked", S.picked.has(key));
  renderSelectBar();
}

function card(item, index) {
  const node = el("button", {
    class: `media-card${S.picked.has(item.key) ? " picked" : ""}`,
    type: "button", title: item.name, dataset: { key: item.key },
    onclick: () => {
      if (S.selecting) togglePick(item.key, node);
      else openViewer(visible(), index, onDeleted);
    }
  });

  if (item.kind === "video") {
    const img = el("img", { loading: "lazy", alt: "", src: thumbURL(item.key) });
    img.addEventListener("error", () => { wantPoster(item.key, img); }, { once: true });
    node.append(img, el("span", { class: "play-badge" }, el("span", { html: ICON.play })));
  } else if (item.kind === "image") {
    const img = el("img", { loading: "lazy", alt: "", src: mediaURL(item.key) });
    img.addEventListener("error", () => { img.replaceWith(el("div", { class: "fallback" }, "🖼")); }, { once: true });
    node.append(img);
  } else {
    node.append(el("div", { class: "fallback" }, "📄"));
  }

  node.append(
    el("span", { class: "media-size" }, fmtBytes(item.size)),
    el("span", { class: "media-name" }, item.name),
    el("span", { class: "check", html: ICON.check })
  );
  return node;
}

function renderStats(rows) {
  const dock = $("#media-stats");
  if (S.view !== "media" || S.selecting) { dock.hidden = true; return; }
  const images = rows.filter((r) => r.kind === "image").length;
  const videos = rows.filter((r) => r.kind === "video").length;
  const bytes = rows.reduce((sum, r) => sum + (r.size || 0), 0);
  clear(dock);
  dock.append(
    el("span", { class: "stat" }, el("b", {}, String(rows.length)), "dosya"),
    el("span", { class: "stat" }, el("b", {}, String(images)), "görsel"),
    el("span", { class: "stat" }, el("b", {}, String(videos)), "video"),
    el("span", { class: "stat" }, el("b", {}, fmtBytes(bytes)))
  );
  dock.hidden = false;
}

export function renderGrid(keepShown = false) {
  const root = $("#media-root");
  const rows = visible();
  if (!keepShown) shown = 0;
  clear(root);

  if (!rows.length) {
    root.append(el("div", { class: "empty" },
      el("b", {}, S.media.length ? "Bu süzgeçte dosya yok" : "Arşiv boş"),
      S.media.length ? "Site sekmesini ya da aramayı değiştir." : "Telefondan indirdiklerin buraya düşer."));
    renderStats(rows);
    return;
  }

  shown = Math.min(rows.length, Math.max(shown, PAGE));
  for (let i = 0; i < shown; i += 1) root.append(card(rows[i], i));

  if (observer) observer.disconnect();
  if (shown < rows.length) {
    sentinel = el("div", { style: "grid-column:1/-1;height:1px" });
    root.append(sentinel);
    observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        shown = Math.min(rows.length, shown + PAGE);
        renderGrid(true);
      }
    }, { rootMargin: "600px" });
    observer.observe(sentinel);
  }

  renderStats(rows);
}

/* -------------------------------------------------------- silme / güncelleme */

// Görüntüleyici bir dosyayı sildiğinde ızgarayı yerinde günceller.
function onDeleted(keys) {
  const gone = new Set(keys);
  S.media = S.media.filter((item) => !gone.has(item.key));
  for (const key of gone) { delete S.meta.items[key]; S.picked.delete(key); }
  for (const node of $$("#media-root .media-card")) {
    if (gone.has(node.dataset.key)) {
      node.classList.add("leaving");
      setTimeout(() => node.remove(), 300);
    }
  }
  renderTabs();
  renderStats(visible());
  updateChooserCount();
}

export function updateChooserCount() {
  const badge = $("#chooser-media");
  if (badge) badge.textContent = `${S.media.length} dosya`;
}

/* ----------------------------------------------------------------- seçim */

export function renderSelectBar() {
  const bar = $("#select-bar");
  bar.hidden = !S.selecting;
  document.body.classList.toggle("selecting", S.selecting);
  $("#sel-count").textContent = `${S.picked.size} seçildi`;
  renderStats(visible());
}

async function pickCategory(title) {
  const cats = S.meta.cats.filter((c) => c.drive === S.drive);
  return dialog({
    title,
    text: cats.length ? null : "Henüz kategori yok. Önce medya sayfasından bir kategori ekle.",
    build: (box, close) => {
      const tree = el("div", { class: "tree" });
      tree.append(el("button", { type: "button", onclick: () => close({ id: "" }) },
        el("span", { class: "cat-swatch", style: "background:#6b7280" }), "Kategorisiz"));
      for (const cat of cats.filter((c) => !c.parent)) {
        tree.append(el("button", { type: "button", onclick: () => close({ id: cat.id }) },
          el("span", { class: "cat-swatch", style: `background:${cat.color}` }), cat.name));
        for (const kid of cats.filter((c) => c.parent === cat.id)) {
          tree.append(el("button", { type: "button", class: "child", onclick: () => close({ id: kid.id }) },
            el("span", { class: "cat-swatch", style: `background:${kid.color}` }), kid.name));
        }
      }
      box.append(tree);
    },
    buttons: [{ label: "Vazgeç", value: null }]
  });
}

async function pickSite(title) {
  return dialog({
    title,
    text: "Dosya R2'de yeni yola taşınır; bağlantılar korunur.",
    build: (box, close) => {
      const tree = el("div", { class: "tree" });
      for (const site of SITE_ORDER) {
        const brand = siteBrand(site);
        tree.append(el("button", { type: "button", onclick: () => close(site) },
          el("span", { class: "site-mark", style: `background:${brand.grad}` }, brand.mark),
          site === "Other" ? "Diğer" : site));
      }
      box.append(tree);
    },
    buttons: [{ label: "Vazgeç", value: null }]
  });
}

async function bulk(action) {
  const keys = [...S.picked];
  if (!keys.length && action !== "all" && action !== "cancel") {
    toast("Önce dosya seç", "err");
    return;
  }

  if (action === "cancel") {
    S.selecting = false; S.picked.clear();
    renderSelectBar(); renderGrid(true);
    $("#media-select").classList.remove("on");
    $("#media-select").textContent = "Seç";
    return;
  }

  if (action === "all") {
    const rows = visible();
    const allPicked = rows.every((r) => S.picked.has(r.key));
    for (const row of rows) { if (allPicked) S.picked.delete(row.key); else S.picked.add(row.key); }
    for (const node of $$("#media-root .media-card")) {
      node.classList.toggle("picked", S.picked.has(node.dataset.key));
    }
    renderSelectBar();
    return;
  }

  if (action === "delete") {
    const ok = await confirmBox(`${keys.length} dosya silinsin mi?`,
      "Bu işlem geri alınamaz; dosyalar R2'den kalkar.", "Sil", true);
    if (!ok) return;
    try {
      await api.post("/api/media/bulk", { action: "delete", keys });
      onDeleted(keys);
      S.picked.clear();
      renderSelectBar();
      toast(`${keys.length} dosya silindi`, "ok");
    } catch (error) { toast(`Silinemedi: ${error.message}`, "err"); }
    return;
  }

  if (action === "cat") {
    const choice = await pickCategory("Kategoriye taşı");
    if (!choice) return;
    for (const key of keys) {
      const entry = S.meta.items[key] || (S.meta.items[key] = {});
      if (choice.id) entry.cat = choice.id; else delete entry.cat;
      if (!Object.keys(entry).length) delete S.meta.items[key];
    }
    saveMeta();
    renderCats();
    renderGrid();
    toast(`${keys.length} dosya taşındı`, "ok");
    return;
  }

  if (action === "site") {
    const site = await pickSite("Siteye taşı");
    if (!site) return;
    try {
      const result = await api.post("/api/media/bulk", { action: "move", keys, drive: S.drive, site });
      const moved = result.moved || {};
      for (const item of S.media) {
        const target = moved[item.key];
        if (!target) continue;
        // Meta anahtarı da yeni yola taşınmalı, yoksa kategori kaybolur.
        if (S.meta.items[item.key]) {
          S.meta.items[target] = S.meta.items[item.key];
          delete S.meta.items[item.key];
        }
        item.key = target;
        item.site = site;
      }
      saveMeta();
      S.picked.clear();
      renderTabs(); renderSelectBar(); renderGrid();
      toast(`${Object.keys(moved).length} dosya taşındı`, "ok");
    } catch (error) { toast(`Taşınamadı: ${error.message}`, "err"); }
    return;
  }

  if (action === "share") {
    await openShare(keys);
  }
}

/* ------------------------------------------------------------------- veri */

export async function load() {
  try {
    S.media = await api.get(`/api/media?drive=${encodeURIComponent(S.drive)}`) || [];
  } catch (error) {
    toast(`Medya alınamadı: ${error.message}`, "err");
    S.media = [];
  }
  renderTabs();
  renderCats();
  renderGrid();
  updateChooserCount();
}

export function wire() {
  const search = $("#media-search");
  search.addEventListener("input", () => { S.query = search.value.trim(); renderGrid(); });

  const sort = $("#media-sort");
  const labels = { new: "Yeni → eski", old: "Eski → yeni", big: "Büyükten küçüğe", name: "Ada göre" };
  const cycle = ["new", "old", "big", "name"];
  sort.addEventListener("click", () => {
    S.sort = cycle[(cycle.indexOf(S.sort) + 1) % cycle.length];
    sort.textContent = labels[S.sort];
    renderGrid();
  });

  const select = $("#media-select");
  select.addEventListener("click", () => {
    S.selecting = !S.selecting;
    if (!S.selecting) S.picked.clear();
    select.classList.toggle("on", S.selecting);
    select.textContent = S.selecting ? "Seçimi bitir" : "Seç";
    renderSelectBar();
    renderGrid(true);
  });

  for (const button of $$("#select-bar [data-act]")) {
    button.addEventListener("click", () => bulk(button.dataset.act));
  }
}

export { onDeleted };
