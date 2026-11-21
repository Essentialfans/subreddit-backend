# BlackGif Scraper

Personal RedGifs account tracker + viral downloader with a dark analytics dashboard UI.

**Personal archive only.** Respect RedGifs terms and creator rights — do not redistribute downloads.

## Features

- Track RedGifs usernames with a per-account viral threshold (min views)
- Sync feeds, queue viral posts, download via direct CDN URLs
- Dashboard with stats, charts, jobs, and library
- Chrome/Edge extension that syncs Track/Download actions with the local API
- Local-first; Docker-ready for later multi-user deploy (`AUTH_TOKEN`)

## Quick start (local)

### Backend

```bash
cd blackgif-scraper/backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd blackgif-scraper/frontend
npm install
npm run dev
```

Open http://localhost:5173

## Browser extension

Chrome/Edge companion lives in `extension/`.

1. Start the backend on port 8000
2. Open `chrome://extensions` → Developer mode → **Load unpacked** → select `blackgif-scraper/extension`
3. On RedGifs: **Track account** (profile) or **Download** (watch page)
4. Popup shows Online/Offline, stats, and **Sync all**

See `extension/README.md` for details.

## Docker (deploy-ready)

```bash
cd blackgif-scraper
docker compose up --build
```

App: http://localhost:8000

Set `AUTH_TOKEN` in `docker-compose.yml` to require a Bearer token on write APIs. Paste the same token in **Settings** in the UI.

## Environment

| Variable | Default | Notes |
|---|---|---|
| `CORS_ORIGINS` | localhost Vite ports | Comma-separated |
| `SYNC_INTERVAL_MINUTES` | `60` | Background sync |
| `DEFAULT_MIN_VIEWS` | `10000` | Viral threshold |
| `AUTH_TOKEN` | unset | Optional deploy lock |
| `DOWNLOAD_DIR` | `../data/downloads` | Media storage |

## Project layout

```
blackgif-scraper/
  backend/app/     FastAPI + SQLite + RedGifs client
  frontend/        React + Vite + Tailwind dashboard
  extension/       Chrome/Edge MV3 companion
  data/            DB + downloads (gitignored)
  Dockerfile
  docker-compose.yml
```

## Notes

- Downloads land in `data/downloads/<username>/`
- Scheduler syncs enabled accounts on an interval
- Use **Accounts → Sync** or **Dashboard → Sync all** for an immediate run
