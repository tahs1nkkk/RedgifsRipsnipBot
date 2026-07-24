# Genel — siteler-üstü hata raporları

Kaynak: kullanıcının iOS uygulamasında bizzat yaşadığı, tek siteye bağlı olmayan
hatalar/eksikler (galeri + listeler). **ŞİMDİ DÜZELTİLMEYECEK** — tüm siteler
toplanınca topluca. Bu dosyadaki kök nedenler, sitelerin kendi dosyalarındaki
bazı raporları da kapatır (çapraz referanslar aşağıda).

İlgili dosyalar:
- `ios-app/Sources/Gallery/GalleryScreen.swift` (cihaz + bulut galerisi)
- `ios-app/Sources/Lists/ListsScreen.swift` + `Support/SiteListStore.swift`
- `ios-app/Sources/Browser/BrowserScreen.swift` + `BrowserController.swift` (+ buton, liste ekleme)
- `cloud/web/src/media.js` (R2 medya listesi/depolama)

---

## ⚠️ Ortak kök neden adayları (ÖNCE bunlara bak)

### KÖK-BULUT-META — bulut R2 medyası düz/etiketsiz saklanıyor → Genel #1, RedGifs #1, Instagram #7/#8 (bulut yarısı)
Bulut deposu şu an **düz**: `media.js` `freeKey`/`listMedia` her nesneyi yalnız
dosya adıyla tutar, dönen kayıt `{name,size,mtime,kind}` — **site / niche /
kategori bilgisi yok**. Bu yüzden bulut galerisinde ne site ayrımı, ne niche
klasörü, ne de foto/video gruplaması yapılabiliyor.
- Cihaz indirmeleri Photos'a (klasörsüz) gider; masaüstü/eklenti indirmeleri
  `Downloads/{path}/{site}/{kategori}/{klasör}` düzenine göre gider
  (`common/settings.js` `downloadDirectory`) — ama bu düzen **buluta taşınmıyor**.
- **Aday çözüm:** her bulut nesnesine site/niche/kategori taşıt. Seçenekler:
  (a) R2 anahtarını yol-önekli yap (`RedGifs/Niches/<niche>/<dosya>`,
  `Instagram/Videolar/<dosya>`), (b) R2 custom metadata, (c) yan manifest.
  `media.js` (`freeKey`, `listMedia`, `handleMedia` PUT), `CloudClient.upload`,
  `CloudUploader.upload` ve indirme-hedefi-bulut yolu birlikte güncellenir.
  Yol-öneki en basiti — `listMedia` öneki parse edip grupları döndürebilir.

### KÖK-BULUT-PREVIEW — bulut galerisi önizlemesiz → Genel #3, Instagram #8
`CloudGalleryView` (`GalleryScreen.swift:323`) düz bir `List`; her satır SF Symbol
ikonu (`row()`, `:378`), gerçek küçük resim değil. Cihaz galerisi ise gerçek
thumbnail gösteriyor (`AssetThumbView`, `:481`).
- **Aday çözüm:** bulutu da `LazyVGrid` + önizleme yap. Görseller için
  `AsyncImage(cloud.streamURL(name:))` (thumbnail boyu ideal — R2/Worker'a küçük
  önizleme üretimi gerekebilir, aksi halde tam boy indirir, pahalı). Video için
  poster/ilk kare zor — Worker'da thumbnail üretmek ya da yükleme anında poster
  saklamak gerekebilir. Fix anında maliyet/hız kararı ver.

