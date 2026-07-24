// Listeler görünümü.
//
// Listeler kategoriler altında toplanır. Varsayılan kategori bağlantıların
// geldiği sitedir (RedGifs, Reddit, …) — çünkü zaten arşivin doğal ayrımı bu.
// İsteyen listeyi kendi açtığı bir kategoriye taşır; o zaman site tahmini
// devre dışı kalır. Her liste ayrıca banner ve vurgu rengi taşır.
//
// Bilerek gösterilmeyen şey: eklenme tarihi. Sayı "x adet" olarak yazılır.

import {
  $, ICON, PALETTE, S, api, clear, dialog, el, hostOf, mediaURL, newId, promptBox, saveMeta, siteBrand, toast
} from "./core.js";

const SITE_HINTS = [
  [/redgifs\./i, "RedGifs"],
  [/reddit\.|redd\.it/i, "Reddit"],
  [/instagram\./i, "Instagram"],
  [/scrolller\./i, "Scrolller"],
  [/coomer\.|kemono\./i, "Coomer"]
];

function siteOfURL(url) {
  const host = hostOf(url);
  for (const [pattern, name] of SITE_HINTS) if (pattern.test(host)) return name;
  return "";
}

// Listenin sitesi: bağlantılarında en çok geçen site. Karışıksa "Diğer".
function siteOfList(list) {
  const tally = new Map();
  for (const item of list.items || []) {
    const site = siteOfURL(item.url);
    if (site) tally.set(site, (tally.get(site) || 0) + 1);
  }
  let best = "";
  let top = 0;
  for (const [site, count] of tally) if (count > top) { best = site; top = count; }
  return best || "Other";
}

function listMeta(id) {
  if (!S.meta.lists[id]) S.meta.lists[id] = {};
  return S.meta.lists[id];
}

function bannerCSS(entry, site) {
  const banner = entry.banner || "";
  if (banner.startsWith("grad:")) {
    const [a, b] = banner.slice(5).split(",");
    return `linear-gradient(135deg, ${a}, ${b})`;
  }
  if (banner.startsWith("media:")) return `url("${mediaURL(banner.slice(6))}")`;
  if (banner.startsWith("https://")) return `url("${banner}")`;
  return siteBrand(site).grad;
}

/* ------------------------------------------------------------ özelleştirme */

function swatchRow(colors, current, onPick) {
  const row = el("div", { class: "swatches" });
  for (const color of colors) {
    const button = el("button", {
      type: "button", class: `swatch${color === current ? " on" : ""}`,
      style: `background:${color}`, "aria-label": color,
      onclick: () => {
        row.querySelectorAll(".swatch").forEach((s) => s.classList.remove("on"));
        button.classList.add("on");
        onPick(color);
      }
    });
    row.append(button);
  }
  return row;
}

