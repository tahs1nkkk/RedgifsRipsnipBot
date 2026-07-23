// Basit sağlık ucu. Yetki denetimi çağırandan önce yapılır.
import { json } from "./_utils.js";

export function onRequestGet() {
  return json({ ok: true });
}
