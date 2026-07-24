# Debug notları — saha hata raporları (site site)

Kullanıcının uygulamayı bizzat kullanırken yaşadığı hata/eksik raporları. Her
site kendi dosyasında. **Amaç: hepsi toplanınca topluca düzeltmek** — çünkü
bazı hatalar aynı kök nedenden çıkar, birini çözmek birkaçını birden kapatır.
Her sitenin çözümü ayrıdır; ortak kök neden adayları dosya başında işaretlenir.

Bir siteyi düzeltmeye başlamadan önce o sitenin dosyasındaki **"Ortak kök neden
adayları"** bölümünü oku; tek tek raporları oradan takip et.

## Durum

| Site              | Rapor | Durum                                   |
|-------------------|-------|-----------------------------------------|
| Genel (site-üstü) | 9     | Düzeltildi — cihaz testi bekliyor       |
| Instagram         | 18    | Düzeltildi — cihaz testi bekliyor       |
| RedGifs           | 4     | Düzeltildi — cihaz testi bekliyor       |
| Scrolller         | 11    | Düzeltildi — cihaz testi bekliyor       |
| Reddit            | 11    | 9 düzeltildi, 2 ertelendi (#7, #11)     |
| Coomer            | 4     | Düzeltildi — cihaz testi bekliyor       |

**Tüm siteler toplandı (2026-07-24), aynı gün düzeltildi.** Toplam 57 rapor.
Uygulanan sıra: KÖK-A → isimlendirme/format → KÖK-LİSTE → KÖK-FAB-KAPSAM →
KÖK-SEÇİM-OVERLAY → KÖK-VIDEO-POSTER → KÖK-İNDİRME-İPTAL → KÖK-BULUT-* (Worker +
web arşiv) → KÖK-GALERİ-VIEWER (iOS bulut ızgarası + Arşiv sekmesi).

Kullanıcı kararıyla ertelenenler: Reddit#11 (pencere grupları + Liquid arama) ve
Reddit#7 (gönderi içine gömülü RedGifs algılaması).

Not: `genel.md` çapraz-kesen kök nedenler içerir (bulut meta/önizleme, liste
kaydı); sitelerin bazı raporları oraya bağlıdır.

## Mimari (tüm siteler için ortak)

- **Native FAB** (`ios-app/Sources/Browser/BrowserController.swift`):
  kısa dokunuş `window.__rgFabDownload()` (ekran ortasındaki medya), uzun basış
  `window.__rgFabPicker('start'|'confirm'|'cancel')` (neon çerçeveli seçim modu).
  İkisi de `ios-app/native-bridge.js` içinde.
- **Paylaşımlı site mantığı**: `edge-extension/content-<site>.js` derleme anında
  (`scripts/build-ios-app-js.js`) WebView'e gömülür. Eklentideki indirme
  butonları uygulamada **görünmez** (opacity:0) ama FAB, medyayı bulup üstündeki
  handler butonuna tıklayarak onu "URL çözücü" olarak kullanır.
- **`chrome.*` köprüsü** native-bridge.js'te taklit edilir; handler'lar
  eklenti mi uygulama mı içinde olduklarını ayırt edemez.
