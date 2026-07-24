// Kabuk: açılış kapısı, görünüm geçişleri, arşiv çekmecesi ve üst çubuk.
//
// Sayfa iki büyük görünümden ibaret (listeler / medya) ve aralarındaki geçiş
// ekranın iki kenarındaki butonlarla yapılıyor. Böylece üstte sekme satırı
// tutmaya gerek kalmıyor — o alan site sekmelerine ayrıldı.

import {
  $, $$, ICON, PALETTE, S, api, clear, confirmBox, el, hideScrim, newId, promptBox,
  saveMeta, showScrim, toast
} from "./core.js";
import * as lists from "./lists.js";
import * as media from "./media.js";
import { closeViewer, isOpen } from "./viewer.js";
import { openUpload, wireDragDrop } from "./upload.js";
import { manageShares } from "./share.js";

/* ---------------------------------------------------------------- görünüm */

function setView(name, direction) {
  S.view = name;
  const listsView = $("#view-lists");
  const mediaView = $("#view-media");
  const active = name === "lists" ? listsView : mediaView;
  const other = name === "lists" ? mediaView : listsView;

  other.hidden = true;
  active.hidden = false;
  active.classList.remove("from-left", "from-right");
  // reflow: aynı sınıf ikinci kez eklendiğinde animasyon tekrar oynasın.
  void active.offsetWidth;
  active.classList.add(direction === "left" ? "from-left" : "from-right");

  $("#edge-left").hidden = name === "lists";
  $("#edge-right").hidden = name === "media";
  $("#media-stats").hidden = name !== "media";
  if (name === "media") media.renderGrid(true);
  $(".stage").scrollTop = 0;
}

function enterApp(view) {
  const chooser = $("#chooser");
  chooser.classList.add("leaving");
  setTimeout(() => { chooser.hidden = true; chooser.classList.remove("leaving"); }, 260);
  $("#app").hidden = false;
  setView(view, view === "lists" ? "left" : "right");
}

function backToChooser() {
  $("#app").hidden = true;
  $("#chooser").hidden = false;
}

/* ------------------------------------------------------------- arşivler */

function currentDrive() {
  return S.meta.drives.find((d) => d.id === S.drive) || S.meta.drives[0];
}

function paintBrand() {
  const drive = currentDrive();
  $("#brand-name").textContent = drive ? drive.name : "Tasu Arşiv";
  $("#brand-dot").style.background = drive ? drive.accent : "";
  $("#brand-ver").textContent = `v${S.version}`;
}

async function switchDrive(id) {
  if (S.drive === id) { closeDrawer(); return; }
  S.drive = id;
  S.site = "";
  S.cat = "";
  S.picked.clear();
  localStorage.setItem("tasu.drive", id);
  paintBrand();
  closeDrawer();
  await media.load();
  media.renderCats();
}

function closeDrawer() {
  $("#drive-drawer").hidden = true;
  hideScrim();
}

function openDrawer() {
  const drawer = $("#drive-drawer");
  clear(drawer);
  drawer.append(el("h2", {}, "Arşivler"));
  drawer.append(el("p", { class: "hint" },
    "Her arşiv ayrı bir depo: dosyaları, kategorileri ve site sekmeleri birbirine karışmaz."));

  for (const drive of S.meta.drives) {
    const row = el("button", {
      class: `drive-row${drive.id === S.drive ? " on" : ""}`, type: "button",
      onclick: () => switchDrive(drive.id),
      oncontextmenu: async (event) => {
        event.preventDefault();
        const name = await promptBox("Arşivi yeniden adlandır", "Ad", drive.name);
        if (!name) return;
        drive.name = name;
        saveMeta();
        paintBrand();
        openDrawer();
      }
    },
      el("span", { class: "drive-mark", style: `background:${drive.accent}` }, drive.name.slice(0, 1).toUpperCase()),
      el("span", { class: "drive-meta" },
        el("b", {}, drive.name),
        el("span", {}, drive.id === S.drive ? `${S.media.length} dosya` : "geçmek için dokun"))
    );
    if (drive.id !== "main") {
      row.append(el("span", {
        class: "drive-kill", html: ICON.trash,
        onclick: async (event) => {
          event.stopPropagation();
          const ok = await confirmBox("Arşiv listeden kaldırılsın mı?",
            "Dosyalar R2'de durmaya devam eder, yalnız bu arşiv görünmez olur.", "Kaldır", true);
          if (!ok) return;
          S.meta.drives = S.meta.drives.filter((d) => d.id !== drive.id);
          if (S.drive === drive.id) await switchDrive("main");
          saveMeta();
          openDrawer();
        }
      }));
    }
    drawer.append(row);
  }

  drawer.append(el("button", {
    class: "drive-row", type: "button", style: "border-style:dashed",
    onclick: async () => {
      const name = await promptBox("Yeni arşiv", "Arşiv adı", "", "ör. İş, Referanslar");
      if (!name) return;
      const drive = {
        id: newId("d"), name,
        accent: PALETTE[S.meta.drives.length % PALETTE.length]
      };
      S.meta.drives.push(drive);
      await saveMeta(true);
      await switchDrive(drive.id);
    }
  },
    el("span", { class: "drive-mark", style: "background:rgba(255,255,255,.12);color:#fff" }, "+"),
    el("span", { class: "drive-meta" }, el("b", {}, "Yeni arşiv"), el("span", {}, "ayrı bir depo aç"))
  ));

  drawer.append(el("button", {
    class: "drive-row", type: "button", style: "margin-top:14px",
    onclick: () => { closeDrawer(); manageShares(); }
  },
    el("span", { class: "drive-mark", style: "background:rgba(255,255,255,.12);color:#fff" }, "↗"),
    el("span", { class: "drive-meta" }, el("b", {}, "Paylaşımlar"), el("span", {}, "etkin linkleri yönet"))
  ));

  drawer.hidden = false;
  showScrim(closeDrawer);
}

