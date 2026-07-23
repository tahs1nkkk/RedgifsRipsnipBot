// Web istemcisine ayarları verir: medya sunucusu adresi + medya token'ı.
// Böylece Google ile giren kullanıcı hiçbir şey yazmadan medyaya erişir.
// Yetki denetimi çağırandan önce (worker.js / _middleware) yapılır.
import { json } from "./_utils.js";

export function onRequestGet({ env }) {
  return json({
    ok: true,
    token: env.ARCHIVE_TOKEN || "",
    mediaBase: (env.MEDIA_BASE || "").replace(/\/+$/, "")
  });
}
