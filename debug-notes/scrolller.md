# Scrolller — saha hata raporları (iOS uygulaması)

Kaynak: kullanıcının iOS uygulamasında bizzat yaşadığı hatalar/eksikler.
**ŞİMDİ DÜZELTİLMEYECEK** — tüm siteler toplanınca topluca. Raporların çoğu
`debug-notes/genel.md`'deki çapraz-kesen kök nedenlere bağlıdır (aşağıda işaretli).

İlgili dosyalar:
- `edge-extension/content-scrolller-v2.js` (paylaşımlı Scrolller mantığı — reklam
  filtresi, izleyici/tam-ekran kapsamı, video-poster ayrımı, görsel kaynağı, niche)
- `edge-extension/content-folders.js` (Scrolller için ikinci handler dosyası)
- `ios-app/native-bridge.js` (native FAB'ın kendi medya taraması + seçim modu)
- `scripts/build-ios-app-js.js` (handler butonlarını gizleme kuralı, `:88-111`)
- `ios-app/Sources/Downloads/MediaNaming.swift` (dosya adı + uzantı/mime)

---

## Bağlı ortak kök nedenler (genel.md'den)
- **KÖK-FAB-KAPSAM** → Rapor #1, #4, #5, #6, #10 (native FAB, content script'in
  reklam-filtresini / izleyici-kapsamını / gerçek-medya bilgisini atlıyor).
- **KÖK-VIDEO-POSTER** → Rapor #9, #11 (çoklu seçimde video, poster görseli iniyor).
- **KÖK-LİSTE** → Rapor #7, #8 (liste kaydı ham başlık + çıplak URL + tekilleşme).

Scrolller'a özgü olanlar (kök nedene bağlı değil): #2 (çözünürlük eki),
#3 (webp→jpg format).