async function customize(list, refresh) {
  const entry = listMeta(list.id);
  const draft = { banner: entry.banner || "", accent: entry.accent || "", cat: entry.cat || "" };

  await dialog({
    title: list.name,
    text: "Banner, renk ve kategori bu listeye özeldir.",
    build: (box, close) => {
      // ---- banner: hazır gradyanlar
      const grads = [
        ["#fbbf24", "#ec4899"], ["#38bdf8", "#8b5cf6"], ["#34d399", "#0ea5e9"],
        ["#f4525f", "#f59e0b"], ["#a78bfa", "#ec4899"], ["#1f2937", "#4b5563"]
      ];
      const gradRow = el("div", { class: "swatches" });
      for (const [a, b] of grads) {
        const value = `grad:${a},${b}`;
        const button = el("button", {
          type: "button", class: `swatch${draft.banner === value ? " on" : ""}`,
          style: `background:linear-gradient(135deg,${a},${b})`,
          onclick: () => {
            gradRow.querySelectorAll(".swatch").forEach((s) => s.classList.remove("on"));
            button.classList.add("on");
            draft.banner = value;
          }
        });
        gradRow.append(button);
      }
      box.append(el("label", { class: "f" }, el("span", {}, "Banner"), gradRow));

      // ---- banner: arşivdeki bir görselden
      const images = S.media.filter((m) => m.kind === "image").slice(0, 60);
      if (images.length) {
        const picker = el("div", { class: "picker" });
        for (const item of images) {
          const value = `media:${item.key}`;
          const button = el("button", {
            type: "button", class: draft.banner === value ? "on" : "",
            onclick: () => {
              picker.querySelectorAll("button").forEach((b) => b.classList.remove("on"));
              gradRow.querySelectorAll(".swatch").forEach((s) => s.classList.remove("on"));
              button.classList.add("on");
              draft.banner = value;
            }
          }, el("img", { src: mediaURL(item.key), loading: "lazy", alt: "" }));
          picker.append(button);
        }
        box.append(el("label", { class: "f" }, el("span", {}, "veya arşivden bir görsel"), picker));
      }

      // ---- vurgu rengi
      box.append(el("label", { class: "f" }, el("span", {}, "Vurgu rengi"),
        swatchRow(PALETTE, draft.accent, (color) => { draft.accent = color; })));

      // ---- kategori
      const select = el("select");
      select.append(el("option", { value: "" }, "Otomatik (site)"));
      for (const cat of S.meta.listCats) {
        select.append(el("option", { value: cat.id, selected: cat.id === draft.cat }, cat.name));
      }
      select.append(el("option", { value: "__new" }, "+ Yeni kategori…"));
      select.value = draft.cat || "";
      select.addEventListener("change", async () => {
        if (select.value !== "__new") { draft.cat = select.value; return; }
        select.value = draft.cat || "";
        const name = await promptBox("Yeni liste kategorisi", "Kategori adı", "", "ör. Favoriler");
        if (!name) return;
        const cat = { id: newId("lc"), name, color: PALETTE[S.meta.listCats.length % PALETTE.length] };
        S.meta.listCats.push(cat);
        draft.cat = cat.id;
        select.append(el("option", { value: cat.id, selected: true }, cat.name));
        select.value = cat.id;
      });
      box.append(el("label", { class: "f" }, el("span", {}, "Kategori"), select));

      box.append(el("button", {
        class: "vbtn", type: "button", style: "width:100%;justify-content:center",
        onclick: () => {
          delete entry.banner; delete entry.accent; delete entry.cat;
          saveMeta(); refresh(); close(null);
        }
      }, "Varsayılana döndür"));
    },
    buttons: [
      { label: "Vazgeç", value: null },
      {
        label: "Kaydet", kind: "primary",
        run: () => {
          if (draft.banner) entry.banner = draft.banner; else delete entry.banner;
          if (draft.accent) entry.accent = draft.accent; else delete entry.accent;
          if (draft.cat) entry.cat = draft.cat; else delete entry.cat;
          saveMeta();
          refresh();
          return null;
        }
      }
    ]
  });
}

/* --------------------------------------------------------------- kart çizimi */

function card(list) {
  const entry = listMeta(list.id);
  const site = siteOfList(list);
  const accent = entry.accent || siteBrand(site).glow;
  const items = list.items || [];

  const node = el("div", { class: `list-card${entry.collapsed ? " collapsed" : ""}` });

  const banner = el("div", { class: "list-banner", style: `--banner:${bannerCSS(entry, site)}` });
  banner.append(el("button", {
    class: "list-edit", type: "button", "aria-label": "Listeyi özelleştir",
    html: ICON.pencil,
    onclick: (event) => { event.stopPropagation(); customize(list, render); }
  }));
  node.append(banner);

  const toggle = el("button", {
    class: "list-toggle", type: "button", "aria-label": "Daralt / genişlet",
    html: ICON.chevronDown,
    onclick: () => {
      const collapsed = node.classList.toggle("collapsed");
      if (collapsed) entry.collapsed = true; else delete entry.collapsed;
      saveMeta();
    }
  });

  node.append(el("div", { class: "list-head" },
    el("h3", { title: list.name }, list.name),
    el("span", { class: "list-count" }, `${items.length} adet`),
    toggle
  ));

  const body = el("div", {});
  if (!items.length) {
    body.append(el("div", { class: "list-empty" }, "Bu listede henüz bağlantı yok."));
  } else {
    for (const item of items.slice(0, 400)) {
      body.append(el("a", {
        class: "list-link", href: item.url, target: "_blank", rel: "noreferrer noopener",
        title: item.title || item.url
      },
        el("span", { class: "dot", style: `background:${accent}` }),
        el("span", { class: "title" }, item.title || item.url),
        el("span", { class: "host" }, hostOf(item.url))
      ));
    }
  }
  node.append(el("div", { class: "list-body" }, body));
  return node;
}

