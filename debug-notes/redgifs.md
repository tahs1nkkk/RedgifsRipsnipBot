# RedGifs — saha hata raporları (iOS uygulaması)

Kaynak: kullanıcının iOS uygulamasında bizzat yaşadığı hatalar/eksikler.
**ŞİMDİ DÜZELTİLMEYECEK** — tüm siteler toplanınca topluca. Bazı raporlar
`debug-notes/genel.md`'deki kök nedenlere bağlıdır (aşağıda işaretli).

İlgili dosyalar:
- `edge-extension/content-redgifs.js` (paylaşımlı RedGifs mantığı: niche, slug, görsel varyant)
- `ios-app/Sources/Downloads/MediaNaming.swift` (uygulama dosya adı üretimi)
- `edge-extension/background.js` (eklenti dosya adı üretimi)
- Bulut/niche için: `cloud/web/src/media.js` + `common/settings.js` `downloadDirectory`

---

## Bağlı ortak kök nedenler (genel.md'den)
- **KÖK-BULUT-META** → Rapor #1 (bulut niche klasörleri).
- **KÖK-LİSTE** → Rapor #3, #4 (liste kaydı ham başlık + çıplak URL + tekilleşme).

---

## Raporlar

### #1 — Bulut galerisinde niches için ayrı kısım + niche klasörleri  [KÖK-BULUT-META]
- Bulut galerisinde niches için ayrı bir kısım olsun; her niche kendi adında
  klasör olsun; o niche içinde inen **her şey** o klasöre kaydolsun; niche
  dışında inenler normal insin.
- content-redgifs.js `nicheFromPath()` (`:28`) `/niches/{ad}` yolundan niche'i
  zaten çıkarıyor ve indirmeleri niche alt-klasörüne yönlendiriyor
  (`subFolder` → `settings.js downloadDirectory` → `[base, site, "Niches", ad]`).
  Ama bu **indirme klasörü** kavramı; iOS Photos'a (klasörsüz) ve bulut R2'ye
  (düz) taşınmıyor. Niche bilgisinin buluta gitmesi gerek → KÖK-BULUT-META.

### #2 — İnen görsel adının sonundaki "-large" etiketi kalksın  [isimlendirme]
- RedGifs görselleri bilerek `-large` sürümünden iniyor (`content-redgifs.js:893`,
  `redgifsLargeImage`) → dosya adı `<slug>-large.jpg` oluyor. Kalite korunsun ama
  **dosya adındaki `-large` (ve diğer varyant ekleri) temizlensin**.
- İki yerde: uygulama `MediaNaming.fileName` (`MediaNaming.swift:35`) — stem'den
  `-(small|mobile|mini|thumbnail|thumb|preview|poster|sd|medium|large)` son ekini
  at. Eklenti tarafı `background.js` dosya adı üretimi (`filenameFor`) aynı
  temizliği yapmalı. URL'yi değil, **kaydedilen adı** değiştir.

### #3 — Liste sayfa adı "RedGIFs" olsun  [KÖK-LİSTE]
- Not/liste eklerken "Eklenecek sayfa" adı `porn gifs and porn pics I RedGIFs`
  yerine düz `RedGIFs` olsun. Kaynak: `browser.pageTitle` = ham `webView.title`
  (`BrowserController.swift:169`). Temiz site adı / medya başlığı üret → KÖK-LİSTE.

### #4 — Liste bağlantısı medya linki olsun, tekilleşmesin  [KÖK-LİSTE]
- Listeye eklenen bağlantı o medyanın linki (`/watch/<slug>/`) olmalı, çıplak site
  linki değil; ve her seferinde aynı çıplak URL kaydedildiği için `SiteListStore.add`
  (`SiteListStore.swift:81`) tekilleştirip **tek kayda** düşürüyor. Odaktaki
  medyanın permalink'i alınınca ikisi de düzelir → KÖK-LİSTE.
