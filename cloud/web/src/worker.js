// Cloudflare Worker girişi.
//
// İş mantığı functions/api/*.js içinde durur (Pages Functions imzasıyla:
// onRequestGet/onRequestPut...). Bu dosya yalnız yönlendirir, böylece aynı
// kod hem Worker hem Pages olarak konuşlandırılabiliyor.
//
// Statik dosyalar (public/) Worker'dan önce sunulur; buraya yalnız eşleşmeyen
// yollar düşer.
import { json } from "../functions/api/_utils.js";
import * as health from "../functions/api/health.js";
import * as lists from "../functions/api/lists.js";

const ROUTES = {
  "/api/health": health,
  "/api/lists": lists
};

// "GET" -> "onRequestGet", "PUT" -> "onRequestPut"
function handlerName(method) {
  return "onRequest" + method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();
}

function allowedMethods(route) {
  return Object.keys(route)
    .filter((key) => key.startsWith("onRequest") && key !== "onRequest")
    .map((key) => key.slice("onRequest".length).toUpperCase())
    .sort();
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Sondaki eğik çizgi yolu değiştirmesin: /api/lists/ === /api/lists
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
    const route = ROUTES[path];

    if (!route) {
      if (path.startsWith("/api/")) return json({ ok: false, error: "bilinmeyen uç" }, 404);
      return env.ASSETS.fetch(request);
    }

    const handler = route[handlerName(request.method)] || route.onRequest;
    if (!handler) {
      const allow = allowedMethods(route);
      return json({ ok: false, error: "yöntem desteklenmiyor" }, 405, { Allow: allow.join(", ") });
    }

    return handler({
      request,
      env,
      params: {},
      data: {},
      waitUntil: (promise) => ctx.waitUntil(promise),
      next: () => env.ASSETS.fetch(request)
    });
  }
};
