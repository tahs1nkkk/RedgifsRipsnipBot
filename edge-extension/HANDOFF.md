# RedGifs Downloader — Devir / Handoff Notları

Claude + Codex ortak çalışıyor. Değişiklikten önce bunu oku, sonra güncelle.

## BEKLEYEN İŞLER (sonra)
- (yok — Instagram bildirimler sayfası v0.14.4'te çözüldü: `/notifications` + <70px önizleme gate)

## Paketleme
- Kaynak: `edge-extension/`. Kullanıcıya zip: `Compress-Archive -Path 'edge-extension\*' -DestinationPath '..\RedgifsExtension.zip' -Force`.
- Her değişiklikte `manifest.json` içindeki `version`'ı artır. Şu an: **0.24.4**.

## SİTE DURUMU (sistematik debug)
- **Redgifs = TAMAMEN BİTTİ ✅ (v0.13.8)** — feed, explore/gifs, explore/images, niches, profil grid, viewer (tam ekran), avatar, varyant filtresi, klasör seçimi hepsi çalışıyor. Kilit: slug = `data-feed-item-id`; görsel vs video ayrımı = sayfa yolu (`/images`); görsel indirme = imageMode (content-type kontrolü).
- **Reddit / Scrolller / Instagram = SIRADA** (henüz sistematik test edilmedi). Instagram'da bekleyen: bildirimler sayfasında buton gösterme (yukarı bak).
- Üst klasördeki `node_modules`'ü ASLA zip'e katma (138MB Playwright botu).

## Mimari
- `background.js`: service worker. Mesajlar: `DIRECT_DOWNLOAD` (URL'leri erişilebilirlik kontrolünden geçirip indirir), `OPEN_TAB`, `START_RIPSNIP`.
- İçerik scriptleri site başına: `content-redgifs.js`, `content-reddit.js`, `content-scrolller.js`, `content-instagram.js`, `content-ripsnip.js`.
- `content-folders.js`: **ortak klasör seçici**, her sitenin scriptinden ÖNCE inject edilir. `window.rgChooseFolder()` → Promise<string|null> döner (`""`=Ana klasör, ad=özel klasör, `null`=iptal). İzole dünyada global, site scriptleri çağırır.
- Ayarlar: `chrome.storage.local` anahtarı `rgRipsnipSettings`. Popup `<details>` dropdown'larla site başına ayar.
- Ortak ayar varsayımları artık yalnızca `common/settings.js` içindedir. Site scriptlerinde ayrı `DEFAULT_SETTINGS` tanımlama.
- Varsayılan klasör düzeni: `Downloads/{downloadPath}/{site}/{Fotoğraflar|Videolar}/{seçim}`. RedGifs niche indirmeleri `Downloads/{downloadPath}/RedGifs/Niches/{niche}` altında tür ayrımı olmadan tutulur. Popup'tan `legacy` seçilirse eski üst-seviye özel klasör davranışı kullanılır.
- Popup'taki `Debug rehberini aç`, 31 testi sırayla yürütür. Başarısız adımlar siteye özel salt-okunur konsol komutu ve kullanıcı notuyla `redgifs-downloader-debug-v2` JSON loguna yazılır.

## v0.17.0 regresyon düzeltmeleri
- RedGifs `/niches` dizinindeki önizleme kartlarında indirme düğmeleri kaldırıldı; `/niches/{ad}` içindeki gerçek içerikler indirilebilir kalır.
- Reddit çoklu düğme görünürlüğü URL varyantı sayısına değil gerçek görsel kimliği + galeri UI sinyaline bağlandı.
- Scrolller medya tespiti şeffaf overlay altındaki `img/video` torunlarını tarar; wildcard alt alan adları ve tüm frame'ler manifest kapsamına alındı.
- Instagram dar pencerede Reels düğmesi gerçek medya kutusuna bağlanır; müzikli fotoğraf story API yolunda görsel tercih edilir; görünür highlight videosu fotoğrafa eşleşirse en yakın video item'ı seçilir.
- Debug konsol komutları artık `undefined` yerine JSON'u hem döndürür hem panoya kopyalar.

## v0.17.1 Scrolller kök düzeltmesi
- Tanı çıktısı content script ve UI'ın yüklendiğini (`buttonPresent/stylePresent=true`) ama aday bulunmadığını doğruladı.
- Scrolller'ın RedGifs/GifDeliveryNetwork CDN videolarını eleyen hatalı filtre kaldırıldı; `content-redgifs.js` Scrolller hostunda çalışmadığı için bu medya artık `content-scrolller.js` tarafından indirilir.
- Overlay medya öğesinin atası değil kardeşiyse, pointer dikdörtgeninin altındaki görünür `img/video` öğeleri sayfa genelinde yedek olarak taranır.

## v0.17.2 Scrolller görünür kontrol
- Scrolller butonu artık medya eşleşmesine bağlı olarak tamamen gizlenmez. Eşleşme yokken sağ üstte sabit yedek konumda görünür.
- Hover ile medya bulunursa buton medya üzerine taşınır; hover eşleşmesi kaybolunca sabit konuma döner.
- Sabit butona tıklanınca merkezdeki veya görünür alanı en büyük uygun medya yeniden çözülür; aday yoksa görünür `E_NO_MEDIA` hatası verir.

## v0.18.0 Scrolller v2
- Eski `content-scrolller.js` manifestten çıkarıldı; yeni dosya adı eski content script/cache karışıklığını önler.
- `content-scrolller-v2.js` açık Shadow DOM içinde, site CSS'inden izole ve her zaman sağ üstte görünen tek kontrol oluşturur.
- Tıklamada önce görünür video, sonra en büyük görünür görsel seçilir; blob videolar için son doğrudan medya kaynakları performance kayıtlarından çözülür.

## v0.18.1 Scrolller kalıcılık
- Canlı testte düğmenin ilk yüklemede görünüp Scrolller hydration sonrasında silindiği doğrulandı.
- Hover konumlandırması yoktur; kontrol sağ üstte sürekli sabittir.
- MutationObserver ve 1 saniyelik watchdog host silinirse Shadow DOM kontrolünü yeniden oluşturur ve `display:block !important` uygular.

## v0.19.0 Scrolller popup indirme
- Scrolller'ın sayfa içi DOM kontrolü artık zorunlu değildir. Popup içindeki `Görünen medyayı indir` aktif Scrolller sekmesine mesaj gönderir.
- Aktif sekmede yeni content script yoksa popup `common/settings.js`, `content-folders.js` ve `content-scrolller-v2.js` dosyalarını anında inject edip isteği tekrarlar; sekmeyi yeniden açma zorunluluğu yoktur.
- Popup sonucu veya `E_NO_MEDIA`/arka plan hatasını kendi durum satırında gösterir.

## v0.20.0 Scrolller kart düğmeleri
- Scrolller'ın sabit genişlik/değişken yükseklikli ana akışındaki her görünür medya için Shadow DOM katmanında ayrı, sürekli görünür indirme düğmesi oluşturulur.
- Düğmeler medya `getBoundingClientRect()` ölçülerine göre kaydırma, yeniden boyutlandırma ve DOM değişimlerinde yeniden konumlanır; site kartlarının içine öğe eklenmez.
- Aynı alandaki video ve poster görseli tek düğmeye indirilir; video tercih edilir. Kart adayı yoksa eski sağ üst sabit düğme yedek olarak görünür.
- Görsellerde tarayıcının seçtiği kaynak ve büyük `srcset` varyantları önce denenir. Popup indirme yolu yedek olarak korunur.

## v0.20.1 Scrolller kalıcı kart kontrolleri
- Kart düğmeleri hover/DOM değişimlerinde silinip yeniden oluşturulmaz; medya öğesi başına aynı düğme korunur. Böylece `pointerdown` ile `click` arasında düğmenin değişmesi engellenir.
- Eklenti katmanı ve düğmeleri maksimum z-index'e taşındı; Discover geçişlerinde medya ve siyah hover katmanının arkasında kalmaz.
- Kaydırma ve geçiş animasyonlarında düğme koordinatları kısa süre boyunca her animasyon karesinde güncellenir; karttan kopma ve ters yönde sürüklenme önlenir.

## v0.20.2 Scrolller viewer, koordinat ve kalite
- Düğme koordinatları artık viewport sınırına kırpılmaz; kart sayfadan çıkarken düğme gerçek medya sol üst köşesiyle birlikte hareket eder.
- Tam ekran/fixed viewer algılanınca yalnızca viewer içindeki medyanın düğmesi tutulur; arkadaki feed düğmeleri kaldırılır. Tıklama sonrası açılış animasyonu birkaç aşamada yeniden taranır.
- Görsel kaynak sırası `data-original/data-full` → en büyük `srcset` → `src` → ekranda seçilen `currentSrc` olarak değiştirildi. Güvenli şekilde denenebilen `original/large` CDN ve boyut parametresiz URL adayları öne eklenir.
- Video kaynakları original/HD/çözünürlük işaretlerine göre sıralanır. İndirme dönüştürme yapmaz; sunucudaki en iyi erişilebilir dosyayı kayıpsız kaydeder.

## v0.21.0 Scrolller video, reklam ve özel temizlik
- Reklam/sponsor/promoted kartları sınıf, veri özelliği, erişilebilirlik etiketi ve kısa reklam metni sinyalleriyle medya adaylarından çıkarılır; üzerlerinde indirme düğmesi oluşmaz.
- Player hata metninde yayımlanan doğrudan `.mp4` URL'leri dahil kart/viewer bağlamındaki video kaynakları taranır. MP4 her zaman WebM'den önce denenir; bozuk MP4 varsa çalışan alternatif korunur.
- Poster görselleri gerçek video öğesiyle çakışıyorsa fotoğraf adayı olmaz. Poster kartının bağlamında video URL'si varsa düğme video indirmesi yapar.
- Viewer videolarında `videoWidth/videoHeight`, CSS aspect-ratio ve `object-fit: contain` kullanılarak gerçek letterbox alanı hesaplanır; düğme ekran köşesi yerine video içeriğinin sol üstüne bağlanır.
- Popup'a `Öğe gizle` seçici modu ve `Gizlenenleri geri getir` eklendi. Seçilen Scrolller popup/panellerinin CSS seçicileri ayarlarda kalıcı saklanır.

## v0.22.0 Scrolller feed video ve güvenli temizlik
- Video öğelerindeki global performance kaydı yedeği kaldırıldı; bağlantısız/blob reklam player'ları artık başka bir Scrolller videosunun URL'sini sahiplenip düğme oluşturamaz.
- Feed video posterleri play/video/duration sinyali ve içerik sayfası bağlantısıyla sınıflandırılır. Düğme, içerik sayfasının HTML verisinden doğrudan MP4/WebM kaynaklarını çözer; fotoğraf indirme yoluna düşmez.
- Feed video ve reklam ayrımı için geçerli Scrolller içerik URL'si zorunludur; viewer içindeki gerçek video öğeleri ayrıca kabul edilir.
- Öğe gizleyici fixed ataya otomatik tırmanmaz. Uygulama kökü, ana sayfa ve aktif viewer medya konteynerleri güvenlik filtresiyle gizlenemez; yalnızca işaret edilen alt popup/kontrol saklanır.
- Kart düğmeleri görünür oldukları sürece her animation frame'de medya dikdörtgeniyle eşlenir. Kısa süreli takip ve hover büyüme animasyonu kaldırıldı.

## v0.23.0 Scrolller GIF/MP4, reklam ve hover performansı
- Scrolller sayfa çözücüsü ana `og:video`, `og:image`, GIF metadata sinyalleri ve gerçek dosya uzantısını kullanır. GIF içerikler `.gif`, videolar öncelikle `.mp4` olarak indirilir ve klasör türü gerçek URL'ye göre belirlenir.
- Tam ekran/popup `Görünen medyayı indir` DOM'daki video öğesini seçmez; açık içerik sayfasının ana medyasını çözer. Böylece viewer içindeki reklam player'ı indirilemez.
- Video düğmesi için öğenin kendi kaynağının Scrolller/RedGifs CDN'inden gelmesi zorunludur. Harici reklam veya blob player'lar aday olmaz.
- Feed kart düğmeleri yalnızca medya hover'ında görünür; aktif kaydırmada gizlenir. Viewer/tam ekran ana medya düğmesi sürekli görünür kalır.
- Sürekli animation-frame takip döngüsü kaldırıldı. Konum yalnızca pointer, scroll, resize ve DOM değişiminde tek karede güncellenir; hover büyüme animasyonu yoktur.

## v0.23.1 Scrolller katmandan bağımsız hover
- Feed düğmesi görünürlüğü `media.matches(':hover')` kullanmaz. Son pointer koordinatının gerçek medya dikdörtgeninde olup olmadığı kontrol edilir.
- Scrolller'ın siyah fade/zoom kardeş katmanı hover hedefini ele geçirse bile düğme kaybolmaz; pointer medya alanından çıkınca gizlenir.

## v0.24.0 Coomer post indirme
- `coomer.st/{service}/user/{id}` ve `?o=50/100/...` profil sayfalarında önizleme düğmesi oluşturulmaz.
- Yalnızca post detayındaki doğrulanmış `main a.fileThumb[href]` ekleri indirme adayıdır. `ts-outstream-video` reklam player'ları genel medya taramasına girmez.
- Kullanıcı adı önce `.post__user-name`, sonra `.user-header__name`, sonra profil header span'ından alınır; URL kullanıcı kimliği son yedektir.
- Düzenli hedef `RedGifsDownloader/Coomer/{kullanıcı}/{Fotoğraflar|Videolar}` biçimindedir. Dosya etiketi varsa Coomer'ın `?f=` adı korunur.
- Popup'a Coomer post-ek buton ayarı, debug rehberine profil/sayfalama/görsel/video testleri eklendi.

## v0.24.1 Coomer video ve yerleşim düzeltmesi
- Post içindeki bütün doğrudan `*.coomer.st/data/` bağlantıları taranır; yalnızca `fileThumb` sınıfına bağlı değildir.
- Gerçek `<video>/<source>` ekleri de yakalanır. Harici reklam kaynakları Coomer veri alanında olmadığından düğme alamaz.
- Görsel bağlantısı `inline-block` kutuya çevrilerek düğme ekin sol üstüne sabitlenir.
- Oynatıcı kaynağı desteklemese bile doğrudan medya URL'si varsa video indirilebilir.
- Resmî API belgesine göre tek-post cevabı `post.file` ve `post.attachments` alanlarını kullanır. 2026-07-22 kontrolünde belgede listelenen `coomer.su/api` DNS'te çözülemedi, `coomer.st/api` ise bakım/timeout verdi; boş post DOM'u uzantının çözemeyeceği sunucu durumu olarak debug rehberinde ayrıca belirtilir.

## v0.24.2 Coomer BG21 düzeltmesi
- Coomer CDN'i servis worker içindeki kısa `fetch`/Range görsel doğrulamasını timeout'a düşürdüğü için gerçek ekler `BG21` ile yanlış reddediliyordu.
- Coomer postundaki alan adı ve `/data/` yolu önceden doğrulanmış gerçek ek URL'si artık ara ağ probu olmadan doğrudan `chrome.downloads` yöneticisine gönderilir.

## v0.24.3 Coomer sağ-tık benzeri görsel fallback'i
- Tam kalite `n*.coomer.st/data/` indirmesi önce denenir ve indirme ID'si alınmasının yanında gerçek bayt aktarımı da 2,5 saniye izlenir.
- Aktarım başlamaz veya hemen kesilirse yarım kalan istek iptal edilir; sayfada zaten yüklenmiş `img.coomer.st/thumbnail/data/` görseli ikinci aday olarak indirilir.
- Fallback dosyası da Coomer kullanıcı/Fotoğraflar klasörüne gider ve tam dosyanın `?f=` adı korunur.

## v0.24.4 Coomer hızlı görsel indirme
- Tam kalite CDN'i bazı isteklerde indirme ID'sini bile 10-15 saniye geciktirdiği için görünür görsel varsa sayfada yüklenmiş thumbnail ilk aday yapılır.
- Thumbnail aktarımı 0,9 saniyede başlamazsa tam kalite `/data/` URL'si ikinci aday olarak denenir. Klasör ve özgün `?f=` dosya adı korunur.

## Klasör sistemi (2026-07-04, yeniden yazıldı)
- Kullanıcı ayarlardan `mediaFolders` (dizi) tanımlar — bunlar **İndirilenler altında üst seviye klasörler**.
- İndirme butonuna basınca `window.rgChooseFolder()` menü açar; seçim `folderName` olarak `DIRECT_DOWNLOAD`'a gider.
- `background.filenameFor`: hedef = `folderName ? Downloads/{folderName}/dosya : Downloads/{downloadPath}/dosya`. **Fotolar/Videolar ayrımı YOK.**
- ÖNEMLİ: Codex'in eklediği `_folder.txt` işaret-dosyası sistemi (`CREATE_MEDIA_FOLDER`) KALDIRILDI — gereksizdi, `chrome.downloads` alt klasörü ilk indirmede otomatik oluşturur. Geri ekleme.
- Klasör seçici bağlı: redgifs (tüm run* handler'ları, modül `chosenFolder` + `sendDirectDownload` enjeksiyonu; Right-Shift hep ana klasör), reddit (4 handler: tekli+çoklu), scrolller (runDownload), instagram (kendi `withFolder` menüsü — renkli). Redgifs profil-tile navigasyonlu akışında seçim navigasyonda kaybolur → ana klasöre düşer (kabul edilebilir).

## Site notları / tuzaklar
- Reddit: yeni arayüz **shadow DOM** (`<shreddit-post>`); `deepQueryAll`/`deepClosest` ile del.
- Redgifs: niches feed'inde oynamayan postlar poster; `installWatchCardButtons` `/watch/` linkinden buton takar, slug ile API'den çözer. Feed indirmesi başarısızsa "Copy Link" akışına düşer.
- Instagram: özel web API (`/api/v1/media/{id}/info/`, `web_profile_info`, `feed/reels_media`) + `X-IG-App-ID: 936619743392459` + oturum çerezleri (kullanıcının takip ettiği gizli hesaplar çalışır). Tekli indirme API'den çözer (reels → VİDEO, kapak değil). Highlights/story = best-effort, test lazık.
- **UI metni Türkçe** (oyun projesinin İngilizce kuralı burada geçerli DEĞİL).

## Instagram indirme (2026-07-04, v0.12.1)
- Klasör özelliğinden sonra IG indirme bozuldu. Muhtemel neden: arka plandaki HEAD/range **erişilebilirlik probu** IG CDN'inde false-negative veriyordu.
- Çözüm: `DIRECT_DOWNLOAD` mesajına `skipReachability: true` eklendi; IG bunu gönderir → prob atlanır, URL'ler doğrudan indirilir (IG URL'leri resmi API'den, güvenilir). Ayrıca `.mp4` uzantısı olmayan reels video URL'lerini de indirir (eski `isDownloadUrl` filtresi bunları eliyordu).
- **Hata kodları eklendi** (durum baloncuğu + konsol `[rg-ig]`): IG01 hedef yok, IG02 mediaId boş, IG03 ağ, IG04 API <status> (giriş/takip), IG05 medya URL yok, IG06 arka plan bulamadı, IG07 runtime, IG08 boş URL, IG09 timeout; arka plan: BG10 boş URL, BG11 indirme hatası (chrome mesajı), BG20 erişilebilir medya yok (skipReachability'siz yollar için).

## Redgifs "Copy Link" regresyonu (2026-07-04, v0.12.3)
- Şikâyet: indirmeye basınca önce video linkini kopyalıyor (paylaşım menüsü) sonra indiriyor; eskiden anında iniyordu.
- Neden: arka plandaki HEAD/range erişilebilirlik probu redgifs CDN'inde 403 alıyor → doğrudan mp4 "erişilemez" sanılıp yavaş copyCurrentShareLink yedeğine düşüyor.
- Çözüm: background DIRECT_DOWNLOAD'da `resolveMediaViaRedgifs(fallbackSourceUrl)` (resmi API) sonucu artık **probsuz** doğrudan indiriliyor (`mode:"api-direct"`). API taze/güvenilir URL döndürdüğü için prob gereksiz. Böylece doğrudan yol başarılı olur → içerik tarafı copyCurrentShareLink'e düşmez.
- Teşhis: `[rg-redgifs] feed indirme {directUrls, fallbackUrl}`, `... doğrudan yol başarısız...`, `... Copy Link yedeği çalışıyor` konsol log'ları eklendi.

## Redgifs sayfa-tipi düzeltmeleri (2026-07-04, v0.13.0)
- Kök neden (önceki): CDN probu 403 → yavaş Copy Link / E_FAILED. Çözüm v0.12.4: `existsStatus` (403/401/405/429/416 = "var") + sayfa URL'leri önce denenir.
- v0.13.0: viewer indirmesi artık doğrudan yol başarısızsa Copy Link'e düşüyor (E_FAILED yerine çalışır) + `[rg-redgifs] viewer ...` log'u. Viewer butonu `videoContentRect` ile letterbox düzeltmeli konumlanıyor (video sol üstü, sayfa köşesi değil). Feed tile buton z-index 50→2147483000 (oynarken redgifs katmanının altında kalıyordu). Profil avatar indirme eklendi (`AVATAR_BUTTON_ID` + `findProfileAvatar`/`runAvatarDownload`, ayar `redgifsAvatarDownload`). Ayar "Görselleri indirme" (redgifsImages) KALDIRILDI → görseller artık her zaman indirilebilir (`includeImages=true`). Sayfalar: /explore/gifs, /explore/images, /niches hepsi redgifs.com — content-redgifs zaten `*.redgifs.com` match.
- HÂLÂ belirsiz (kullanıcı konsolu lazım): feed'de E_AD (direct fail→copyCurrentShareLink→clickVideoMoreMenu "ad" sanıyor) ve viewer E_FAILED kökü. `[rg-redgifs] feed/viewer indirme {directUrls, fallbackUrl}` log'larına bakılacak.

## Redgifs slug — KESİN KAYNAK (2026-07-05, v0.13.4)
- Redgifs feed/viewer videoları HLS blob (poster yok, /watch/ linki yok). Videonun class'ı `isLoaded` → eski gevşek slug çıkarımı bunu "watch/isloaded" yapıyordu (kök bug).
- **KESİN slug kaynağı:** her video `<div class="GifPreview ..." data-feed-item-id="{slug}">` sarmalayıcısında. Aktif/tam ekran olanda ayrıca `GifPreview_isActive` class'ı var. `slugFromFeedItem(video)` = `video.closest("[data-feed-item-id]")`. `activeFeedItemSlug()` = `.GifPreview_isActive[data-feed-item-id]`. Bunlar m3u8 tahmininden çok daha güvenilir (grid önizleme gürültüsünden etkilenmez). Tüm handler'lar artık önce bunu kullanıyor; `deriveCurrentShareUrl` de başında aktif slug'ı deniyor.
- Varyant filtresi (v0.13.3, background `bestPerMedia`): -silent/-mobile/-sd/-hd aynı base'de gruplanıp en iyisi seçilir (temiz {ad}.mp4 tercih); "ikisini birden indirme" biter. Reddit galerilerini etkilemez.
- Durum: 1 (feed) ✅, 6 (viewer) v0.13.4'te data-feed-item-id ile düzeltildi (test bekliyor). Kalan: 3 (/explore/images görsel .xml), 7 (avatar), 4 (sağ reklam butonu), 2 (explore/gifs) & niches teyidi.

## AÇIK SORUN — Scrolller
- İndirme butonu HİÇ görünmüyor (v0.12.0'da hâlâ). Kod mantıken doğru, reddit/redgifs aynı yöntemle çalışıyor → script muhtemelen o sayfada çalışmıyor.
- v0.12.0'a teşhis log'u eklendi: sayfa konsolunda `[rg-scrolller] content script yüklendi` ve `... butonu DOM'a eklendi` çıkmalı. Çıkmıyorsa script inject edilmiyor (site erişimi / eklenti reload / match sorunu). Kullanıcıdan konsol çıktısı bekleniyor.