### KÖK-LİSTE — liste kaydı yanlış URL + ham başlık alıyor, tekilleşiyor → Genel #2 (kısmen), RedGifs #3/#4, Instagram #11
`AddToListSheet` her zaman `browser.addressText` (adres çubuğu = feed'de **çıplak
site URL'i**) + `browser.pageTitle` (`webView.title` = **ham SEO başlığı**) alır
(`BrowserScreen.swift:49`; `pageTitle` = `BrowserController.swift:169`
`webView.title`). Ayrıca `SiteListStore.add` (`SiteListStore.swift:81`) aynı URL'yi
tekilleştirir → aynı feed'de çok kez eklenince **tek kayda** düşer.
- **Aday çözüm:** "+" butonu, sayfadan **odaktaki medyanın permalink'ini** ve
  temiz site adını istesin (content script'ler slug/shortcode'u zaten biliyor:
  RedGifs `/watch/<slug>/`, IG `/p/<shortcode>/`). Native tarafa ayrı bir
  "seçili medya permalink + temiz başlık" kanalı gerekir. Bu düzeltilince
  RedGifs #3/#4 ve Instagram #11 birlikte kapanır.

### KÖK-FAB-KAPSAM — native FAB kendi medya taramasını yapıyor, content script'in filtresini/kapsamını atlıyor → Scrolller #1/#4/#5/#6/#10; Instagram KÖK-B ile akraba
Native FAB (`native-bridge.js`) medyayı **kendi** `candidates()`/`onScreen()`/
`centreMost()`'uyla buluyor (ekrandaki tüm `<video>`/`<img>`'leri toplar) ve
handler butonuna yalnızca geometrik eşleşmeyle "URL çözücü" olarak yöneliyor.
Ama site content script'i çok daha akıllı: örn. `content-scrolller-v2.js` reklamı
(`isAdvertisementMedia:323`), izleyici/tam-ekran kapsamını (`viewerLayerFor:415`,
`onlyTopViewerCandidates:429`) ve video-poster ayrımını (`:454-502`) zaten yapıyor.
Native taraf bunları **bilmediği için**:
- Reklam videoları da indirilebilir görünüyor (Scrolller #5).
- Tam ekranda arkaplandaki tüm medya çerçeveleniyor, sadece aktif medya değil
  (Scrolller #4/#10).
- Site kendi görünür butonlarını gösteriyor ama FAB ile aynı akışa girmiyor
  (Scrolller #1).
- **Aday çözüm:** FAB'ın medya seçimini content script'e devret — her site,
  "şu an indirilebilir medyalar + hangisi merkez/aktif" listesini native'e versin
  (native `candidates()` yerine `window.__rgFabMedia()` gibi bir köprü). Alternatif:
  native `candidates()`'e reklam/izleyici kapsamını da taşı (her site için ayrı
  ayrı, kırılgan). Instagram KÖK-B (merkez yanlılığı + aşırı yakalama) da bunun
  bir örneği — birlikte düşünülmeli.

### KÖK-VIDEO-POSTER — çoklu seçimde video, kendi poster görseli olarak iniyor → Instagram #6/#15 (=KÖK-C), Scrolller #9/#11
Çoklu seçim onayında (`native-bridge.js` `pickerConfirm`, `:450`) her öğe
`m.image` olup olmamasına göre ayrılıyor; bir video'nun poster/önizleme `<img>`'i
seçildiğinde video yerine **poster görseli** iniyor. Karışık (foto+video) çoklu
indirmede videolar önizleme resmi olarak kaydediliyor.
- **Aday çözüm:** çoklu seçimde video posterini videoya bağla — poster `<img>`'i
  seçilince altındaki `<video>`/handler butonunu çöz (content script video↔poster
  eşlemesini biliyor: Scrolller `videoPosters`, `:473-502`). Instagram KÖK-C ile
  aynı düzeltme; birlikte kapanır.

### KÖK-SEÇİM-OVERLAY — seçim modu katmanı alttaki sayfayla etkileşimi engellemiyor + ipucu/iptal çubuğu güvenilmez → Genel #8, Reddit #9/#10, Scrolller #6
Seçim modu katmanı (`native-bridge.js` `pickerStart`, layer `:398`) şu an
`pointer-events:none` → dokunuşlar **alttaki sayfaya geçiyor**, kullanıcı feed'deki
linklere/site butonlarına basabiliyor (Genel #8, Reddit #9). Çerçeveler
`pointer-events:auto` + `touch-action:pan-y` (`:341`,`:344`) olduğu için üstlerinden
başlayan sürükleme sayfayı **kaydırabiliyor** (iyi) — ama çerçeve **boşlukları**
`pointer-events:none` olduğundan alttaki linkler hâlâ tıklanabiliyor. İpucu çubuğu
(`updateHint` `:317`, metin `"Medyaya dokunarak seç"`) ve iptal, üstteki çerçeveler
yüzünden basılamıyor (Reddit #10, Scrolller #6).
- **İstenen davranış:** çoklu seçimde (a) ekran **kaydırılabilsin**, (b) çerçeveler
  dışındaki hiçbir şeyle (link/site butonu) etkileşime geçilemesin, (c) üstteki
  bilgi yazısı yerine **iki kontrol**: **İptal** ve **Karanlık aç/kapa** (karanlık =
  seçim modunda ekran karartısı; açıkken de kaydırılabilir kalsın).
- **Aday çözüm:** katmanı tüm dokunuşları **yutan** ama kaydırmayı ileten bir yakalayıcı
  yap (layer `pointer-events:auto` + manuel/`pan-y` kaydırma iletimi), sadece çerçeveler
  ve İptal/Karanlık düğmeleri tıklanabilir kalsın; düğmeler çerçevelerin **üstünde**
  ayrı katmanda dursun. Karanlık toggle bir dim overlay ekler.

### KÖK-GALERİ-VIEWER — galeri tam-ekran kaydırmalı gezinme yok → Genel #6
Bulut ve cihaz galerisinde bir medyayı açınca sağa/sola kaydırarak diğerlerine
geçilemiyor. `GalleryScreen.swift` — cihaz tarafı `AssetThumbView` (`:481`) grid'i
var ama tam-ekran sayfalı gezgin (`TabView(.page)` / paging) yok; bulut tarafı
(`CloudGalleryView`, `:323`) zaten önizlemesiz (KÖK-BULUT-PREVIEW).
- **Aday çözüm:** her iki galeriye de tam-ekran, yatay sayfalı bir görüntüleyici
  (`TabView` `.tabViewStyle(.page)` veya benzeri) ekle; KÖK-BULUT-PREVIEW ile birlikte
  düşün (bulutta önce thumbnail/akış gerekir).

### KÖK-İNDİRME-İPTAL — takılan indirme iptal edilemiyor, zaman aşımı yok → Genel #9, Coomer #2
İndirme başlayınca ekranın altında bir bilgilendirme mesajı çıkıyor ama indirme
takılırsa (ör. Coomer'da API yok → video çekilemiyor) ~1 dk askıda kalıyor ve
kullanıcı iptal edemiyor. `Downloader.swift` indirme görevini tutuyor.
- **İstenen davranış:** indirme toast'una **basılı tutunca iptal** seçeneği çıksın;
  ayrıca indirme hattına makul bir **zaman aşımı** + temiz hata.
- **Aday çözüm:** `Downloader.swift`'te aktif `URLSessionTask`/`Task`'a iptal kancası;
  toast görünümüne uzun-basış → iptal (görevi `cancel()` et, kullanıcıya "iptal edildi"
  göster). Zaman aşımı ile askıda kalan indirme otomatik düşsün.

---

## Raporlar

### #1 — Bulut galerisi site site + foto/video/tümü  [KÖK-BULUT-META]
- Bulut galerisinde her sitenin kısmı ayrı olsun; her sitede **fotoğraf / video /
  tümü** seçenekleri olsun. Şu an `CloudGalleryView` düz tek liste, gruplama yok.

### #2 — Listelerde siteler ayrışmıyor  [listeler + kısmen KÖK-LİSTE]
- Listelerde sitelerin ayrı listeleri ayrışmıyor. `LinkList` serbest adlı; bir
  listenin içindeki öğeler farklı sitelerden karışık (`ListDetailScreen`,
  `ListsScreen.swift:113`). `siteDot` zaten site rengini biliyor
  (`ListsScreen.swift:171`) → liste içinde **site bölümleri/filtresi** ya da
  site başına ayrı liste. Fix anında hangi model: (a) liste içi site sekmeleri,
  (b) otomatik site-başına liste — kullanıcıya sor/karar ver.

### #3 — Bulut görselleri cihaz galerisi gibi previewli  [KÖK-BULUT-PREVIEW]
- Buluttaki görseller normal cihaz galerisi gibi önizlemeli (thumbnail) görünsün.

### #4 — Cihaza kayıtlı galeriden seçip buluta aktarabilme  [muhtemelen ZATEN VAR]
- Galeride cihaza inmiş medyayı **seçerek buluta** aktarabilelim.
- **Önemli:** bu özellik büyük ölçüde **zaten var**: `DeviceGalleryView` seçim
  modu + "Buluta yükle" düğmesi → `uploadChosen()` → `CloudUploader.upload`
  (`GalleryScreen.swift`, seçim çubuğu ~`:186-193`, `uploadChosen` ~`:270-319`).
- Düğme `settings.cloudConfigured` ile koşullu. Kullanıcı bulamamış/kullanamamışsa
  neden: (a) bulut yapılandırılmadığı için düğme gizli, (b) keşfedilebilirlik
  (önce "Seç"e basmak gerekiyor), ya da (c) yükleme hata veriyor. **Fix anında
  önce çalıştığını doğrula**; muhtemelen kod değil UX/keşif sorunu. KÖK-BULUT-META
  ile ilişkili (buluta site/kategori bilgisi de taşınmalı).

### #5 — Küçük görseller çerçeve olarak algılanmıyor (Scrolller'da fark edildi)  [KÖK-FAB-KAPSAM]
- Seçim modunda küçük görseller çerçevelenmiyor → seçilemiyor. Scrolller'da
  fark edildi ama **site-üstü** (native tarafta boyut eşiği).
- Kaynak: `native-bridge.js` `candidates()`/`onScreen()` medyayı toplarken
  `rect.width < 120 || rect.height < 120` altındakileri eleme (~`:229`). Bu eşik
  küçük ama gerçek görselleri de düşürüyor.
- **Aday çözüm:** eşiği düşür / uyarlanabilir yap (ör. görünür alanın oranına
  göre) ya da KÖK-FAB-KAPSAM kapsamında medya listesini content script'ten al
  (site zaten hangi elemanın gerçek medya olduğunu biliyor, boyuttan bağımsız).

### #6 — Bulut ve cihaz galerisinde sağa/sola kaydırarak gezinme  [KÖK-GALERİ-VIEWER]
- Galeride bir medyayı açınca sağa/sola kaydırarak diğerlerine geçilebilsin (hem
  bulut hem cihaz). Şu an tam-ekran sayfalı gezgin yok → genel.md KÖK-GALERİ-VIEWER.

### #7 — Tüm listeler sadece site alan adını kaydediyor, medya/post linkini değil  [KÖK-LİSTE]
- Bütün listelere eklenen bağlantılar yalnızca **site alan adını** (çıplak URL)
  kaydediyor, medyanın/postun linkini değil. Bu, KÖK-LİSTE'nin tam kanıtı ve tüm
  siteleri kapsıyor (Instagram/RedGifs/Scrolller raporlarıyla aynı kök). Odaktaki
  medyanın permalink'i + temiz ad alınınca hepsi düzelir → genel.md KÖK-LİSTE.

### #8 — Çoklu seçimde kaydırma olsun ama link/buton etkileşimi olmasın  [KÖK-SEÇİM-OVERLAY]
- Çoklu seçim açıkken **her sitede** ekran kaydırılabilsin, ama sayfadaki linkler
  veya site butonlarıyla etkileşime geçilemesin (yalnız çerçeveler seçilebilsin).
  Şu an tersine: katman `pointer-events:none` olduğu için linkler tıklanabiliyor →
  genel.md KÖK-SEÇİM-OVERLAY.

### #9 — Takılan indirmeyi iptal: indirme toast'una basılı tutunca iptal  [KÖK-İNDİRME-İPTAL]
- Mevcut indirme işlemi ekranın altında bilgilendirme mesajı gösteriyor; buna
  **basılı tutunca iptal** seçeneği sunulsun — çünkü indirme bazen inmeyip uzun süre
  bekletiyor (Coomer #2 ile aynı kök) → genel.md KÖK-İNDİRME-İPTAL.
