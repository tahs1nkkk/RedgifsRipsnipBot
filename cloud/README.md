# TasuDownloader bulut katmanı — kurulum

Tek parça: her şey Cloudflare'de. Kendi PC'n sunucu **değil**.

| Parça | Nerede çalışır | Ne yapar |
|---|---|---|
| `web/` (Worker) | **Cloudflare Workers** | Site + API: uygulamadaki listeler, medya tarayıcı, yükleme/silme/izleme. |
| R2 bucket `tasu-media` | **Cloudflare R2** | Medya deposu. Telefon indirdiklerini buraya yükler, buradan izler. Alan pratikte sınırsız; ilk 10 GB ücretsiz, üstü ~GB başına aylık $0.015 (200 GB ≈ aylık ~$3), **dışa trafik ücretsiz**. |

Medya artık Worker'la aynı köken üzerinden (R2 binding'i) sunulur; ayrı bir
sunucu, Tailscale ya da PC'nin açık olması gerekmez.

Kim neyle açıyor:

- **Uygulama** — tek gizli anahtar (`ARCHIVE_TOKEN`). Telefon Worker ile bu
  anahtarla konuşur (Bearer başlığı; medya akışında `?token=…`).
- **Web arşivi (tarayıcı)** — **Google girişi**, sadece
  `lsatvofficial@gmail.com`. Başka hiç kimse siteyi açamaz. Tarayıcıda anahtar
  yazman gerekmez; giriş yaptıktan sonra her istek oturum çereziyle yetkilenir.

Önce iki rastgele değer üret. **PowerShell 5.1'de** (Windows'un varsayılanı)
`RandomNumberGenerator.GetBytes()` yoktur; şunu kullan:

```powershell
$b = New-Object byte[] 48; (New-Object System.Security.Cryptography.RNGCryptoServiceProvider).GetBytes($b); [Convert]::ToBase64String($b)
```

Komutu **iki kez** çalıştır, iki ayrı değer al:
- birincisi **`ARCHIVE_TOKEN`** — Cloudflare gizlisi + uygulamanın Ayarlar ekranı (iki yere aynısı),
- ikincisi **`SESSION_SECRET`** — oturum çerezini imzalar, sadece Cloudflare'e.

Karıştırma.

## 1) R2 deposu (5 dakika)

1. Cloudflare paneli → sol menü **R2** → ilk kez açıyorsan **Purchase R2 /
   ödeme yöntemi ekle**. Kart eklemek zorunlu ama ilk 10 GB ve aylık işlem
   kotası ücretsiz; ücret ancak deponu doldurdukça (200 GB ≈ ~$3/ay) başlar,
   dışa trafik hiç ücretlendirilmez.
2. **Create bucket** → ad **`tasu-media`** (Location: Automatic). Bu ad
   `web/wrangler.jsonc` içindeki `bucket_name` ile **birebir** aynı olmalı;
   farklı istiyorsan ikisini de değiştir.

Dilersen panel yerine komutla da açabilirsin:

```powershell
cd C:\Users\lsatv\TasuDownloader\cloud\web
npx wrangler r2 bucket create tasu-media
```

`wrangler.jsonc` içindeki binding bucket'ı Worker'a bağlar:

```jsonc
"r2_buckets": [
  { "binding": "MEDIA", "bucket_name": "tasu-media" }
]
```

Yani Worker `env.MEDIA` ile depoya erişir — **ayrı bir gizli/adres yok**,
deploy bağlamayı kendisi yapar. (Bucket önceden var olmalı; `wrangler deploy`
onu oluşturmaz.)

## 2) Supabase tablosu (2 dakika)

