# TasuDownloader bulut katmanı — kurulum

İki parça, ikisi de ₺0:

| Parça | Nerede çalışır | Ne yapar |
|---|---|---|
| `server/` | **Senin PC'n** (bot sunucusuyla aynı makine) | Medya deposu: telefon indirdiklerini buraya yükler, buradan izler. Alan = diskin kadar. |
| `web/` | **Cloudflare Workers** | Link arşivin: uygulamadaki listeler + medya tarayıcı, her tarayıcıdan. |

Kim neyle açıyor:

- **Uygulama ve medya sunucusu** — tek gizli anahtar (`ARCHIVE_TOKEN`).
  Telefon ile PC'n bu anahtarla konuşur.
- **Web arşivi (tarayıcı)** — **Google girişi**, sadece
  `lsatvofficial@gmail.com`. Başka hiç kimse siteyi açamaz. Tarayıcıda
  anahtar yazman gerekmez; giriş yaptıktan sonra site anahtarı ve PC adresini
  kendisi alır.

Önce ortak anahtarı üret (PowerShell):

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```

Çıkan değeri bir yere kopyala — üç yere gireceksin: sunucu config'i (`token`),
Cloudflare `ARCHIVE_TOKEN` gizlisi, uygulamanın Ayarlar ekranı. Birazdan bir
de **oturum imza anahtarı** (`SESSION_SECRET`) üreteceksin; aynı komutu tekrar
çalıştırıp ikinci bir değer al, karıştırma.

## 1) PC medya sunucusu (5 dakika)

```powershell
cd C:\Users\lsatv\TasuDownloader\cloud\server
Copy-Item config.example.json config.json
notepad config.json
```

`config.json` içinde:
- `token` → ürettiğin anahtar
- `dir` → medyanın duracağı klasör (örn. `D:/TasuMedia` — bolluğu olan disk)

Başlat:

```powershell
node server.js
```

`http://localhost:8790` yazısını görünce çalışıyor. Otomatik başlatma için
`start-server.bat`'a bir kısayol yap ve `shell:startup` klasörüne at
(Win+R → `shell:startup`).

## 2) Tailscale Funnel — sunucuyu internete aç (10 dakika)

Alan adı, port yönlendirme, güvenlik duvarı ayarı **gerekmez**.

