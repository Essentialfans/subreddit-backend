# BlackGif Scraper — Browser Extension

Chrome/Edge (Manifest V3) companion for the local BlackGif Scraper API.

## Features

- **Popup** — Add to library / Track creator on the active RedGifs tab, paste watch URL fallback, Sync all, settings
- **Niches / feeds** — detects the playing gif via CDN + API hooks (no need for `/watch/` in the URL)
- **Profile pages** — floating **Track** + popup **Track account**
- **Watch pages** — floating **Download** → saves clip into your library
- Badge shows approximate library activity

## Install (Chrome / Edge)

1. **Keep the API Online permanently (recommended on Mac):**
   ```bash
   cd blackgif-scraper
   ./install-autostart-mac.sh
   ```
   This installs a LaunchAgent so the API starts at login and restarts if it dies.
2. Open `chrome://extensions` (or `edge://extensions`)
3. Enable **Developer mode**
4. **Load unpacked** → select this `extension/` folder (or click **Reload** after `git pull`)
5. Open the popup — status should be **Online**

If you see Offline, the local API at `http://127.0.0.1:8000` is not running. Run the install script above, then Refresh.

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
