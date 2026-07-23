# Orion / iOS build

The same downloader, repackaged for Orion Browser on iPhone. Costs nothing, has no
7-day expiry, and needs no Mac.

## What is different from the Edge build

Nothing in the parsing. `content-redgifs.js`, `content-reddit.js`,
`content-scrolller-v2.js`, `content-coomer.js` and `content-instagram.js` are
copied out of `edge-extension/` at build time — they are never forked, so a
selector fix on the desktop side ships to the phone with the next build.

What changes is the transport and the touch layer:

| | Edge | Orion / iOS |
|---|---|---|
| Save path | `background.js` → `chrome.downloads` | `ios-bridge.js` → fetch → iOS share sheet |
| Background worker | service worker | none |
| Destination | `Downloads/RedGifsDownloader/{site}/...` | Photos (no folders — iOS has none) |
| Ripsnip fallback | yes | no (needs a second tab driven by the worker) |
| Button reveal | fade in on `:hover` | always visible — touch never fires `:hover` |
| Popup | every setting | only the ones a phone can honour |

`ios-bridge.js` patches `chrome.runtime.sendMessage` and answers `DIRECT_DOWNLOAD`
and `OPEN_TAB` itself. The site handlers cannot tell the difference.

## Mobile adaptations

The desktop handlers keep their buttons at `opacity: 0` until `:hover` matches. A
touch screen never fires `:hover`, so on the phone every button existed but was
invisible. Three layers fix that, in order of preference:

1. **`ios-mobile.css`** — loaded from the manifest on all five sites. Forces the
   buttons visible, floors them at Apple's 44px touch target, moves Reddit's user
   search trigger to the bottom-left above Orion's toolbar, and makes its panel
   full-width with 16px inputs so Safari does not zoom on focus. It also drops the
   RedGifs viewer button one button-height below the video's top-left corner,
   where RedGifs puts its own menu control. The handler sets that button's `top`
   inline, so the shift is a `margin-top` — a stylesheet `!important` outranks a
   plain inline style, and the button keeps tracking the video box.
2. **`ios-bridge.js`** — wraps `chrome.storage.local.get` so `buttonVisibility`
   always reads back as `"always"`, `rightShiftDownload` as `false` (no hardware
   keyboard) and `buttonSize` at 48px minimum, whatever is stored. It also injects
   the touch overrides into Scrolller's shadow roots, which the stylesheet cannot
   cross.
3. **The shared handlers** — two spots could not be reached from CSS and got a
   guarded `RG_SETTINGS.isTouchDevice()` check instead: Scrolller sets inline
   `pointer-events: none !important` from a pointer position touch never reports,
   and Instagram's `scheduleHide()` hides buttons the user is about to tap.

`isTouchDevice()` lives in `common/settings.js` and is a no-op on desktop.

## Build

```bash
npm run build:ios
```

Produces `dist/RedGifsDownloader-orion-ios.xpi` (a plain zip) and the unpacked
folder at `dist/orion-ios/`.

If Orion rejects the manifest v3 package, build the v2 one instead:

```bash
npm run build:ios:mv2
```

## Install on the iPhone

1. Install **Orion Browser** from the App Store (free).
2. Orion → `⋯` menu → Settings → Advanced → enable **Chrome and Firefox extensions**.
3. Get the `.xpi` onto the phone. Easiest with no cloud account — serve it from the
   laptop over the local network:

   ```bash
   python -m http.server 8777 --directory dist
   ```

   Find the laptop's LAN address with `ipconfig`, then open
   `http://<address>:8777/RedGifsDownloader-orion-ios.xpi` in Safari on the phone.
   Save it to Files when prompted.
4. Orion → `⋯` → Extensions → `+` → pick the file-based install option → choose the
   `.xpi` from Files.
5. Approve the permission prompt.

Extension support in Orion is still beta and the menu wording moves between
releases; the `+` button in the Extensions screen is the entry point.

## Using it

Tap the extension's download button, then choose **Save Image** / **Save Video** in
the share sheet. That is the whole flow for anything that downloads quickly.

`navigator.share()` needs transient user activation, and the download tap stays
valid for a few seconds, so the bridge fires the share sheet the moment the fetch
finishes. When the file is big enough that the fetch outlives the activation, the
sheet cannot open on its own — the panel then arms **Fotoğraflara kaydet** and one
more tap opens it. Nothing is lost either way; the file is already in memory.

Dismissing the share sheet keeps the file queued, so the button can retry it.

If a download fails, the panel offers **Yeni sekmede aç**. Long-pressing the media
on that page and choosing Save is the manual escape hatch.

The panel shows bytes transferred and the current rate. Coomer's CDN usually omits
`content-length`, so there is no percentage for it — a moving byte count is the
signal that the transfer is alive.

## Known limits

- **Photos has no folders.** The `downloadPath` / folder-layout settings do nothing
  here; only the filename survives.
- **Ripsnip fallback is gone.** Direct downloads only. It is off by default anyway.
- **Cross-origin fetches may be refused.** The bridge tries the request with
  credentials, then without, then falls back to opening the URL. Coomer and
  Instagram are the likeliest to need the fallback, since both gate media on
  cookies. Whichever mode a host accepts is remembered for the rest of the page's
  life, so repeat downloads from that CDN skip the wasted round trip.
- **Large videos load into memory** before sharing. A very long video may be slow
  or fail on a busy phone. Coomer video downloads are bound by its CDN and cannot
  be made much faster from here; what the bridge avoids is *adding* to the wait.
  For Coomer images it uses the already-rendered thumbnail, and drops a candidate
  that has not sent response headers within `transferTimeoutMs` instead of waiting
  out the CDN's own timeout.
- **The popup is trimmed, not ported.** Removed because they cannot work on a
  phone: download folder and folder layout (Photos has no folders), button
  visibility (forced to always), the Right Shift shortcut, the Scrolller element
  picker and its "download visible media" button (both need `chrome.scripting`),
  and the debug guide.
- Orion's extension engine is beta, so a working desktop feature can still be
  missing here.

## Packaging note

The build does **not** use `Compress-Archive`. Windows PowerShell 5.1 writes zip
entry names with backslashes, so `common/settings.js` ships as
`common\settings.js`; a loader that does not normalise that never finds
`RG_SETTINGS`, every handler throws on its first line, and no button appears on
any site. `scripts/build-orion-ios.js` goes through `System.IO.Compression`
directly and fails the build if a backslash entry slips back in.

## Test harness

`harness.html` runs the bridge against a fake extension environment in any desktop
browser — much faster than debugging on the phone.

```bash
npm run build:ios
python -m http.server 8777 --directory dist
```

Open `http://localhost:8777/__harness.html`. The page title shows the pass count.
It covers the message patch, the storage polyfill, the forced mobile settings,
shadow-root styling, filename derivation, candidate fall-through, the
all-candidates-failed path, the 44px touch target, and the three share outcomes
(auto-share, lost activation, dismissed sheet).

`navigator.share` / `canShare` are stubbed there: the real ones need a user
gesture and would otherwise open an OS dialog or start a real download mid-run.