/* ------------------------------------------------------------------ açılış */

async function reloadAll() {
  await Promise.all([media.load(), lists.load()]);
  media.renderCats();
}

async function boot() {
  // iOS uygulamasının WebView'ı kendini böyle tanıtır; hover'sız ve daha yoğun
  // cam bir varyant devreye girer.
  const params = new URLSearchParams(location.search);
  if (params.get("app") === "1" || /TasuArchiveApp/.test(navigator.userAgent)) {
    document.documentElement.classList.add("ios");
  }

  try {
    const config = await api.get("/api/config");
    if (config && config.version) S.version = config.version;
  } catch { /* sürüm kozmetik */ }

  try {
    const meta = await api.get("/api/meta");
    if (meta) S.meta = { ...S.meta, ...meta };
    if (meta && meta.degraded) toast("Ayarlar okunamadı, geçici olarak varsayılan düzen", "err");
  } catch (error) {
    toast(`Ayarlar alınamadı: ${error.message}`, "err");
  }

  const saved = localStorage.getItem("tasu.drive");
  if (saved && S.meta.drives.some((d) => d.id === saved)) S.drive = saved;
  paintBrand();

  lists.wire();
  media.wire();
  wireDragDrop(reloadAll);

  await reloadAll();

  // Doğrudan bir görünüme bağlantı: /?go=media kapıyı atlar.
  const go = params.get("go");
  if (go === "media" || go === "lists") enterApp(go);
}

/* ------------------------------------------------------------------ bağlama */

function wireShell() {
  for (const half of $$(".half")) {
    half.addEventListener("click", () => enterApp(half.dataset.go));
  }

  $("#edge-left").addEventListener("click", () => setView("lists", "left"));
  $("#edge-right").addEventListener("click", () => setView("media", "right"));

  $("#btn-drives").addEventListener("click", openDrawer);
  $(".brand").addEventListener("click", backToChooser);

  $("#btn-add").addEventListener("click", () => openUpload([], reloadAll));

  $("#btn-refresh").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    await reloadAll();
    button.disabled = false;
    toast("Yenilendi", "ok");
  });

  $("#btn-logout").addEventListener("click", async () => {
    const ok = await confirmBox("Çıkış yapılsın mı?", "Tekrar girmek için Google hesabın gerekecek.", "Çıkış yap");
    if (ok) location.href = "/auth/logout";
  });

  document.addEventListener("keydown", (event) => {
    if (isOpen() || $("#dialogs").classList.contains("on")) return;
    if (event.target.matches("input, select, textarea")) return;
    if (event.key === "ArrowLeft") setView("lists", "left");
    if (event.key === "ArrowRight") setView("media", "right");
    if (event.key === "Escape" && !$("#drive-drawer").hidden) closeDrawer();
    if (event.key === "/") { event.preventDefault(); $(S.view === "lists" ? "#lists-search" : "#media-search").focus(); }
  });

  // Dokunmatikte yatay kaydırma da görünüm değiştirir; kenar butonları telefonda
  // dar kaldığı için asıl gezinme bu.
  const swipe = { x: 0, y: 0, on: false };
  const stage = $(".stage");
  stage.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1) { swipe.on = false; return; }
    swipe.x = event.touches[0].clientX;
    swipe.y = event.touches[0].clientY;
    swipe.on = true;
  }, { passive: true });
  stage.addEventListener("touchend", (event) => {
    if (!swipe.on || isOpen() || $("#dialogs").classList.contains("on")) return;
    swipe.on = false;
    const dx = event.changedTouches[0].clientX - swipe.x;
    const dy = event.changedTouches[0].clientY - swipe.y;
    // Dikey kaydırmayı yanlışlıkla geçiş saymamak için yatay bileşen baskın olmalı.
    if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
    const target = dx < 0 ? "media" : "lists";
    if (S.view === target) return;
    setView(target, dx < 0 ? "right" : "left");
  }, { passive: true });

  // Geri tuşu görüntüleyiciyi kapatsın, sayfadan çıkmasın.
  window.addEventListener("popstate", () => { if (isOpen()) closeViewer(); });
}

wireShell();
boot();