**Not (KÖK-FAB-KAPSAM'ın Scrolller kanıtı):** `content-scrolller-v2.js` aslında
gerekli tüm zekâya sahip — reklamı eler (`isAdvertisementMedia`, `:323`),
izleyici/tam-ekran katmanını bilir (`viewerLayerFor` `:415`,
`onlyTopViewerCandidates` `:429`), video-poster eşlemesini yapar (`:454-502`).
Ama uygulamadaki native FAB (`native-bridge.js`) medyayı **kendi**
`candidates()`'iyle bulup handler butonuna sadece geometriyle yöneliyor; bu
akıllı filtreleri görmüyor. Kalıcı çözüm: FAB'ın medya listesini içerik betiğinden
alması (genel.md → KÖK-FAB-KAPSAM).

---

## Raporlar

### #1 — Medya başına indirme butonu hâlâ çıkıyor; sadece ekran FAB'ı olsun  [KÖK-FAB-KAPSAM]
- Diğer sitelerdeki gibi olsun: **medya başına buton olmasın**, sadece ekranın
  FAB'ı: tek dokunuş = ekranda **tek** medya varsa onu indir; uzun basış = medyaları
  algıla ve çoklu seçim aç.
- Gizleme kuralı **var**: `build-ios-app-js.js:88-111` `#rg-scrolller-v2-host` ve
  `#rg-scrolller-card-buttons`'ı `opacity:0 + pointer-events:none` yapıyor. Buna
  rağmen kullanıcı butonu görüyor → fix anında araştır: (a) shadow DOM host'una
  uygulanan opacity WKWebView'de kart butonlarını gizlemiyor olabilir, (b)
  content-scrolller-v2.js butonu her kartta yeniden gösteriyor olabilir
  (`shown` mantığı `:600-606`, host `:556`). Asıl istenen davranış KÖK-FAB-KAPSAM
  ile örtüşüyor (FAB medya-öncelikli akış).

### #2 — İnen görsel adının sonundaki çözünürlük etiketi kalksın  [isimlendirme]
- Scrolller görsellerinin dosya adında çözünürlük eki var (ör. `..._1920x1080` /
  boyut sonek'i); kalite korunsun ama **addaki çözünürlük eki temizlensin**.
- RedGifs #2 (`-large`) ile aynı sınıf: `MediaNaming.fileName` (`MediaNaming.swift:35`)
  stem'den varyant/çözünürlük son ekini atsın; eklenti tarafı (`background.js`
  `filenameFor`) aynı temizliği yapsın. URL'yi değil kaydedilen **adı** değiştir.
  (Scrolller'ın gerçek ad kalıbını fix anında bir örnek indirmeyle doğrula.)

### #3 — Görseller webp değil jpg olarak insin  [Scrolller'a özgü format]
- İnen görseller `.webp` yerine `.jpg` olsun.
- Scrolller CDN'i webp servis ediyor. İki yol: (a) srcset/`<picture>` içinde jpg
  varyantı varsa onu seç (`urlsFromSrcset` `:173`, picture kaynakları `:359-363`) —
  ucuz ama her zaman jpg olmayabilir; (b) kaydederken webp→jpg **dönüştür** (native
  tarafta decode+encode — `MediaNaming`/indirme hattı; maliyet/kalite kararı fix
  anında). Sadece uzantıyı değiştirmek **yetmez** (içerik yine webp kalır).

### #4 — Tam ekranda arkaplandaki medyalar hâlâ algılanıyor  [KÖK-FAB-KAPSAM]
- Medyayı tam ekran yapınca arkaplandaki medyalar da algılanıyor; **sadece tam
  ekrandaki tekil medya** algılanmalı.
- content-scrolller-v2.js izleyici katmanını biliyor (`viewerLayerFor:415`,
  `onlyTopViewerCandidates:429`) ama native FAB'ın `candidates()`'i tüm ekranı
  tarıyor. FAB izleyici açıkken kapsamı ona daraltmalı → KÖK-FAB-KAPSAM.

### #5 — Reklam videolarında indirme opsiyonu çıkmasın  [KÖK-FAB-KAPSAM]
- Reklam videolarında indirme seçeneği görünmesin.
- content-scrolller-v2.js reklamı zaten eliyor (`isAdvertisementMedia:323`), ama
  native FAB ham `<video>`'yu bulup indirilebilir gösteriyor. FAB, reklam filtresini
  içerik betiğinden almalı → KÖK-FAB-KAPSAM.

### #6 — Çoklu seçim "iptal" tuşuna arkasındaki medya çerçevesi yüzünden basılamıyor  [KÖK-FAB-KAPSAM + seçim modu düzeni]
- Seçim modunda iptal düğmesine, arkasındaki medya çerçevesi tıklamayı yakaladığı
  için basılamıyor.
- native-bridge.js seçim modu: çerçeveler `pointer-events:auto` ve yüksek z-index;
  ipucu/iptal çubuğu da aynı katmanda → üstteki çerçeve iptal düğmesini örtüyor.
  Fix: iptal düğmesini çerçevelerin **üstünde** ayrı bir katmana al (daha yüksek
  z-index / ayrı overlay) veya çerçeveleri iptal düğmesi bölgesinde oluşturma.
  KÖK-FAB-KAPSAM düzeltilip çerçeve sayısı azalınca da hafifler.

### #7 — Liste kaydında site adı hep "Scrolller" olsun  [KÖK-LİSTE]
- Listeye eklerken sayfa/site adı her zaman düz **"Scrolller"** olsun (şu an ham
  `webView.title` geliyor). Temiz site adı üretimi → genel.md KÖK-LİSTE.

### #8 — Tüm listeler tek medyaya düşüyor (tekilleşme)  [KÖK-LİSTE]
- Listeye ne eklense **tek kayda** düşüyor. Sebep: çıplak site URL'i + `SiteListStore.add`
  (`SiteListStore.swift:81`) aynı URL'yi tekilleştiriyor. Odaktaki medyanın
  permalink'i alınınca düzelir → genel.md KÖK-LİSTE.

### #9 — Discover'da foto+video çoklu indirmede video, önizleme görseli olarak iniyor  [KÖK-VIDEO-POSTER]
- Discover sayfasında görsel+video birlikte çoklu indirilince **video, poster
  görseli** olarak iniyor. `pickerConfirm` posteri image sanıp indiriyor. Poster↔video
  eşlemesi içerik betiğinde var (`videoPosters`, `:454-502`) → genel.md KÖK-VIDEO-POSTER.

### #10 — Görseli tam ekran yapınca: tekli indirme doğru, çoklu seçim tüm arka medyayı çerçeveliyor  [KÖK-FAB-KAPSAM]
- Bir görseli tam ekran yapınca tekli indirme onu doğru indiriyor; ama çoklu seçime
  geçince arkaplandaki **tüm** medyaların çerçevesi çıkıyor. Seçim modunun (picker)
  aday listesi de izleyici katmanına daraltılmalı → KÖK-FAB-KAPSAM (#4 ile aynı kök,
  bu sefer picker tarafında).

### #11 — Çoklu indirmede videolar önizleme görseli olarak iniyor  [KÖK-VIDEO-POSTER]
- Çoklu indirme yapınca videolar poster/önizleme görseli olarak kaydediliyor.
  #9 ile aynı kök → genel.md KÖK-VIDEO-POSTER.
