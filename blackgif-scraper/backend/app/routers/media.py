from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import SessionLocal, get_db
from ..models import Account, MediaItem, SyncJob
from ..schemas import CreatorFolderOut, DownloadUrlRequest, JobOut, MediaOut, StatsOut, SyncRequest
from ..services import sync as sync_service

router = APIRouter(tags=["media"])


def _media_out(db: Session, item: MediaItem) -> MediaOut:
    username = None
    if item.account_id:
        acc = db.get(Account, item.account_id)
        username = acc.username if acc else None
    if not username and item.local_path:
        try:
            username = Path(item.local_path).parent.name
        except Exception:
            username = None
    return MediaOut(
        id=item.id,
        gif_id=item.gif_id,
        account_id=item.account_id,
        username=username,
        title=item.title,
        url=item.url,
        thumbnail_url=item.thumbnail_url,
        views=item.views,
        duration=item.duration,
        status=item.status,
        local_path=item.local_path,
        error=item.error,
        published_at=item.published_at,
        discovered_at=item.discovered_at,
        downloaded_at=item.downloaded_at,
    )


@router.get("/library/folders", response_model=list[CreatorFolderOut])
def list_folders(db: Session = Depends(get_db)):
    return sync_service.list_creator_folders(db)


@router.get("/library", response_model=list[MediaOut])
def list_library(
    status: str | None = None,
    account_id: int | None = None,
    username: str | None = None,
    q: str | None = None,
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
):
    stmt = select(MediaItem).order_by(MediaItem.discovered_at.desc()).limit(limit)
    if status:
        stmt = stmt.where(MediaItem.status == status)
    if account_id:
        stmt = stmt.where(MediaItem.account_id == account_id)
    elif username:
        uname = username.strip().lstrip("@").lower()
        acc = db.scalar(select(Account).where(Account.username == uname))
        if acc:
            stmt = stmt.where(MediaItem.account_id == acc.id)
        else:
            # Orphan folder filter by path
            stmt = stmt.where(
                MediaItem.account_id.is_(None),
                MediaItem.local_path.ilike(f"%/{uname}/%"),
            )
    if q:
        like = f"%{q}%"
        stmt = stmt.where((MediaItem.title.ilike(like)) | (MediaItem.gif_id.ilike(like)))
    return [_media_out(db, i) for i in db.scalars(stmt).all()]


@router.post("/download", response_model=MediaOut)
async def download_url(payload: DownloadUrlRequest, db: Session = Depends(get_db)):
    try:
        item = await sync_service.download_by_url(db, payload.url)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, f"Download failed: {exc}") from exc
    return _media_out(db, item)


@router.post("/library/{media_id}/download", response_model=MediaOut)
async def download_one(media_id: int, db: Session = Depends(get_db)):
    item = db.get(MediaItem, media_id)
    if not item:
        raise HTTPException(404, "Media not found")
    await sync_service.download_media_id(db, media_id)
    db.refresh(item)
    return _media_out(db, item)


@router.get("/library/{media_id}/file")
def get_file(media_id: int, db: Session = Depends(get_db)):
    item = db.get(MediaItem, media_id)
    if not item or not item.local_path:
        raise HTTPException(404, "File not found")
    path = Path(item.local_path)
    if not path.exists():
        raise HTTPException(404, "File missing on disk")
    return FileResponse(path, filename=path.name)


@router.delete("/library/{media_id}", status_code=204)
def delete_media(media_id: int, db: Session = Depends(get_db)):
    item = db.get(MediaItem, media_id)
    if not item:
        raise HTTPException(404, "Media not found")
    if item.local_path:
        p = Path(item.local_path)
        if p.exists():
            p.unlink()
    db.delete(item)
    db.commit()


def _bg_sync_all(download: bool) -> None:
    import asyncio

    db = SessionLocal()
    try:
        asyncio.run(sync_service.sync_all(db, download=download))
    finally:
        db.close()


@router.post("/sync")
def start_sync(
    payload: SyncRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    if payload.account_id:
        acc = db.get(Account, payload.account_id)
        if not acc:
            raise HTTPException(404, "Account not found")

        def _one():
            import asyncio

            s = SessionLocal()
            try:
                a = s.get(Account, payload.account_id)
                if a:
                    asyncio.run(sync_service.sync_account(s, a, download=payload.download))
            finally:
                s.close()

        background_tasks.add_task(_one)
        return {"ok": True, "message": f"Sync started for @{acc.username}"}

    background_tasks.add_task(_bg_sync_all, payload.download)
    return {"ok": True, "message": "Sync started for all accounts"}


@router.get("/jobs", response_model=list[JobOut])
def list_jobs(limit: int = Query(30, ge=1, le=100), db: Session = Depends(get_db)):
    return db.scalars(select(SyncJob).order_by(SyncJob.created_at.desc()).limit(limit)).all()


@router.get("/stats", response_model=StatsOut)
def stats(db: Session = Depends(get_db)):
    build = getattr(sync_service, "build_stats", None) or getattr(sync_service, "build_stats")
    return build(db)
