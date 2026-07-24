# Coomer — saha hata raporları (iOS uygulaması)

Kaynak: kullanıcının iOS uygulamasında bizzat yaşadığı hatalar/eksikler.
Raporlar `debug-notes/genel.md`'deki çapraz-kesen kök nedenlere bağlı (aşağıda işaretli).

İlgili dosyalar:
- `edge-extension/content-coomer.js` (Coomer mantığı: `.rg-coomer-download` butonları,
  `isPostPage` gating `:184`, video kaynağı `:166-173`, `removeButtons` `:150`)
- `ios-app/native-bridge.js` (native FAB medya taraması)
- `scripts/build-ios-app-js.js` (`.rg-coomer-download` gizleme, `:82`)
- İndirme takılması/iptal için: `ios-app/Sources/Downloads/Downloader.swift`

---

## Bağlı ortak kök nedenler (genel.md'den)
- **KÖK-FAB-KAPSAM** → Rapor #1, #3 (reklam medyası çerçeveleniyor; medya üstü butonlar).
- **KÖK-İNDİRME-İPTAL** → Rapor #2 (takılan indirmeyi iptal / zaman aşımı — genel #9).
- **KÖK-LİSTE** → Rapor #4 (liste tam link kaydetsin, çıplak alan adı değil).

---

## Raporlar

### #1 — Reklam popup/gif medyalarına indirme çerçevesi çıkıyor  [KÖK-FAB-KAPSAM]
- Ekranda çıkan reklam popup'ları / reklam gif'leri de indirme çerçevesi alıyor.
  Örn. **creators** sayfasında **hiçbir** indirme çıkmamalı — oradaki medyalar reklam.
- content-coomer.js butonları yalnız `isPostPage()`'te ekliyor (`:184`), yani creators
  sayfasında Coomer butonu yok; ama native FAB'ın `candidates()`'i ham reklam
  `<img>`/`<video>`'yu yine çerçeveliyor. FAB reklamı elemeli + sayfa tipi (post değil)
  ise hiç çerçeve göstermemeli → genel.md KÖK-FAB-KAPSAM.

### #2 — API yok: video sunucudan çekilemiyor, sayfa açılmıyor, indirme ~1dk takılıp kalıyor  [KÖK-İNDİRME-İPTAL]
- Video bağlantıları indirme olarak algılanıyor ama sitede şu an API yok; video
  sunucudan çekilemiyor ve bazı medya sayfaları açılmıyor. Böyle olunca indirme
  ~1 dakika "iniyor" durumunda takılı kalıyor.
- İki parça: (a) başarısız/askıda indirmeyi kullanıcı **iptal edebilmeli** (genel #9,
  indirme toast'una basılı tutunca iptal); (b) indirme hattına makul bir **zaman
  aşımı** + net hata dönmeli (`Downloader.swift`). Coomer video akışı API'siz
  başarısızsa erken ve temiz düşmeli.

### #3 — Medya üstündeki indirme butonları hâlâ var; hepsi kaldırılsın  [KÖK-FAB-KAPSAM / gizleme]
- Medyaların üzerinde hâlâ indirme butonları görünüyor; diğer sitelerdeki gibi
  hepsi kaldırılsın (sadece ekran FAB'ı kalsın).
- `.rg-coomer-download` gizleme listesinde **var** (`build-ios-app-js.js:82`,
  `opacity:0 + pointer-events:none`) ama yine görünüyor — Scrolller #1 ile aynı sınıf
  bilmece. Fix'te araştır: opacity kuralı neden tutmuyor (host/stacking), ya da
  content-coomer.js butonu yeniden mi ekliyor. Gerekirse `removeButtons` (`:150`)
  app modunda çağrılsın / gizleme sağlamlaştırılsın.

### #4 — Listeye kaydedilen bağlantı tam link olsun  [KÖK-LİSTE]
- Listeye eklenen bağlantı **tam link** olarak kaydedilsin, sadece site alan adı
  değil. Genel #7 / KÖK-LİSTE ile aynı.
