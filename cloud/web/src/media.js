// R2 medya uçları — telefonun "bulutu" artık Cloudflare R2 (env.MEDIA binding).
//
// Eski PC medya sunucusunun (cloud/server/server.js) sözleşmesini birebir taşır,
// böylece uygulama ve web istemcisi neredeyse değişmez:
//   GET    /api/media           → [{ name, size, mtime, kind }]
//   GET    /api/media/<ad>      → dosyayı akıtır (Range destekli, video seek)
//   HEAD   /api/media/<ad>      → yalnız başlıklar
//   PUT    /api/media/<ad>      → yükler, çakışmayı kendisi çözer, { ok, name }
//   DELETE /api/media/<ad>      → siler
//
// Yetki: (a) Google oturum çerezi (web), (b) Bearer ARCHIVE_TOKEN (uygulama),
// ya da (c) ?token= sorgu parametresi. (c) şart, çünkü AVPlayer/AsyncImage ve
// <video>/<img> Authorization başlığı gönderemez ama sorgu taşıyabilir.
import { json } from "../functions/api/_utils.js";
import { readSession } from "./auth.js";

const MIME = {
  ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif",
  ".webp": "image/webp", ".heic": "image/heic", ".avif": "image/avif"
};

function extOf(name) {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function extType(name) {
  return MIME[extOf(name)] || "application/octet-stream";
}

function kindOf(name) {
  const type = MIME[extOf(name)] || "";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("image/")) return "image";
  return "other";
}

// Tek dosya adı segmenti: yol ayracı, "..", gizli/kontrol karakteri reddedilir.
// R2 anahtarları "/" içerebilir; buna izin vermeyerek uygulamanın hep tek
// segment yazdığı sözleşmeyi ve yol oyunlarına kapalılığı koruruz.
function safeName(raw) {
  let name;
  try {
    name = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (!name || name.length > 180) return null;
  if (name.includes("/") || name.includes("\\") || name.includes("..")) return null;
  // eslint-disable-next-line no-control-regex
  if (name.startsWith(".") || /[\x00-\x1f<>:"|?*]/.test(name)) return null;
  return name;
}

// Ad çakışmasında sessizce ezmek veri kaybıdır; -1, -2 eklenir.
async function freeKey(env, name) {
  if (!(await env.MEDIA.head(name))) return name;
  const ext = extOf(name);
  const stem = ext ? name.slice(0, name.length - ext.length) : name;
  for (let i = 1; i < 1000; i += 1) {
    const candidate = `${stem}-${i}${ext}`;
    if (!(await env.MEDIA.head(candidate))) return candidate;
  }
  return `${stem}-${Date.now()}${ext}`;
}

// Bearer başlığı ya da ?token= — sabit zamanlı karşılaştırma.
function tokenOk(request, url, env) {
  const expected = env.ARCHIVE_TOKEN || "";
  if (!expected) return false;
  const header = request.headers.get("Authorization") || "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : (url.searchParams.get("token") || "");
  if (presented.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

async function authorized(request, url, env) {
  if (await readSession(request, env)) return true; // web: Google oturumu
  return tokenOk(request, url, env);                 // uygulama / akış: token
}

async function listAll(env) {
  const objects = [];
  let cursor;
  for (;;) {
    const page = await env.MEDIA.list({ cursor, limit: 1000 });
    objects.push(...page.objects);
    if (!page.truncated) break;
    cursor = page.cursor;
  }
  return objects;
}

function listMedia(objects) {
  return objects
    .map((o) => ({ name: o.key, size: o.size, mtime: o.uploaded.getTime(), kind: kindOf(o.key) }))
    .sort((a, b) => b.mtime - a.mtime);
}

// "bytes=..." başlığını R2 range seçeneğine çevirir.
function parseRange(header) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header || "");
  if (!m || (!m[1] && !m[2])) return null;
  if (m[1] === "") return { suffix: Number(m[2]) };            // bytes=-N (son N)
  const offset = Number(m[1]);
  if (m[2] === "") return { offset };                          // bytes=N-
  return { offset, length: Number(m[2]) - offset + 1 };        // bytes=N-M
}

async function streamMedia(env, name, request, method) {
  if (method === "HEAD") {
    const head = await env.MEDIA.head(name);
    if (!head) return json({ ok: false, error: "yok" }, 404);
    const headers = new Headers();
    head.writeHttpMetadata(headers);
    if (!headers.get("Content-Type")) headers.set("Content-Type", extType(name));
    headers.set("Content-Length", String(head.size));
    headers.set("Accept-Ranges", "bytes");
    return new Response(null, { status: 200, headers });
  }

  const range = parseRange(request.headers.get("Range"));
  const object = await env.MEDIA.get(name, range ? { range } : undefined);
  if (!object) return json({ ok: false, error: "yok" }, 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  if (!headers.get("Content-Type")) headers.set("Content-Type", extType(name));
  headers.set("Accept-Ranges", "bytes");

  const total = object.size;
  if (range && object.range) {
    let offset = object.range.offset;
    let length = object.range.length;
    if (offset === undefined && object.range.suffix !== undefined) {
      length = object.range.suffix;
      offset = total - length;
    }
    if (offset === undefined) offset = 0;
    if (length === undefined) length = total - offset;
    if (offset >= total) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
    }
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${total}`);
    headers.set("Content-Length", String(length));
    return new Response(object.body, { status: 206, headers });
  }

  headers.set("Content-Length", String(total));
  return new Response(object.body, { status: 200, headers });
}

// worker.js buraya /api/media ve /api/media/<ad> yollarını yönlendirir.
export async function handleMedia(request, env, url) {
  if (!(await authorized(request, url, env))) {
    return json({ ok: false, error: "yetkisiz" }, 401);
  }
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  const method = request.method;

  // Koleksiyon: liste.
  if (path === "/api/media") {
    if (method === "GET") return json(listMedia(await listAll(env)));
    return json({ ok: false, error: "yöntem desteklenmiyor" }, 405, { Allow: "GET" });
  }

  // Tekil dosya.
  const name = safeName(path.slice("/api/media/".length));
  if (!name) return json({ ok: false, error: "geçersiz dosya adı" }, 400);

  if (method === "GET" || method === "HEAD") return streamMedia(env, name, request, method);
  if (method === "PUT") {
    const finalName = await freeKey(env, name);
    await env.MEDIA.put(finalName, request.body, { httpMetadata: { contentType: extType(finalName) } });
    return json({ ok: true, name: finalName }, 201);
  }
  if (method === "DELETE") {
    await env.MEDIA.delete(name);
    return json({ ok: true });
  }
  return json({ ok: false, error: "yöntem desteklenmiyor" }, 405, { Allow: "GET, PUT, DELETE" });
}
