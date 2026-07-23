# Redgifs Ripsnip Helper

Yerel tek-video otomasyon yardimcisidir. Kullanim amaci yalnizca indirme hakkin veya acik iznin olan iceriklerdir. Captcha, giris duvari, odeme duvari, DRM, anti-bot veya filigran/atif kaldirma korumalarini asmaya calismaz.

## Kurulum

```powershell
cd C:\Users\lsatv\RedgifsRipsnipBot
npm install
npm run install-browser
```

## Edge'deki aktif videoyu indirme

Tavsiye edilen yeni yol: lokal Edge extension kullan. Ozel port veya ayri Edge profili gerektirmez.

Kurulum dosyasi:

```text
C:\Users\lsatv\RedgifsRipsnipBot\edge-extension
```

Edge'de `edge://extensions` ac, `Developer mode` ac, `Load unpacked` ile bu klasoru sec. Detay: `edge-extension\README.md`.

## Edge CDP modu

Bu mod Microsoft Edge kullanir ve Redgifs'te o an ekranda olan videonun paylasim linkini UI uzerinden kopyalamaya calisir.

1. Masaustunden `Start Controlled Edge for Redgifs.bat` dosyasini calistir.
2. Acilan Edge penceresinde Redgifs'e gir ve indirme hakkin olan videoya kadar kaydir.
3. Video ekrandayken masaustunden `Download Current Redgifs Video.bat` dosyasini calistir.
4. Bot Redgifs sekmesine baglanir, sag alttaki uc nokta > Share > Copy Link akisini yapar, sonra Ripsnip'i arka planda calistirir.

Not: Bot mevcut normal Edge penceresine baglanamaz. Redgifs'i ilk kisayolun actigi kontrol portlu Edge penceresinde kullanman gerekir.

## Clipboard'daki linki indirme

1. Indirme iznin olan Redgifs paylasim linkini kopyala.
2. Masaustundeki `Redgifs Ripsnip Bot.bat` kisayolunu calistir.
3. Ripsnip adimlari arka planda tamamlanir.

Komut satirindan dogrudan link vermek icin:

```powershell
cd C:\Users\lsatv\RedgifsRipsnipBot
npm start -- "https://www.redgifs.com/watch/..."
```

Ripsnip adimlarini gorerek test etmek icin:

```powershell
npm start -- --show-ripsnip "https://www.redgifs.com/watch/..."
```

Indirilen dosyalar:

```text
C:\Users\lsatv\RedgifsRipsnipBot\downloads
```

## Notlar

- Ripsnip varsayilan olarak arka planda Edge ile calisir.
- Redgifs tarafinda link alma islemi mevcut kontrol portlu Edge sekmesinde yapilir; site UI'i degisirse selector/koordinat guncellemesi gerekebilir.
- Video yeni sekmede acilirsa tarayicinin uc nokta menusu yerine medya URL'si yakalanip dosya olarak indirilir.
- Bot kontrolu veya captcha cikarsa elle tamamlayabilirsin; otomasyon captcha asmaz.