/* ------------------------------------------------------------------ çizim */

function matches(list, query) {
  if (!query) return true;
  const needle = query.toLocaleLowerCase("tr");
  if (list.name.toLocaleLowerCase("tr").includes(needle)) return true;
  return (list.items || []).some((item) =>
    (item.title || "").toLocaleLowerCase("tr").includes(needle) ||
    (item.url || "").toLowerCase().includes(needle));
}

export function render() {
  const root = $("#lists-root");
  if (!root) return;
  clear(root);

  const visible = S.lists.filter((list) => matches(list, S.listQuery));
  if (!visible.length) {
    root.append(el("div", { class: "empty" },
      el("b", {}, S.lists.length ? "Eşleşen liste yok" : "Henüz liste yok"),
      S.lists.length ? "Aramayı değiştirmeyi dene." : "Telefondan bir bağlantı kaydettiğinde burada belirir."));
    return;
  }

  // Gruplama: özel kategori varsa o, yoksa bağlantıların sitesi.
  const groups = new Map();
  for (const list of visible) {
    const entry = listMeta(list.id);
    const custom = entry.cat && S.meta.listCats.find((c) => c.id === entry.cat);
    const key = custom ? `c:${custom.id}` : `s:${siteOfList(list)}`;
    if (!groups.has(key)) {
      const site = custom ? null : siteOfList(list);
      groups.set(key, {
        name: custom ? custom.name : (site === "Other" ? "Diğer" : site),
        color: custom ? custom.color : siteBrand(site).glow,
        lists: []
      });
    }
    groups.get(key).lists.push(list);
  }

  const ordered = [...groups.entries()].sort((a, b) => {
    if (a[0].startsWith("c:") !== b[0].startsWith("c:")) return a[0].startsWith("c:") ? -1 : 1;
    return b[1].lists.length - a[1].lists.length;
  });

  for (const [, group] of ordered) {
    const section = el("section", {});
    section.append(el("div", { class: "list-cat-head" },
      el("span", { class: "cat-swatch", style: `background:${group.color}` }),
      el("h2", {}, group.name),
      el("span", { class: "rule" }),
      el("span", { class: "badge" }, `${group.lists.length} liste`)
    ));
    const grid = el("div", { class: "list-grid" });
    for (const list of group.lists) grid.append(card(list));
    section.append(grid);
    root.append(section);
  }
}

/* ------------------------------------------------------------------ veri */

export async function load() {
  try {
    const payload = await api.get("/api/lists");
    const lists = Array.isArray(payload && payload.lists) ? payload.lists : [];
    S.lists = lists
      .filter((list) => list && typeof list.id === "string")
      .sort((a, b) => (b.items || []).length - (a.items || []).length);
  } catch (error) {
    // 404 = hiç senkron yapılmamış; hata değil, boş durum.
    if (error.status !== 404) toast(`Listeler alınamadı: ${error.message}`, "err");
    S.lists = [];
  }
  render();
  const badge = $("#chooser-lists");
  if (badge) badge.textContent = `${S.lists.length} liste`;
}

export function wire() {
  const search = $("#lists-search");
  search.addEventListener("input", () => { S.listQuery = search.value.trim(); render(); });

  $("#lists-collapse").addEventListener("click", (event) => {
    const anyOpen = S.lists.some((list) => !listMeta(list.id).collapsed);
    for (const list of S.lists) {
      const entry = listMeta(list.id);
      if (anyOpen) entry.collapsed = true; else delete entry.collapsed;
    }
    event.currentTarget.textContent = anyOpen ? "Hepsini aç" : "Hepsini kapat";
    saveMeta();
    render();
  });
}
