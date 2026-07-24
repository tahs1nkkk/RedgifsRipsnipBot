// Hafif oturum yoklaması. Web istemcisi açılışta bunu çağırır: 200 ise oturum
// geçerli, 401 ise Google girişine yönlenir. Medya ve listeler aynı Worker'da
// (aynı köken) olduğundan çerez yeterli — istemciye token/adres verilmez.
// Yetki denetimi çağırandan önce (worker.js) yapılır.
import { json } from "./_utils.js";

export function onRequestGet({ version }) {
  return json({ ok: true, version: version || "1.1" });
}
