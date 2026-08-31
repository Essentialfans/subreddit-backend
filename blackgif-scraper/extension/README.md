# BlackGif Scraper — Browser Extension

Chrome/Edge (Manifest V3) companion for the local BlackGif Scraper API.

## Features

- **Popup** — connection status, stats, Sync all, API URL / auth token / default min views
- **RedGifs profile pages** — floating **Track account** → adds user + starts sync
- **RedGifs watch pages** — floating **Download** → saves clip into your library
- Badge shows approximate library activity

## Install (Chrome / Edge)

1. Start the BlackGif backend: `uvicorn app.main:app --port 8000`
2. Open `chrome://extensions` (or `edge://extensions`)
3. Enable **Developer mode**
4. **Load unpacked** → select this `extension/` folder
5. Open the popup, confirm status is **Online**

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
- `https://www.redgifs.com/*` — inject Track/Download UI
