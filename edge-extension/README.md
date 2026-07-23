# Edge Extension

Local-only unpacked Microsoft Edge extension. It adds download controls to RedGifs, Reddit, Scrolller, and Instagram pages. Direct media downloads are preferred; Ripsnip is an optional fallback for RedGifs.

## Install

1. Open Edge.
2. Go to `edge://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select:

```text
C:\Users\lsatv\RedgifsRipsnipBot\edge-extension
```

## Use

1. Open Redgifs in normal Edge.
2. Scroll to the video you want.
3. Drag the round blue download button anywhere you want; the position is saved.
4. Click the blue `Download` button added by the extension.
5. Ripsnip opens in a background tab and the download starts through Edge Downloads when a direct media URL is found.

## Download folders

The default organized layout is:

```text
Downloads/RedGifsDownloader/{site}/{Fotoğraflar|Videolar}/{selected-folder}/file
```

RedGifs niche downloads use `Downloads/RedGifsDownloader/RedGifs/Niches/{niche}/file` without a photo/video split. The popup can switch back to the legacy layout. Custom folder names and the main download root are managed under `Global` settings.

Coomer post attachments use `Downloads/RedGifsDownloader/Coomer/{profile-name}/{Fotoğraflar|Videolar}/file`. Profile previews and paginated profile grids do not receive download buttons; controls are added only to direct Coomer data attachments on individual post pages. Direct `<video>/<source>` attachments are supported even when the site's player cannot play them, while third-party advertisement videos are excluded.
The Coomer handler passes validated `*.coomer.st/data/` URLs straight to the browser download manager because the CDN may reject or time out extension-side preflight probes.
When a Coomer thumbnail is already visible, the handler downloads that loaded image first, similar to saving the visible image from the browser context menu. The slow full-size CDN URL remains the fallback, while the organized destination and original attachment name are retained.

## Validation

From the project root:

```powershell
npm test
```

This validates the shared settings/folder contract, manifest assets, and JavaScript syntax.

## Debug guide

Open the extension popup and select `Debug rehberini aç`. The guide walks through site tests in order, records pass/fail results, supplies a site-specific read-only console diagnostic command for failures, and exports one JSON log.

For Scrolller, the popup also provides `Görünen medyayı indir`. This path does not depend on an in-page hover button and can inject the current Scrolller helper into an already-open tab on demand.

On Scrolller, every visible media card gets an always-visible download button at its top-left corner. The overlay follows the masonry layout's fixed card widths and variable heights while scrolling; the popup action remains available as a fallback.

The Scrolller popup section also has `Öğe gizle`, which starts a one-click picker for unwanted overlays or side panels. Hidden elements persist locally and can be restored with `Gizlenenleri geri getir`.

After code changes, open `edge://extensions` and click `Reload` on this extension, then refresh the Redgifs tab.


## Limits

- Use only for content you have rights or permission to download.
- It does not bypass captcha, login walls, paywalls, DRM, anti-bot systems, or attribution/watermark protections.
- If Redgifs or Ripsnip changes its UI, the selectors may need an update.
