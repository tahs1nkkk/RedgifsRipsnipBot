// Supabase'teki tasu_sync tablosunu basit bir "belge kutusu" gibi kullanır.
//
// Zaten liste eşitlemesi için orada bir tablo var (id + payload jsonb). Medya
// kategorileri, arşivler ve paylaşım linkleri için ikinci bir depo kurmak yerine
// aynı tabloda ayrı satırlar tutuyoruz:
//
//   id = "default"  → uygulamanın liste anlık görüntüsü (lists.js yazar)
//   id = "archive"  → arşiv/kategori/atama meta verisi (meta.js)
//   id = "shares"   → public paylaşım linkleri (share.js)
//
// Service key yalnız Worker'da; tarayıcı bu satırlara doğrudan erişemez.
import { supabase } from "../functions/api/_utils.js";

export async function readDoc(env, id, fallback) {
  const response = await supabase(env, `tasu_sync?id=eq.${encodeURIComponent(id)}&select=payload`);
  if (!response.ok) throw new Error(`supabase ${response.status}`);
  const rows = await response.json();
  if (!rows.length) return fallback;
  return rows[0].payload ?? fallback;
}

export async function writeDoc(env, id, payload) {
  const response = await supabase(env, "tasu_sync", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{ id, payload, updated_at: new Date().toISOString() }])
  });
  if (!response.ok) throw new Error(`supabase ${response.status}`);
}