1. [tailscale.com/download](https://tailscale.com/download) → Windows'a kur →
   Google/GitHub hesabıyla giriş yap (ücretsiz).
2. PowerShell (yönetici):

```powershell
tailscale funnel --bg 8790
```

3. `tailscale funnel status` sana `https://<makine-adın>.<tailnet>.ts.net`
   biçiminde bir adres verir. **Bu adres medya sunucunun internet adresi** —
   uygulamaya ve web arşivine bunu gireceksin. Sabittir, PC yeniden başlasa da
   değişmez (`--bg` kalıcıdır).

Telefonda test: Safari'de `https://…ts.net/health?token=ANAHTAR` →
`{"ok":true,…}` görmelisin.

## 3) Supabase tablosu (2 dakika)

[supabase.com](https://supabase.com) → projen (`jtfynrxryryfjiolyuat`)
→ SQL Editor → `cloud/supabase.sql` içeriğini yapıştır → Run. (İstersen bunun
yerine yeni ücretsiz bir proje de açabilirsin; SQL aynı, sadece aşağıdaki
`SUPABASE_URL`'i o projeye göre değiştir.)

`service_role` anahtarını da not al: **Project Settings → API keys →
`service_role`** (ya da yeni format `sb_secret_…`). Bunu birazdan Cloudflare'e
gizli olarak gireceksin, başka hiçbir yere değil.

## 4) Google giriş istemcisi (10 dakika)

Siteye sadece senin girebilmen için Google OAuth istemcisi lazım. Ücretsiz.

1. [console.cloud.google.com](https://console.cloud.google.com) → Google
   hesabınla gir → üstten yeni bir proje aç (örn. "TasuArsiv").
2. Sol menü → **APIs & Services → OAuth consent screen**:
   - User type: **External** → Create.
   - App name: `Tasu Arşiv`, support e-posta: kendi Gmail'in. Kaydet, ilerle.
   - **Audience/Test users** ekranında **`lsatvofficial@gmail.com`**'u test
     kullanıcısı olarak ekle. (Uygulamayı "Publish" etmen gerekmez; test
     modunda kalabilir, sadece eklediğin kullanıcı girer — bu tam istediğimiz.)
3. Sol menü → **APIs & Services → Credentials → Create Credentials →
   OAuth client ID**:
   - Application type: **Web application**.
   - Name: `Tasu Arşiv Worker`.
   - **Authorized redirect URIs → Add URI** →
     `https://tasu-arsiv.<hesap-adın>.workers.dev/auth/callback`
     (`<hesap-adın>` = Cloudflare'deki workers.dev alt alanın; Bölüm 5'te
     Worker'ı deploy edince kesin adresi görürsün — buraya birebir onu yaz,
     sonundaki `/auth/callback` şart).
   - Create → sana bir **Client ID** (`…apps.googleusercontent.com`) ve bir
     **Client secret** (`GOCSPX-…`) verir. İkisini kopyala.

> Redirect URI'yi tam bilmek için önce Bölüm 5'i yapıp Worker'ın adresini
> öğrenmen daha kolay. Sıra: Worker'ı deploy et → adresi al → buraya redirect
> URI olarak gir → Client ID/secret'ı Cloudflare'e gizli olarak koy.

## 5) Cloudflare Worker sitesi (10 dakika)

Site bir **Worker**'dır (Pages değil). `public/` statik dosyalar olarak
sunulur, `/api/*` ve `/auth/*` istekleri `src/worker.js`'e düşer.

**Depoyu zaten bağladıysan** yapman gereken tek şey `Path` alanını
düzeltmek — Worker'ın yapılandırması depo kökünde değil, `cloud/web`
altında:

1. Cloudflare → **Workers & Pages** → projen → **Settings** → **Build**
   → **Build configuration** → **Edit**:

| Alan | Değer |
|---|---|
| Build command | *(boş)* |
| Deploy command | `npx wrangler deploy` |
| Non-production branch deploy command | `npx wrangler versions upload` |
| **Path** | **`cloud/web`** ← `/` ise build başarısız olur |

2. **Worker'ın adı `wrangler.jsonc` içindeki `name` ile aynı olmalı.**
   Depodaki değer `tasu-arsiv`. Panelde Worker'ın adı farklıysa ikisinden
   birini değiştir, yoksa deploy adım adım doğru gider ama yanlış Worker'a
   yazar.

3. **Settings → Variables and Secrets** → hepsini **Secret** türünde ekle:

| Değişken | Değer |
|---|---|
| `ARCHIVE_TOKEN` | ürettiğin ortak anahtar (sunucu + uygulama ile aynı) |
| `SESSION_SECRET` | ikinci ürettiğin rastgele değer (oturum çerezini imzalar) |
| `GOOGLE_CLIENT_ID` | Google'dan aldığın Client ID (`…apps.googleusercontent.com`) |
| `GOOGLE_CLIENT_SECRET` | Google'dan aldığın Client secret (`GOCSPX-…`) |
| `ALLOWED_EMAIL` | `lsatvofficial@gmail.com` (virgülle birden çok da olur) |
| `MEDIA_BASE` | PC'nin `…ts.net` adresi (Bölüm 2) |
| `SUPABASE_URL` | `https://jtfynrxryryfjiolyuat.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Supabase `service_role` (ya da `sb_secret_…`) |

4. **Deployments** sekmesi → **Retry deployment** (ya da yeni bir push).
5. Adresin: `https://tasu-arsiv.<hesap-adın>.workers.dev`. **Bu adresi al,
   Bölüm 4'teki redirect URI'nin başına koy** (`…/auth/callback`) — Google
   tarafı ile Worker adresi birebir aynı olmalı.
6. Siteyi aç → **Google ile giriş** → `lsatvofficial@gmail.com` seç → içeri
   girersin. Anahtar/adres yazman gerekmez, site `/api/config`'ten kendisi
   alır. Başka bir Google hesabıyla girersen "yetkili değil" der.

Sıfırdan kuruyorsan: **Workers & Pages → Create → Workers → Import a
repository** → `TasuDownloader` → yukarıdaki tabloyu uygula.

### Yerel deneme

```powershell
cd C:\Users\lsatv\TasuDownloader\cloud\web
Copy-Item .dev.vars.example .dev.vars   # değerleri doldur
npm install
npx wrangler dev
```

`http://localhost:8787` gerçek Worker çalışma zamanıdır — `/api/*` ve
`/auth/*` dahil her şey yayındaki gibi davranır. Yerelde gerçek Google
girişini denemek için Google istemcisine bir de
`http://localhost:8787/auth/callback` redirect URI'si eklemen gerekir.
`.dev.vars` git'e girmez.

## 6) Uygulama ayarları (1 dakika)

Telefonda TasuDownloader → **Ayarlar → Bulut ve Eşitleme**:

- Medya sunucusu: `https://<makine>.<tailnet>.ts.net`
- Arşiv sitesi: `https://tasu-arsiv.<hesap-adın>.workers.dev`
- Gizli anahtar: aynı anahtar
- **Bağlantıyı sına** → iki satır da ✓ olmalı (boş disk alanını da gösterir)
- "İndirilenler nereye": **Bulut** = cihazda yer kaplamaz; **İkisi** = hem
  Fotoğraflar hem bulut.

## Nasıl akıyor

```
telefon ──indir──▶ uygulama ──PUT /files──▶ PC (Tailscale Funnel, token'lı)
telefon ──listeler──▶ Worker /api/lists ──(Bearer token)──▶ Supabase (service key sadece Worker'da)
tarayıcı ──Google giriş──▶ tasu-arsiv.workers.dev ──(oturum çerezi)──▶ listeler + PC'deki medya
```

- Web arşivine **sadece** `lsatvofficial@gmail.com` girebilir. Worker giriş
  yapılmamış her isteği Google'a yollar; oturum çerezi olmayan `/api/*` isteği
  401 döner. Uygulama ise çereze değil `ARCHIVE_TOKEN`'a dayanır — bu yüzden
  Google katmanı uygulamayı hiç etkilemez.

- Medya **hiçbir üçüncü tarafa çıkmaz**: telefon ↔ senin PC'n. Tailscale
  sadece şifreli tünel taşır.
- Galeri → Seç → **Buluta yükle** ile telefonda önceden inmiş dosyaları da
  PC'ye atabilirsin.
- PC kapalıyken medya erişilemez (listeler erişilir — onlar Supabase'de).
  Bot sunucun zaten 7/24 açık olduğu için pratikte fark etmez.

## Sık sorunlar

- **Cloudflare "build failed":** neredeyse her zaman **Path** hâlâ `/`
  olduğu içindir — `npx wrangler deploy` depo kökünde yapılandırma arar,
  orada yoktur. `cloud/web` yap. İkinci sık neden: paneldeki Worker adı ile
  `wrangler.jsonc` içindeki `name` tutmuyor.
- **Google girişinde "redirect_uri_mismatch":** Google istemcisindeki
  Authorized redirect URI ile Worker adresin birebir aynı değil. Doğrusu
  `https://tasu-arsiv.<hesap-adın>.workers.dev/auth/callback` — sonunda
  `/auth/callback`, başında `https://`, ortada tam Worker adresi.
- **Giriş oluyor ama "yetkili değil" diyor:** yanlış Google hesabıyla
  girmişsin ya da `ALLOWED_EMAIL` gizlisi `lsatvofficial@gmail.com` değil.
- **"OAuth client was not found / invalid_client":** `GOOGLE_CLIENT_ID` ya da
  `GOOGLE_CLIENT_SECRET` gizlisi eksik/yanlış girilmiş.
- **Google "Access blocked / app not verified":** OAuth consent screen'de
  `lsatvofficial@gmail.com`'u **test kullanıcısı** olarak eklemedin.
- **Listeler "alınamadı" diyor:** `SUPABASE_URL` / `SUPABASE_SERVICE_KEY`
  eksik, ya da `cloud/supabase.sql` henüz çalıştırılmamış.
- **Uygulama "Bulut ✗" diyor:** PC'de `node server.js` çalışıyor mu?
  `tailscale funnel status` adresi gösteriyor mu? (Uygulama Google'a değil
  `ARCHIVE_TOKEN`'a bakar.)
- **Medya sekmesi web'de boş:** `MEDIA_BASE` gizlisi eklenmemiş ya da PC
  kapalı / `tailscale funnel` düşmüş. Çıkış yapıp tekrar gir.
