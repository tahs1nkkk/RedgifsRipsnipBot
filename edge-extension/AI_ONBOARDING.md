# Yerel AI — Hızlı Bilgi Listesi

**Proje:** "RedGifs Downloader" — Edge/Chrome MV3 eklentisi. RedGifs, Reddit, Scrolller, Instagram'da tek tıkla medya indirme butonları ekler. UI metni **Türkçe**.

## Temel
1. **Konum:** `C:\Users\lsatv\TasuDownloader\edge-extension`. Güncel sürüm: **0.19.0**.
2. **Paketleme:** `Compress-Archive -Path 'edge-extension\*' -DestinationPath '..\RedgifsExtension.zip' -Force`. Her değişiklikte `manifest.json` `version`'ı artır. **Üst klasörü ASLA zip'leme** (node_modules = 138MB Playwright botu).
3. **Her zip'ten sonra:** eklentiyi reload ET **ve site sekmesini F5'le** — yoksa eski content script kalır ("Extension context invalidated", `chrome.runtime` undefined).
4. **Kör deneme yapma.** Her content script konsola `[rg-{site}]` log'u yazar; sorunları sayfa-konsolu teşhisiyle çöz (tahmin çok vakit kaybettirdi).

## Dosyalar
- `content-redgifs.js`, `content-reddit.js`, `content-scrolller.js`, `content-instagram.js`
- `content-folders.js` — ortak klasör seçici (`window.rgChooseFolder`), her sitenin scriptinden ÖNCE inject edilir
- `common/settings.js` — tek ortak ayar şeması, site tespiti ve indirme klasörü sözleşmesi
- `debug-guide.html/js/css` — sıralı manuel test rehberi; pass/fail, siteye özel konsol tanısı ve JSON log dışa aktarımı
- `background.js` — service worker; `DIRECT_DOWNLOAD` mesajını işler (erişilebilirlik kontrolü + indirme)
- `popup.html/js/css` — ayarlar (site başına `<details>` dropdown). Ayarlar: `chrome.storage.local` anahtarı **`rgRipsnipSettings`**.

## İndirme akışı
Content script medya URL'lerini toplar → `chrome.runtime.sendMessage({type:"DIRECT_DOWNLOAD", urls, ...})` → background indirir.
Mesaj alanları: `urls`, `folderName` (üst-seviye klasör), `subFolder` (ana klasör altında, niche için), `downloadAll` (çoklu), `skipReachability` (Instagram), `imageMode` (redgifs görsel, content-type kontrolü), `expectedSlug`, `fallbackSourceUrl`.
Varsayılan düzenli yol: `İndirilenler/{downloadPath}/{site}/{Fotoğraflar|Videolar}/{folderName}/dosya`. RedGifs niche yolu özel olarak `{downloadPath}/RedGifs/Niches/{niche}/dosya` olur ve medya türüne ayrılmaz. Popup'taki `folderLayout=legacy` eski yolu korur.

## Erişilebilirlik probu (KRİTİK gotcha — `mediaUrlReachable`)
- Sadece **redgifs host'ları** "403 = erişilebilir" muafiyeti alır (`isTrustedMediaHost`). Redgifs CDN worker probe'una 403 verir ama gerçek indirme çalışır.
- **HTML/XML content-type reddedilir** (güvenilmeyen host'larda) → `.htm`/`.xml` hata sayfaları inmez.
- Reddit: `i.redd.it` (orijinal) + `preview.redd.it` (imzalı) ikisi de aday olarak gönderilir; `bestPerMedia`/`mediaBaseKey` anahtar'a **host'u da katar** ki yedekler kaybolmasın. NSFW `i.redd.it` HTML döner → imzalı preview'a düşülür. Çoklu'da `reachableOnePerImage` görsel başına ilk çalışanı indirir.

## Site-özel gotcha'lar
- **Redgifs:** slug = `.GifPreview` üstündeki `data-feed-item-id` (blob video/URL güvenilmez). Görsel vs video ayrımı = **sayfa yolu** (`/explore/images` = görsel, class değil — ikisi de `.tileItem`). Reklamlar = `.creatorImage` + redgifs-dışı img host. Niche = `/niches/{ad}` → otomatik alt klasör (menü çıkmaz). Feed/viewer'da slug için `data-feed-item-id`; olmazsa HLS manifest'ten (`api.redgifs.com/v2/gifs/{slug}/hd.m3u8`). Varyant filtresi: `-silent`/`-mobile` atlanır, temiz `{ad}.mp4` tercih.
- **Reddit:** yeni arayüz **shadow DOM** (`<shreddit-post>`) → `deepQueryAll`/`deepClosest`. Tek overlay butonu merkezdeki aktif görsele gider. Sol-alt arama paneli: `author:` + **`t=all`** (gizli profil postlarını bulur; t=all olmadan boş görünür). Görseller `settings.redditImages` ile.
- **Instagram:** özel web API — header `X-IG-App-ID: 936619743392459` + oturum çerezleri (takip edilen gizli hesaplar çalışır). shortcode→mediaId = base64, **ilk 11 karakter** (paylaşım eki takılabiliyor). Tekli indirme API'den çözer (reels = VİDEO). Foto+müzik story'de `story_music_stickers` var → **görsel** indir (video siyah). Highlight mevcut item = performance'ta **en çok çekilen** .mp4'ü item'ların video_versions'larıyla eşleştir (preload off-by-one'a dikkat). Bildirimler sayfası (`/notifications`) + <70px önizleme → buton yok. Avatar: alt "profil" içerir VEYA parent yuvarlak (img değil).
- **Scrolller:** ⚠️ **HÂLÂ BOZUK** — indirme butonu hiç görünmüyor. `[rg-scrolller]` debug log'ları eklendi ama teşhis edilmedi. Sıradaki iş bu.

## İşbirliği
Claude + Codex + yerel AI birlikte. Detaylı geçmiş/notlar: `HANDOFF.md`. Değişmeden önce oku, sonra güncelle.
