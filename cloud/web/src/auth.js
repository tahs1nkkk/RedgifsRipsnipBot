// Google girişi + imzalı oturum çerezi.
//
// Neden Worker'ın içinde: kullanıcının kendi domaini yok, site *.workers.dev
// üzerinde. Cloudflare Access bir zone (domain) ister, workers.dev'e
// uygulanamaz — bu yüzden Google OAuth'u burada, elle kuruyoruz.
//
// Akış (Authorization Code):
//   /auth/login    -> Google'a 302 (state çerezi CSRF için)
//   /auth/callback -> code'u id_token'a çevir, e-postayı doğrula, oturum çerezi ver
//   /auth/logout   -> çerezi sil
//
// Oturum çerezi: base64url(payload).base64url(HMAC-SHA256). Sunucu tarafında
// SESSION_SECRET ile imzalanır; istemci içeriği göremez/değiştiremez.

const SESSION_COOKIE = "tasu_session";
const STATE_COOKIE = "tasu_oauth_state";
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 gün

/* --------------------------------------------------------------- base64url */

function b64urlEncode(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str) {
  const pad = str.length % 4 ? "=".repeat(4 - (str.length % 4)) : "";
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function utf8(str) {
  return new TextEncoder().encode(str);
}

/* ------------------------------------------------------------------- HMAC */

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw", utf8(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
}

async function sign(secret, data) {
  const key = await hmacKey(secret);
  const mac = await crypto.subtle.sign("HMAC", key, utf8(data));
  return b64urlEncode(new Uint8Array(mac));
}

// Sabit zamanlı string karşılaştırması (zamanlama sızıntısını kapatır).
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ---------------------------------------------------------------- çerezler */

function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";
  const jar = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    jar[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return jar;
}

function cookie(name, value, maxAge) {
  const bits = [`${name}=${value}`, "Path=/", "HttpOnly", "Secure", "SameSite=Lax"];
  bits.push(maxAge === 0 ? "Max-Age=0" : `Max-Age=${maxAge}`);
  return bits.join("; ");
}

/* ------------------------------------------------------------ oturum çerezi */

async function makeSession(env, email) {
  const payload = { email, exp: Math.floor(Date.now() / 1000) + SESSION_TTL };
  const data = b64urlEncode(utf8(JSON.stringify(payload)));
  const mac = await sign(env.SESSION_SECRET, data);
  return `${data}.${mac}`;
}

// Geçerliyse {email} döner, değilse null. worker.js her /api/* isteğinde çağırır.
export async function readSession(request, env) {
  if (!env.SESSION_SECRET) return null;
  const raw = parseCookies(request)[SESSION_COOKIE];
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 0) return null;
  const data = raw.slice(0, dot);
  const mac = raw.slice(dot + 1);
  const expected = await sign(env.SESSION_SECRET, data);
  if (!safeEqual(mac, expected)) return null;
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(b64urlDecode(data))); } catch { return null; }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return { email: payload.email };
}

/* --------------------------------------------------------- izinli e-posta */

function allowedEmails(env) {
  return (env.ALLOWED_EMAIL || "")
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/* --------------------------------------------------------------- OAuth uçları */

function redirectURI(request) {
  return `${new URL(request.url).origin}/auth/callback`;
}

export function startLogin(request, env) {
  if (!env.GOOGLE_CLIENT_ID) {
    return htmlResponse(errorPage("Google girişi ayarlı değil",
      "GOOGLE_CLIENT_ID ortam değişkeni eksik. cloud/README.md'deki kuruluma bak."), 500);
  }
  const state = b64urlEncode(crypto.getRandomValues(new Uint8Array(24)));
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectURI(request),
    response_type: "code",
    scope: "openid email",
    state,
    prompt: "select_account",
    access_type: "online"
  });
  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      "Set-Cookie": cookie(STATE_COOKIE, state, 600) // 10 dk
    }
  });
}

