// Cloudflare Worker girişi.
//
// Üç iş yapar:
//  1) /auth/* — Google girişi (auth.js). Site yalnız izinli e-postaya açılır.
//  2) /api/*  — veri uçları. İki kabul yolu: (a) geçerli oturum çerezi (web
//     kullanıcısı Google ile girmiştir) VEYA (b) Bearer ARCHIVE_TOKEN
//     (telefon uygulaması). Böylece uygulama hiç değişmeden çalışır.
//  3) diğer   — statik dosyalar (public/). Oturum yoksa Google giriş sayfası.
//
// İş mantığı functions/api/*.js içinde, Pages Functions imzasıyla durur; bu
// dosya onların üstünde ince bir yönlendirici.
import { json } from "../functions/api/_utils.js";
import * as health from "../functions/api/health.js";
import * as lists from "../functions/api/lists.js";
import * as config from "../functions/api/config.js";
import { finishLogin, loginPage, logout, readSession, startLogin } from "./auth.js";

const ROUTES = {
  "/api/health": health,
  "/api/lists": lists,
  "/api/config": config
};

// "GET" -> "onRequestGet"
function handlerName(method) {
  return "onRequest" + method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();
}

function allowedMethods(route) {
  return Object.keys(route)
    .filter((key) => key.startsWith("onRequest") && key !== "onRequest")
    .map((key) => key.slice("onRequest".length).toUpperCase())
    .sort();
}

// Bearer ARCHIVE_TOKEN (uygulama). Sabit zamanlı.
function bearerOk(request, env) {
  const expected = env.ARCHIVE_TOKEN || "";
  if (!expected) return false;
  const header = request.headers.get("Authorization") || "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (presented.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

async function authorized(request, env) {
  if (await readSession(request, env)) return true; // web: Google oturumu
  return bearerOk(request, env);                     // uygulama: Bearer token
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;

    // 1) Kimlik uçları — her zaman açık.
    if (path === "/auth/login") return startLogin(request, env);
    if (path === "/auth/callback") return finishLogin(request, env);
    if (path === "/auth/logout") return logout();

    // 2) API — oturum çerezi ya da Bearer token gerekir.
    const route = ROUTES[path];
    if (route) {
      if (!(await authorized(request, env))) {
        return json({ ok: false, error: "yetkisiz" }, 401);
      }
      const handler = route[handlerName(request.method)] || route.onRequest;
      if (!handler) {
        return json({ ok: false, error: "yöntem desteklenmiyor" }, 405,
          { Allow: allowedMethods(route).join(", ") });
      }
      return handler({
        request, env, params: {}, data: {},
        waitUntil: (p) => ctx.waitUntil(p),
        next: () => env.ASSETS.fetch(request)
      });
    }

    if (path.startsWith("/api/")) return json({ ok: false, error: "bilinmeyen uç" }, 404);

    // 3) Statik — yalnız giriş yapmış kullanıcıya. Yoksa Google giriş sayfası.
    if (await readSession(request, env)) return env.ASSETS.fetch(request);
    return loginPage();
  }
};
