# Reddit — saha hata raporları (iOS uygulaması)

Kaynak: kullanıcının iOS uygulamasında bizzat yaşadığı hatalar/eksikler.
**ŞİMDİ DÜZELTİLMEYECEK** — tüm siteler toplanınca topluca. Raporların çoğu
`debug-notes/genel.md`'deki çapraz-kesen kök nedenlere bağlıdır (aşağıda işaretli).

İlgili dosyalar:
- `edge-extension/content-reddit.js` (paylaşımlı Reddit mantığı: galeri/carousel,
  tekli/çoklu indirme, URL çözme, arama paneli)
- `ios-app/native-bridge.js` (native FAB'ın kendi medya taraması + seçim modu)
- `scripts/build-ios-app-js.js` (`#rg-reddit-search-trigger`/`-panel` `display:none`, `:108`)
- `ios-app/Sources/...` (native profil arama penceresi + "pencere grupları" için yeni ekran)

---

## Bağlı ortak kök nedenler (genel.md'den)
- **KÖK-FAB-KAPSAM** → Rapor #3, #4, #5, #8 (native FAB medya-dışı/komşu/arka-plan
  çerçeveleri de topluyor; content script'in kapsamını atlıyor).
- **KÖK-SEÇİM-OVERLAY** → Rapor #9, #10 (seçim modunda linkler tıklanabiliyor;
  ipucu/iptal çubuğu çalışmıyor → İptal + Karanlık toggle isteniyor).
- **KÖK-LİSTE** → (genel.md #7 ile) liste kaydı çıplak alan adı — tüm siteler ortak.

Reddit'e özgü olanlar: #1/#2 (tekli/çoklu FAB davranışı — carousel), #6 (tam-ekran
tekli — doğru davranış), #7 (RedGifs embed algısı), #11 (profil arama penceresi +
pencere grupları — YENİ ÖZELLİK).

---

## Raporlar

### #1 — İndirme butonu tekli yerine kaydırmalı postun TÜM medyasını indiriyor  [Reddit FAB davranışı]
- Tek dokunuşla carousel/galeri postta sadece görünen medya değil **hepsi** iniyor.
- Reddit betiğinde iki eylem var: tekli `runOverlayImageDownload` (`:788`, tek
  `__rgDownloaderImage`) ve çoklu `runOverlayMultiDownload` (`:814`, `downloadAll`).
  Galeri algısı `hasGalleryUi`/`uniqueImageCount > 1` (`:592`,`:550`) çoklu butonu
  gösteriyor. Uygulamada FAB muhtemelen **çoklu** butona (post kutusunu kaplayan)
  ya da kökü tüm postu kapsayan tekli butona yöneliyor → hepsi iniyor. FAB tek
  dokunuşta **tekil** (`runOverlayImageDownload` + görünen görsel) çözmeli.

### #2 — İstenen FAB davranışı: tek dokunuş=tekil, uzun basış=çoklu + sarı neon  [Reddit FAB davranışı]
- Butona **tek** basılırsa her zaman tekli indirsin. **Basılı tutulursa** ve postta
  birden fazla medya algılanırsa çoklu seçim açılsın; bir çerçeve seçilince
  **sarı neon** parlasın (= o medya seçili). Bu genel FAB spesifikasyonuyla uyumlu;
  Reddit carousel'inde her kaydırılan görsel ayrı seçilebilir medya olmalı.

### #3 — Ana sayfada çoklu seçimde bir sürü medya-dışı çerçeve çıkıyor  [KÖK-FAB-KAPSAM]
- Ana feed'de çoklu seçime girince ekranda medya olmayan bir sürü çerçeve beliriyor.
  Native FAB `candidates()` gerçek medyayı ayırt edemiyor → genel.md KÖK-FAB-KAPSAM.

### #4 — Carousel'in sağ/solundaki (görünmeyen) görsellerin çerçeveleri algılanıyor  [KÖK-FAB-KAPSAM]
- Çoklu seçimde postun sağındaki/solundaki (o an görünmeyen) carousel görsellerinin
  çerçeveleri de çıkıyor; sadece **o an görünen** medyanın çerçevesi olmalı, optimize
  edilsin. `candidates()`/`onScreen()` görünürlük kapsamını daraltmalı → KÖK-FAB-KAPSAM.

