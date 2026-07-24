// Ortak çekirdek: DOM yardımcıları, API istemcisi, uygulama durumu, site
// kimlikleri, bildirim (toast) ve diyalog altyapısı.
//
// Diyaloglar bilinçli olarak native confirm()/alert() değil: tarayıcının kutusu
// temanın dışında duruyor, mobilde sayfayı donduruyor ve iOS WebView'ında
// bambaşka görünüyordu. Buradaki kutu aynı camdan, aynı butonlarla.

/* --------------------------------------------------------------- DOM ufaklık */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "html") node.innerHTML = value;          // yalnız ICON sabitleri
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const kid of kids.flat(3)) {
    if (kid == null || kid === false || kid === "") continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

/* ------------------------------------------------------------------ simgeler */

const S_ = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"';

export const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>',
  check: `<svg ${S_} stroke-width="3"><path d="M4 12l5 5L20 6"/></svg>`,
  chevronDown: `<svg ${S_}><path d="M6 9l6 6 6-6"/></svg>`,
  chevronLeft: `<svg ${S_}><path d="M15 5l-7 7 7 7"/></svg>`,
  chevronRight: `<svg ${S_}><path d="M9 5l7 7-7 7"/></svg>`,
  pencil: `<svg ${S_}><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/></svg>`,
  x: `<svg ${S_}><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  download: `<svg ${S_}><path d="M12 4v11M7.5 11L12 15.5 16.5 11M5 19h14"/></svg>`,
  share: `<svg ${S_}><circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.3 10.8l7.4-4M8.3 13.2l7.4 4"/></svg>`,
  trash: `<svg ${S_}><path d="M4 7h16M9.5 7V5h5v2M6.5 7l1 12h9l1-12"/></svg>`,
  plus: `<svg ${S_}><path d="M12 5v14M5 12h14"/></svg>`,
  folder: `<svg ${S_}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`,
  drive: `<svg ${S_}><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/></svg>`,
  volume: `<svg ${S_}><path d="M4 9v6h4l5 4V5L8 9zM16.5 9.5a3.5 3.5 0 0 1 0 5M19 7a7 7 0 0 1 0 10"/></svg>`,
  mute: `<svg ${S_}><path d="M4 9v6h4l5 4V5L8 9zM17 10l4 4M21 10l-4 4"/></svg>`,
  expand: `<svg ${S_}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>`,
  pip: `<svg ${S_}><rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="12" width="7" height="5" rx="1"/></svg>`,
  back10: `<svg ${S_}><path d="M11 7H6.5V2.5"/><path d="M6.6 7.1A7.5 7.5 0 1 1 4.6 13"/></svg>`,
  fwd10: `<svg ${S_}><path d="M13 7h4.5V2.5"/><path d="M17.4 7.1A7.5 7.5 0 1 0 19.4 13"/></svg>`
};

/* ---------------------------------------------------------------- biçimleme */

export function fmtBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export function fmtTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

export function encKey(key) {
  return String(key).split("/").map(encodeURIComponent).join("/");
}

export const mediaURL = (key) => `/api/media/${encKey(key)}`;
export const thumbURL = (key) => `/api/thumb/${encKey(key)}`;

/* ---------------------------------------------------------------------- API */