[supabase.com](https://supabase.com) → projen (`jtfynrxryryfjiolyuat`)
→ SQL Editor → `cloud/supabase.sql` içeriğini yapıştır → Run. (İstersen bunun
yerine yeni ücretsiz bir proje de açabilirsin; SQL aynı, sadece aşağıdaki
`SUPABASE_URL`'i o projeye göre değiştir.)

`service_role` anahtarını da not al: **Project Settings → API keys →
`service_role`** (ya da yeni format `sb_secret_…`). Bunu birazdan Cloudflare'e
gizli olarak gireceksin, başka hiçbir yere değil.

## 3) Google giriş istemcisi (10 dakika)

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
     (`<hesap-adın>` = Cloudflare'deki workers.dev alt alanın; Bölüm 4'te
     Worker'ı deploy edince kesin adresi görürsün — buraya birebir onu yaz,
     sonundaki `/auth/callback` şart).
   - Create → sana bir **Client ID** (`…apps.googleusercontent.com`) ve bir
     **Client secret** (`GOCSPX-…`) verir. İkisini kopyala.

> Redirect URI'yi tam bilmek için önce Bölüm 4'ü yapıp Worker'ın adresini
> öğrenmen daha kolay. Sıra: Worker'ı deploy et → adresi al → buraya redirect
> URI olarak gir → Client ID/secret'ı Cloudflare'e gizli olarak koy.

## 4) Cloudflare Worker sitesi (10 dakika)

Site bir **Worker**'dır (Pages değil). `public/` statik dosyalar olarak
sunulur, `/api/*` ve `/auth/*` istekleri `src/worker.js`'e düşer, `/api/media/*`
ise R2'ye.

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
| `ARCHIVE_TOKEN` | ürettiğin ortak anahtar (uygulama ile aynı) |
| `SESSION_SECRET` | ikinci ürettiğin rastgele değer (oturum çerezini imzalar) |
| `GOOGLE_CLIENT_ID` | Google'dan aldığın Client ID (`…apps.googleusercontent.com`) |
| `GOOGLE_CLIENT_SECRET` | Google'dan aldığın Client secret (`GOCSPX-…`) |
| `ALLOWED_EMAIL` | `lsatvofficial@gmail.com` (virgülle birden çok da olur) |
| `SUPABASE_URL` | `https://jtfynrxryryfjiolyuat.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Supabase `service_role` (ya da `sb_secret_…`) |

> R2 buraya **girmez** — depo bir gizli değil, `wrangler.jsonc`'daki `MEDIA`
> binding'idir (Bölüm 1). Paneldeki **Settings → Bindings** altında deploy'dan
> sonra `MEDIA → tasu-media` bağlamasını görmelisin.

4. **Deployments** sekmesi → **Retry deployment** (ya da yeni bir push).
5. Adresin: `https://tasu-arsiv.<hesap-adın>.workers.dev`. **Bu adresi al,
   Bölüm 3'teki redirect URI'nin başına koy** (`…/auth/callback`) — Google
   tarafı ile Worker adresi birebir aynı olmalı.
6. Siteyi aç → **Google ile giriş** → `lsatvofficial@gmail.com` seç → içeri
   girersin. Başka bir Google hesabıyla girersen "yetkili değil" der.

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
`/auth/*` dahil her şey yayındaki gibi davranır. `wrangler dev` R2 binding'i
için yerelde otomatik geçici bir depo (`.wrangler/state`) kullanır, gerçek
bucket'a dokunmaz. Yerelde gerçek Google girişini denemek için Google
istemcisine bir de `http://localhost:8787/auth/callback` redirect URI'si
eklemen gerekir. `.dev.vars` git'e girmez.

## 5) Uygulama ayarları (1 dakika)

Telefonda TasuDownloader → **Ayarlar → Bulut ve Eşitleme**:

- Worker adresi: `https://tasu-arsiv.<hesap-adın>.workers.dev`
- Gizli anahtar: `ARCHIVE_TOKEN` (Cloudflare'e girdiğinle aynı)
- **Bağlantıyı sına** → ✓ ve medya dosya sayısı gelmeli.
- "İndirilenler nereye": **Bulut** = cihazda yer kaplamaz; **İkisi** = hem
  Fotoğraflar hem bulut.

## Nasıl akıyor

```
telefon ──indir──▶ Worker /api/media/<ad> (PUT, Bearer token) ──▶ R2 (tasu-media)
telefon ──izle───▶ Worker /api/media/<ad>?token=… ──▶ R2 (Range destekli akış)
telefon ──listeler──▶ Worker /api/lists (Bearer) ──▶ Supabase (service key sadece Worker'da)
tarayıcı ──Google giriş──▶ tasu-arsiv.workers.dev ──(oturum çerezi)──▶ listeler + R2 medyası
```

- Web arşivine **sadece** `lsatvofficial@gmail.com` girebilir. Worker giriş
  yapılmamış her isteği Google'a yollar; oturum çerezi olmayan `/api/*` isteği
  401 döner. Uygulama ise çereze değil `ARCHIVE_TOKEN`'a dayanır — bu yüzden
  Google katmanı uygulamayı hiç etkilemez.
- Medya ve site aynı köken olduğu için tarayıcıda `<img>`/`<video>` çereze
  düşer, URL'de token taşınmaz; uygulamada AVPlayer başlık gönderemediği için
  akış `?token=…` ile yetkilenir. İkisini de Worker kabul eder.
- Galeri → Seç → **Buluta yükle** ile telefonda önceden inmiş dosyaları da
  R2'ye atabilirsin.
- Cloudflare 7/24 açık; PC'nin kapalı olması hiçbir şeyi etkilemez.

## Sık sorunlar

- **Cloudflare "build failed":** neredeyse her zaman **Path** hâlâ `/`
  olduğu içindir — `npx wrangler deploy` depo kökünde yapılandırma arar,
  orada yoktur. `cloud/web` yap. İkinci sık neden: paneldeki Worker adı ile
  `wrangler.jsonc` içindeki `name` tutmuyor.
- **Deploy'da "R2 bucket 'tasu-media' not found":** bucket'ı Bölüm 1'de
  oluşturmadın ya da adı `wrangler.jsonc`'daki `bucket_name` ile tutmuyor.
  Panelden ya da `npx wrangler r2 bucket create tasu-media` ile aç.
- **Medya sekmesi web'de boş ama hata yok:** henüz hiç dosya yüklemedin;
  telefondan bir indirme yapıp **Bulut**'a düşür ya da Galeri'den **Buluta
  yükle**.
- **Yükleme/izleme 401:** `ARCHIVE_TOKEN` gizlisi ile uygulamadaki anahtar
  aynı değil. İkisini de yeniden gir.
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