### #5 — Görsel tam ekranken hâlâ etraftaki çerçeveler geliyor  [KÖK-FAB-KAPSAM]
- Bir görseli tam ekran yapınca çevredeki çerçeveler ekrana geliyor. İzleyici/tam-ekran
  açıkken kapsam ona daralmalı (Scrolller #4/#10 ile aynı) → genel.md KÖK-FAB-KAPSAM.

### #6 — Tam ekranda indirmeler tekli sayılıyor  [doğru davranış — korunmalı]
- Tam ekranda indirme tekil olarak sayılıyor. Bu **istenen** davranış; not olarak
  tutuluyor: kapsam düzeltmesi (#5) yapılırken tam-ekran-tekli mantığı bozulmamalı.

### #7 — RedGifs embed medyası algılanmıyor  [Reddit'e özgü embed]
- Reddit postundaki gömülü RedGifs medyası algılanmıyor; indirme otomatik olarak
  üstteki/alttaki posta kayıyor ve çoklu seçimde çerçevesi çıkmıyor.
- content-reddit.js gömülü RedGifs (iframe/video/`redgifs.com` link) çözümünü ele
  almalı; `isPotentialGalleryImage` (`:282`) sadece `<img>`'e bakıyor, embed video/
  iframe'i kapsamıyor. Reddit'e özgü embed algılama gerek (RedGifs slug → medya URL).

### #8 — Subreddit'lerde de her yerde çerçeve çıkıyor  [KÖK-FAB-KAPSAM]
- Subreddit sayfalarında da medya olmayan yerlerde çerçeveler var; sadece medyanın
  çerçevesi olmalı. #3/#4 ile aynı kök → genel.md KÖK-FAB-KAPSAM.

### #9 — Çoklu seçimde sayfadaki linklerle etkileşime geçilebiliyor  [KÖK-SEÇİM-OVERLAY]
- Çoklu seçim açıkken sayfadaki linklere basılabiliyor; olmamalı. Seçim katmanı
  `pointer-events:none` (`native-bridge.js:398`) → dokunuş alta geçiyor. Genel #8
  ile aynı → genel.md KÖK-SEÇİM-OVERLAY.

### #10 — Çoklu seçimde kaydırma var ama medya-dışı çerçeveler + ipucu/iptal çalışmıyor; İptal + Karanlık toggle isteniyor  [KÖK-SEÇİM-OVERLAY]
- Çoklu seçimde ekran kaydırılıyor (iyi) ama etrafta medya-dışı çerçeveler var ve
  üstteki "medyaya dokunarak seç" yazısı + iptal butonu çalışmıyor (üstteki medya/
  çerçeve dokunuşu yakalıyor). İstenen: yazı yerine **iki kontrol** — **İptal** ve
  **Karanlık aç/kapa** (karanlık = seçim modunda ekran karartısı; açıkken de çoklu
  seçim açıp kaydırılabilir). İpucu çubuğu `updateHint` (`:317-322`) → genel.md
  KÖK-SEÇİM-OVERLAY. (Medya-dışı çerçeveler kısmı KÖK-FAB-KAPSAM.)

### #11 — Profil arama butonu çalışmıyor → Liquid arama penceresi + "pencere grupları"  [Reddit'e özgü YENİ ÖZELLİK]
- Profil arama butonu işe yaramıyor. İstenen akış:
  - Butona basınca **Liquid tema uyumlu** bir arama penceresi açılsın; oradan arama
    yapılsın.
  - Açılan arama sayfaları, uygulamanın **ana menüsünün alt kısmında** bir
    **"pencere grupları"** bölümünde toplansın.
  - Her aranan kullanıcı için bir grup: **grup adı = aranan profil ismi**, **grup
    içeriği = arama için seçilen siteler** (o profilin farklı sitelerdeki sayfaları).
  - Bu gruplar **elle kapatılmadıkça** kalsın (kalıcı).
  - Bölümün en üstünde **"tüm pencereleri temizle"** butonu olsun; basınca **onay**
    istesin, "evet" denirse tüm grupları ve içindeki sayfaları silsin.
- Not: eklentideki Reddit arama paneli (`#rg-reddit-search-panel`/`-trigger`,
  content-reddit.js `:881+`, kalıcı durum `:885`) uygulamada tamamen gizli
  (`build-ios-app-js.js:108` `display:none`). Yani bu native tarafta yeni bir ekran
  + kalıcı depo (pencere grupları) olarak yazılacak; eklenti panelinin arama
  mantığı referans alınabilir. **Büyük özellik** — fix aşamasında ayrı planla.