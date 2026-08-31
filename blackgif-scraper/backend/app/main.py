import logging
from contextlib import asynccontextmanager
from pathlib import Path

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import SessionLocal, init_db
from .routers import accounts, media, settings as settings_router
from .services import sync as sync_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("blackgif")
scheduler = AsyncIOScheduler()


async def scheduled_sync() -> None:
    db = SessionLocal()
    try:
        logger.info("Scheduled sync starting")
        await sync_service.sync_all(db, download=False)
    except Exception:
        logger.exception("Scheduled sync failed")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    settings.downloads_path.mkdir(parents=True, exist_ok=True)
    scheduler.add_job(
        scheduled_sync,
        "interval",
        minutes=settings.sync_interval_minutes,
        id="sync_all",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("BlackGif Scraper ready — sync every %s min", settings.sync_interval_minutes)
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list or ["*"],
    # Chrome/Firefox extension origins (popup + content pages)
    allow_origin_regex=r"^chrome-extension://.*$|^moz-extension://.*$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def optional_auth(request: Request, call_next):
    if settings.auth_token and request.url.path.startswith(settings.api_prefix):
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            auth = request.headers.get("Authorization", "")
            if auth != f"Bearer {settings.auth_token}":
                from fastapi.responses import JSONResponse

                return JSONResponse({"detail": "Unauthorized"}, status_code=401)
    return await call_next(request)


app.include_router(accounts.router, prefix=settings.api_prefix)
app.include_router(media.router, prefix=settings.api_prefix)
app.include_router(settings_router.router, prefix=settings.api_prefix)


@app.get("/api/health")
def health():
    return {"status": "ok", "app": settings.app_name}


_candidates = [
    Path(__file__).resolve().parents[2] / "frontend" / "dist",
    Path(__file__).resolve().parents[1] / "frontend" / "dist",
]
STATIC_DIR = next((p for p in _candidates if p.exists()), _candidates[0])
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        index = STATIC_DIR / "index.html"
        candidate = STATIC_DIR / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(index)