export async function finishLogin(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = parseCookies(request)[STATE_COOKIE];

  if (url.searchParams.get("error")) {
    return htmlResponse(errorPage("Giriş iptal edildi", "Google giriş penceresi kapatıldı."), 400);
  }
  if (!code || !state || !savedState || !safeEqual(state, savedState)) {
    return htmlResponse(errorPage("Geçersiz istek", "Oturum durumu eşleşmedi. Tekrar dene."), 400);
  }

  // code -> token (id_token). client_secret ile, doğrudan Google'dan.
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectURI(request),
      grant_type: "authorization_code"
    })
  });
  if (!tokenRes.ok) {
    return htmlResponse(errorPage("Google reddetti", `Token alınamadı (HTTP ${tokenRes.status}).`), 502);
  }
  const tokens = await tokenRes.json();
  const claims = decodeIdToken(tokens.id_token);
  if (!claims) {
    return htmlResponse(errorPage("Kimlik doğrulanamadı", "id_token okunamadı."), 502);
  }

  // Token doğrudan Google'dan (HTTPS + client_secret) geldiği için imza yeniden
  // doğrulaması gerekmez; audience ve issuer'ı yine de kontrol ederiz.
  const issuerOk = claims.iss === "accounts.google.com" || claims.iss === "https://accounts.google.com";
  if (!issuerOk || claims.aud !== env.GOOGLE_CLIENT_ID) {
    return htmlResponse(errorPage("Kimlik doğrulanamadı", "Beklenmeyen issuer/audience."), 403);
  }

  const email = (claims.email || "").toLowerCase();
  const allowed = allowedEmails(env);
  if (!claims.email_verified || !allowed.includes(email)) {
    return htmlResponse(errorPage("Bu hesap yetkili değil",
      `${email || "hesap"} bu arşive erişemez. Yalnızca izin verilen adres girebilir.`), 403);
  }

  const session = await makeSession(env, email);
  const headers = new Headers({ Location: "/" });
  headers.append("Set-Cookie", cookie(SESSION_COOKIE, session, SESSION_TTL));
  headers.append("Set-Cookie", cookie(STATE_COOKIE, "", 0)); // state'i temizle
  return new Response(null, { status: 302, headers });
}

export function logout() {
  return new Response(null, {
    status: 302,
    headers: { Location: "/", "Set-Cookie": cookie(SESSION_COOKIE, "", 0) }
  });
}

function decodeIdToken(idToken) {
  if (!idToken || typeof idToken !== "string") return null;
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  try { return JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1]))); } catch { return null; }
}

/* -------------------------------------------------------------- giriş sayfası */

function htmlResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
  });
}

const PAGE_CSS = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
    font: 16px/1.5 system-ui, -apple-system, Segoe UI, sans-serif;
    background: #0d0c0a; color: #f4efe6; padding: 24px; }
  .box { width: 100%; max-width: 380px; text-align: center;
    background: #17150f; border: 1px solid #2a271d; border-radius: 18px; padding: 40px 32px; }
  h1 { font: 600 15px/1 system-ui; letter-spacing: .14em; text-transform: uppercase;
    color: #e8a33d; margin: 0 0 4px; }
  .brand { font: 400 30px/1.1 Georgia, "Times New Roman", serif; margin: 0 0 22px; }
  p { color: #a49c88; margin: 0 0 26px; font-size: 14px; }
  .gbtn { display: inline-flex; align-items: center; gap: 12px; width: 100%;
    justify-content: center; padding: 13px 20px; border-radius: 12px; cursor: pointer;
    background: #fff; color: #1f1f1f; font: 600 15px system-ui; text-decoration: none;
    border: none; transition: filter .15s; }
  .gbtn:hover { filter: brightness(.94); }
  .gbtn svg { width: 19px; height: 19px; }
  .err { color: #f0a4a4; }
  .muted { font-size: 12px; color: #6f6857; margin-top: 22px; }
`;

const GOOGLE_G = `<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.2 13.2 17.6 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.1 5.4-4.6 7l7.1 5.5c4.2-3.9 6.6-9.6 6.6-16.4.6z"/><path fill="#FBBC05" d="M10.4 28.3c-.5-1.4-.8-2.9-.8-4.3s.3-3 .8-4.3l-7.8-6.1C1 16.6 0 20.2 0 24s1 7.4 2.6 10.4l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.2 0 11.5-2 15.3-5.5l-7.1-5.5c-2 1.4-4.6 2.2-8.2 2.2-6.4 0-11.8-3.7-13.6-8.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/></svg>`;

export function loginPage() {
  return htmlResponse(`<!doctype html><html lang="tr"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,nofollow"><title>Tasu Arşiv — Giriş</title>
    <style>${PAGE_CSS}</style></head><body>
    <div class="box">
      <h1>kişisel</h1>
      <p class="brand">Tasu Arşiv</p>
      <p>Bu arşiv yalnızca sahibine açık. Google hesabınla giriş yap.</p>
      <a class="gbtn" href="/auth/login">${GOOGLE_G}<span>Google ile giriş yap</span></a>
    </div></body></html>`);
}

function errorPage(title, detail) {
  return `<!doctype html><html lang="tr"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title><style>${PAGE_CSS}</style></head><body>
    <div class="box">
      <h1>hata</h1>
      <p class="brand">${title}</p>
      <p class="err">${detail}</p>
      <a class="gbtn" href="/auth/login">${GOOGLE_G}<span>Tekrar dene</span></a>
    </div></body></html>`;
}
