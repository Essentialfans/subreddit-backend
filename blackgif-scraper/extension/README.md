# BlackGif Scraper — Browser Extension

Chrome/Edge (Manifest V3) companion for the local BlackGif Scraper API.

## Features

- **Popup** — Add to library / Track creator on the active RedGifs tab, paste watch URL fallback, Sync all, settings
- **Niches / feeds** — detects the playing gif via CDN + API hooks (no need for `/watch/` in the URL)
- **Profile pages** — floating **Track** + popup **Track account**
- **Watch pages** — floating **Download** → saves clip into your library
- Badge shows approximate library activity

## Install (Chrome / Edge)

1. Start the BlackGif backend: `uvicorn app.main:app --port 8000`
2. Open `chrome://extensions` (or `edge://extensions`)
3. Enable **Developer mode**
4. **Load unpacked** → select this `extension/` folder (or click **Reload** after `git pull`)
5. Refresh any open RedGifs tabs, then open the popup — status should be **Online**

### Niches feed tip

Play a gif, wait ~1s, reopen the popup. **Add to library** enables when the gif id is detected; **Track creator** enables when the username is visible. You can also paste a watch URL / gif id into the popup and hit **Save**.

## Settings

| Field | Default | Notes |
|---|---|---|
| API base URL | `http://127.0.0.1:8000` | Must match your scraper |
| Auth token | empty | Same as server `AUTH_TOKEN` if set |
| Default min views | `10000` | Used when tracking from a profile |

## How sync works

All network calls go through the **background service worker** (host permissions), so RedGifs page scripts never hit CORS.

```
RedGifs page / popup
        │  chrome.runtime.sendMessage
        ▼
 service worker  ──fetch──►  BlackGif API  (:8000)
```

## Permissions

- `storage` — settings
- `http://127.0.0.1:8000/*` / `localhost` — local API
- `https://*.redgifs.com/*` — inject Track/Download UI + read media URLs
