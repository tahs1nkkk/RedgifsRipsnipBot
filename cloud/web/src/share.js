// Tek açmalık public paylaşım linkleri.
//
//   POST   /api/share            → { keys | cat, maxOpens, ttlHours, label } → { token, url }
//   GET    /api/share            → mevcut linkler (kalan açılış, bitiş)
//   DELETE /api/share/<token>    → iptal
//   GET    /s/<token>            → herkese açık sayfa (bir "açılış" sayar)
//   GET    /s/<token>/f/<sıra>   → o sayfanın dosyasını akıtır (açılış saymaz)
//
// Token 32 rastgele bayt (256 bit) — tahmin edilemez, o yüzden linkin kendisi
// yetkidir. Varsayılan: 1 açılış, 24 saat. Süre ya da adet dolduğunda dosya ucu
// da kapanır, yani link "sızmış" olsa bile ölü olur.
//
// Sayaç Supabase'te bir belgede tutulur (docs.js). Oku-değiştir-yaz yarışı
// teorik olarak iki eşzamanlı açılışı tek sayabilir; tek kişilik bir arşivde
// bunun bedeli sıfır, alternatifi (Durable Object) ise fazladan altyapı.
import { json } from "../functions/api/_utils.js";
import { readDoc, writeDoc } from "./docs.js";
import { parseKey, kindOf } from "./keys.js";
import { streamMedia } from "./media.js";

const DOC_ID = "shares";
const MAX_SHARES = 300;
const MAX_KEYS = 500;

function b64url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function newToken() {
  return b64url(crypto.getRandomValues(new Uint8Array(24)));
}

async function loadShares(env) {
  const doc = await readDoc(env, DOC_ID, { shares: [] });
  return Array.isArray(doc.shares) ? doc.shares : [];
}

// Ölü kayıtları yazarken temizleriz; belge kendiliğinden küçük kalır.
function alive(share, now) {
  if (share.expiresAt && share.expiresAt < now) return false;
  if (share.maxOpens && share.opens > share.maxOpens) return false;
  return true;
}

async function saveShares(env, shares) {
  const now = Date.now();
  const kept = shares.filter((s) => alive(s, now)).slice(-MAX_SHARES);
  await writeDoc(env, DOC_ID, { shares: kept });
  return kept;
}

/* ------------------------------------------------------------------ yönetim */

export async function handleShareApi(request, env, url) {
  const path = url.pathname.replace(/\/+$/, "");

  if (path === "/api/share" && request.method === "GET") {
    const now = Date.now();
    const shares = (await loadShares(env)).filter((s) => alive(s, now));
    return json(shares.map((s) => ({
      token: s.token, label: s.label, count: s.keys.length,
      opens: s.opens, maxOpens: s.maxOpens, expiresAt: s.expiresAt, createdAt: s.createdAt
    })));
  }

  if (path === "/api/share" && request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "gövde JSON değil" }, 400);
    }
    const keys = Array.isArray(body.keys)
      ? [...new Set(body.keys.filter((k) => typeof k === "string" && parseKey(k)))].slice(0, MAX_KEYS)
      : [];
    if (!keys.length) return json({ ok: false, error: "paylaşılacak dosya yok" }, 400);

    const maxOpens = Number.isFinite(body.maxOpens) ? Math.max(0, Math.min(1000, Math.floor(body.maxOpens))) : 1;
    const ttlHours = Number.isFinite(body.ttlHours) ? Math.max(0, Math.min(24 * 365, body.ttlHours)) : 24;
    const share = {
      token: newToken(),
      label: typeof body.label === "string" ? body.label.slice(0, 80) : "",
      keys,
      maxOpens,                                     // 0 = sınırsız
      opens: 0,
      expiresAt: ttlHours ? Date.now() + ttlHours * 3600_000 : 0, // 0 = süresiz
      createdAt: Date.now()
    };
    const shares = await loadShares(env);
    shares.push(share);
    await saveShares(env, shares);
    return json({ ok: true, token: share.token, url: `${url.origin}/s/${share.token}` }, 201);
  }

  if (path.startsWith("/api/share/") && request.method === "DELETE") {
    const token = decodeURIComponent(path.slice("/api/share/".length));
    const shares = (await loadShares(env)).filter((s) => s.token !== token);
    await saveShares(env, shares);
    return json({ ok: true });
  }

  return json({ ok: false, error: "yöntem desteklenmiyor" }, 405, { Allow: "GET, POST, DELETE" });
}

/* -------------------------------------------------------------- public sayfa */

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function page(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      // Paylaşım sayfası indekslenmemeli; link zaten tek kişilik.
      "X-Robots-Tag": "noindex, nofollow"
    }
  });
}