async function request(path, options) {
  const res = await fetch(path, { credentials: "same-origin", ...options });
  if (res.status === 401) {
    // Oturum düşmüş: sayfada kalıp 401 yığmak yerine girişe dön.
    location.replace("/auth/login");
    throw new Error("oturum sona erdi");
  }
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = null; } }
  if (!res.ok) {
    const err = new Error((data && data.error) || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const jsonInit = (method, body) => ({
  method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
});

export const api = {
  get: (path) => request(path),
  put: (path, body) => request(path, jsonInit("PUT", body)),
  post: (path, body) => request(path, jsonInit("POST", body)),
  del: (path) => request(path, { method: "DELETE" })
};

/* ------------------------------------------------------------ site kimlikleri */

// Her sitenin sekmesi kendi renginde. Marka gradyanları kabaca sitelerin
// kendi paletlerinden; amaç birebir taklit değil, bir bakışta ayırt edilmesi.
export const SITES = {
  RedGifs:   { grad: "linear-gradient(135deg,#ff2d55,#ff7a45)", glow: "#ff2d55", mark: "RG" },
  Reddit:    { grad: "linear-gradient(135deg,#ff4500,#ff8717)", glow: "#ff4500", mark: "r/" },
  Instagram: { grad: "linear-gradient(135deg,#f9ce34,#ee2a7b 52%,#6228d7)", glow: "#ee2a7b", mark: "IG" },
  Scrolller: { grad: "linear-gradient(135deg,#00c6ff,#2b5cff)", glow: "#2b5cff", mark: "SC" },
  Coomer:    { grad: "linear-gradient(135deg,#16c79a,#0e9f6e)", glow: "#16c79a", mark: "CO" },
  Other:     { grad: "linear-gradient(135deg,#6b7280,#3f4653)", glow: "#6b7280", mark: "••" }
};

export const ALL_SITE = {
  grad: "linear-gradient(115deg,#fbbf24,#ec4899 55%,#8b5cf6)", glow: "#ec4899", mark: "∗"
};

export function siteBrand(site) { return SITES[site] || SITES.Other; }

export const PALETTE = [
  "#f59e0b", "#ec4899", "#8b5cf6", "#38bdf8", "#34d399",
  "#f4525f", "#facc15", "#22d3ee", "#a78bfa", "#fb7185"
];

/* -------------------------------------------------------------------- durum */

export const S = {
  version: "1.1",
  drive: "main",
  meta: { v: 1, drives: [{ id: "main", name: "Tasu Arşiv", accent: "#f59e0b" }], cats: [], items: {}, lists: {}, listCats: [] },
  media: [],        // geçerli arşivin tüm dosyaları
  lists: [],        // /api/lists anlık görüntüsü
  view: "media",
  site: "",         // "" = Tümü
  cat: "",          // "" = hepsi
  openCats: new Set(),
  sort: "new",      // new | old | big | name
  query: "",
  listQuery: "",
  selecting: false,
  picked: new Set()
};

export function newId(prefix) {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

// Meta yazımı gecikmeli: renk seçicide her tıklamada Supabase'e gitmek yerine
// kullanıcı durunca tek istek. Aynı anda birden çok değişiklik birleşir.
let metaTimer = null;
let metaPending = null;

export function saveMeta(immediate = false) {
  clearTimeout(metaTimer);
  const flush = async () => {
    metaPending = null;
    try {
      await api.put("/api/meta", S.meta);
    } catch (error) {
      toast(`Ayar kaydedilemedi: ${error.message}`, "err");
    }
  };
  if (immediate) return flush();
  metaPending = flush;
  metaTimer = setTimeout(flush, 500);
  return Promise.resolve();
}

// Sekme kapanırken bekleyen yazıyı kaçırmayalım.
window.addEventListener("pagehide", () => { if (metaPending) metaPending(); });

/* ---------------------------------------------------------------- bildirim */

export function toast(message, kind = "") {
  const host = $("#toasts");
  if (!host) return;
  const node = el("div", { class: `toast ${kind}` }, el("i", { class: "tdot" }), el("span", {}, message));
  host.append(node);
  setTimeout(() => {
    node.classList.add("out");
    setTimeout(() => node.remove(), 240);
  }, kind === "err" ? 4200 : 2600);
}

/* ----------------------------------------------------------------- diyalog */

/**
 * Site içi diyalog. buttons: [{ label, kind, value, run }]
 *  - value : tıklanınca sözü bu değerle kapatır
 *  - run   : async fonksiyon; undefined dönerse kutu açık kalır
 * build(box, close) ile gövdeye alan eklenebilir.
 */
export function dialog({ title, text, build, buttons = [], dismissable = true }) {
  return new Promise((resolve) => {
    const host = $("#dialogs");
    const box = el("div", { class: "dialog", role: "dialog", "aria-modal": "true" });
    if (title) box.append(el("h3", {}, title));
    if (text) box.append(el("p", {}, text));

    let closed = false;
    const close = (value) => {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKey, true);
      host.classList.remove("on");
      clear(host);
      resolve(value);
    };

    const onKey = (event) => {
      if (event.key === "Escape" && dismissable) { event.stopPropagation(); close(null); }
    };

    if (build) build(box, close);

    if (buttons.length) {
      const row = el("div", { class: "row" });
      for (const button of buttons) {
        row.append(el("button", {
          class: `vbtn ${button.kind || ""}`,
          type: "button",
          onclick: async (event) => {
            const target = event.currentTarget;
            if (button.run) {
              target.disabled = true;
              try {
                const value = await button.run(box, close);
                if (value !== undefined) close(value);
              } finally { target.disabled = false; }
            } else {
              close(button.value);
            }
          }
        }, button.label));
      }
      box.append(row);
    }

    clear(host);
    host.append(box);
    host.classList.add("on");
    host.onclick = (event) => { if (event.target === host && dismissable) close(null); };
    document.addEventListener("keydown", onKey, true);

    const focusable = box.querySelector("input, select, button");
    if (focusable) setTimeout(() => focusable.focus(), 60);
  });
}

export function confirmBox(title, text, okLabel = "Evet", danger = false) {
  return dialog({
    title, text,
    buttons: [
      { label: "Vazgeç", value: false },
      { label: okLabel, kind: danger ? "danger" : "primary", value: true }
    ]
  }).then((value) => value === true);
}

export function promptBox(title, label, initial = "", placeholder = "") {
  let input;
  return dialog({
    title,
    build: (box, close) => {
      input = el("input", { type: "text", value: initial, placeholder, maxlength: 60 });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") { event.preventDefault(); close(input.value.trim() || null); }
      });
      box.append(el("label", { class: "f" }, el("span", {}, label), input));
    },
    buttons: [
      { label: "Vazgeç", value: null },
      { label: "Tamam", kind: "primary", run: () => input.value.trim() || null }
    ]
  });
}

/* ------------------------------------------------------------------ perde */

// Çekmece/örtü tek yerden yönetilsin: iki farklı modül aynı perdeyi açıp
// kapatınca hangisinin kapatacağı belirsizleşiyordu.
let scrimHandler = null;

export function showScrim(onClose) {
  const scrim = $("#scrim");
  scrimHandler = onClose;
  scrim.hidden = false;
  scrim.onclick = () => { if (scrimHandler) scrimHandler(); };
}

export function hideScrim() {
  const scrim = $("#scrim");
  scrimHandler = null;
  scrim.hidden = true;
  scrim.onclick = null;
}