const SHARE_CSS = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; background:#08070a; color:#f5f1ea; padding:22px 16px 60px;
    font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif; }
  body::before { content:""; position:fixed; inset:0; pointer-events:none; z-index:-1;
    background:radial-gradient(70% 55% at 15% 0%, #7c3aed33, transparent 60%),
               radial-gradient(60% 50% at 90% 10%, #f59e0b26, transparent 60%); }
  header { max-width:1100px; margin:0 auto 22px; display:flex; align-items:center; gap:12px; }
  .mark { width:34px; height:34px; border-radius:11px; display:grid; place-items:center; font-weight:800;
    background:linear-gradient(135deg,#f59e0b,#ec4899); color:#1a1206; }
  h1 { font-size:17px; margin:0; font-weight:700; letter-spacing:-.01em; }
  .sub { font-size:12px; color:#9a93a8; margin-top:2px; }
  .grid { max-width:1100px; margin:0 auto; display:grid; gap:14px;
    grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); }
  figure { margin:0; border-radius:16px; overflow:hidden; background:#131118;
    border:1px solid #241f2e; }
  figure img, figure video { display:block; width:100%; height:auto; background:#000; }
  figcaption { padding:9px 12px; font-size:12px; color:#a49dae; overflow:hidden;
    text-overflow:ellipsis; white-space:nowrap; }
  .center { max-width:420px; margin:14vh auto 0; text-align:center;
    background:#131118; border:1px solid #241f2e; border-radius:20px; padding:36px 28px; }
  .center h2 { margin:0 0 8px; font-size:20px; }
  .center p { margin:0; color:#9a93a8; font-size:14px; }
`;

function deadPage(title, detail) {
  return page(`<!doctype html><html lang="tr"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)}</title>
    <style>${SHARE_CSS}</style></head><body>
    <div class="center"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(detail)}</p></div>
    </body></html>`, 410);
}

export async function handleSharePublic(request, env, url) {
  const rest = url.pathname.slice("/s/".length).replace(/\/+$/, "");
  const [rawToken, section, rawIndex] = rest.split("/");
  const token = decodeURIComponent(rawToken || "");
  if (!token) return deadPage("Link geçersiz", "Bağlantı eksik görünüyor.");

  const shares = await loadShares(env);
  const share = shares.find((s) => s.token === token);
  if (!share) return deadPage("Link bulunamadı", "Bu paylaşım iptal edilmiş ya da hiç var olmamış.");

  const now = Date.now();
  if (share.expiresAt && share.expiresAt < now) {
    return deadPage("Süresi doldu", "Bu paylaşım linkinin geçerlilik süresi bitmiş.");
  }

  // Dosya ucu: sayfayı açan ziyaretçi görselleri çekebilsin diye açılış saymaz,
  // ama adet dolduysa o da kapanır.
  if (section === "f") {
    if (share.maxOpens && share.opens > share.maxOpens) {
      return json({ ok: false, error: "link tükendi" }, 410);
    }
    const index = Number(rawIndex);
    const key = Number.isInteger(index) ? share.keys[index] : null;
    if (!key) return json({ ok: false, error: "yok" }, 404);
    return streamMedia(env, key, request, request.method === "HEAD" ? "HEAD" : "GET");
  }

  if (section) return deadPage("Link geçersiz", "Beklenmeyen adres.");

  // Sayfa açılışı: sayacı burada artırırız.
  share.opens += 1;
  await saveShares(env, shares);
  if (share.maxOpens && share.opens > share.maxOpens) {
    return deadPage("Link tükendi", "Bu paylaşım için izin verilen açılış sayısı dolmuş.");
  }

  const cards = share.keys.map((key, index) => {
    const parts = parseKey(key);
    const name = parts ? parts.file : key;
    const src = `/s/${encodeURIComponent(token)}/f/${index}`;
    const media = kindOf(name) === "video"
      ? `<video src="${src}" controls playsinline preload="metadata"></video>`
      : `<img src="${src}" alt="" loading="lazy">`;
    return `<figure>${media}<figcaption>${escapeHtml(name)}</figcaption></figure>`;
  }).join("");

  const remaining = share.maxOpens ? `${share.maxOpens - share.opens} açılış kaldı` : "sınırsız açılış";
  const until = share.expiresAt
    ? new Date(share.expiresAt).toLocaleString("tr-TR")
    : "süresiz";

  return page(`<!doctype html><html lang="tr"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex,nofollow">
    <title>${escapeHtml(share.label || "Paylaşım")} — Tasu Archive</title>
    <style>${SHARE_CSS}</style></head><body>
    <header>
      <div class="mark">T</div>
      <div>
        <h1>${escapeHtml(share.label || "Paylaşılan medya")}</h1>
        <div class="sub">${share.keys.length} dosya · ${escapeHtml(remaining)} · ${escapeHtml(until)}</div>
      </div>
    </header>
    <div class="grid">${cards}</div>
    </body></html>`);
}
