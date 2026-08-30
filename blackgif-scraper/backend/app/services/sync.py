"""Sync & download orchestration."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import Account, MediaItem, SyncJob
from .redgifs import redgifs_client

logger = logging.getLogger(__name__)


def _username(db: Session, item: MediaItem) -> str | None:
    if item.account_id:
        acc = db.get(Account, item.account_id)
        return acc.username if acc else None
    return None


async def sync_account(db: Session, account: Account, *, download: bool = True) -> SyncJob:
    job = SyncJob(
        kind="sync",
        status="running",
        account_id=account.id,
        message=f"Syncing @{account.username}",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    try:
        profile = await redgifs_client.get_user_profile(account.username)
        account.display_name = profile.get("name") or profile.get("username") or account.username
        account.avatar_url = (
            profile.get("profileImageUrl")
            or profile.get("thumbnail")
            or account.avatar_url
        )

        trending = await redgifs_client.list_user_gifs(account.username, order="trending", pages=2)
        newest = await redgifs_client.list_user_gifs(account.username, order="new", pages=2)
        by_id = {g.gif_id: g for g in trending + newest}

        found = 0
        queued_ids: list[int] = []
        for info in by_id.values():
            existing = db.scalar(select(MediaItem).where(MediaItem.gif_id == info.gif_id))
            if existing:
                existing.views = max(existing.views, info.views)
                if info.thumbnail_url and not existing.thumbnail_url:
                    existing.thumbnail_url = info.thumbnail_url
                continue

            status = "queued" if info.views >= account.min_views else "skipped"
            if status == "queued":
                found += 1

            item = MediaItem(
                gif_id=info.gif_id,
                account_id=account.id,
                title=info.title,
                url=info.url,
                thumbnail_url=info.thumbnail_url,
                views=info.views,
                duration=info.duration,
                width=info.width,
                height=info.height,
                status=status,
                published_at=info.published_at,
            )
            db.add(item)
            db.flush()
            if status == "queued":
                queued_ids.append(item.id)

        account.last_synced_at = datetime.utcnow()
        job.items_found = found
        job.message = f"Found {found} viral items for @{account.username}"
        db.commit()

        downloaded = failed = 0
        if download:
            for mid in queued_ids:
                if await download_media_id(db, mid):
                    downloaded += 1
                else:
                    failed += 1

        job.items_downloaded = downloaded
        job.items_failed = failed
        job.status = "completed"
        job.finished_at = datetime.utcnow()
        job.message = (
            f"@{account.username}: {found} viral, {downloaded} downloaded, {failed} failed"
        )
        db.commit()
    except Exception as exc:
        logger.exception("Sync failed for %s", account.username)
        job.status = "failed"
        job.message = str(exc)
        job.finished_at = datetime.utcnow()
        db.commit()

    db.refresh(job)
    return job


async def sync_all(db: Session, *, download: bool = True) -> SyncJob:
    job = SyncJob(kind="sync", status="running", message="Syncing all accounts")
    db.add(job)
    db.commit()
    db.refresh(job)

    accounts = db.scalars(select(Account).where(Account.enabled.is_(True))).all()
    total_found = total_dl = total_fail = 0
    try:
        for acc in accounts:
            child = await sync_account(db, acc, download=download)
            total_found += child.items_found
            total_dl += child.items_downloaded
            total_fail += child.items_failed
        job.items_found = total_found
        job.items_downloaded = total_dl
        job.items_failed = total_fail
        job.status = "completed"
        job.message = f"Synced {len(accounts)} accounts — {total_found} viral, {total_dl} downloaded"
        job.finished_at = datetime.utcnow()
        db.commit()
    except Exception as exc:
        job.status = "failed"
        job.message = str(exc)
        job.finished_at = datetime.utcnow()
        db.commit()

    db.refresh(job)
    return job


async def download_media_id(db: Session, media_id: int) -> bool:
    item = db.get(MediaItem, media_id)
    if not item:
        return False
    if item.status == "done" and item.local_path:
        return True

    item.status = "downloading"
    item.error = None
    db.commit()

    try:
        username = _username(db, item) or "unknown"
        dest = settings.downloads_path / username
        path = await redgifs_client.download(item.url, dest, item.gif_id)
        item.local_path = str(path)
        item.status = "done"
        item.downloaded_at = datetime.utcnow()
        db.commit()
        return True
    except Exception as exc:
        logger.exception("Download failed for %s", item.gif_id)
        item.status = "failed"
        item.error = str(exc)[:500]
        db.commit()
        return False


async def download_by_url(db: Session, url: str) -> MediaItem:
    info = await redgifs_client.get_gif(url)
    existing = db.scalar(select(MediaItem).where(MediaItem.gif_id == info.gif_id))
    if existing and existing.status == "done" and existing.local_path:
        return existing

    account = None
    if info.username:
        account = db.scalar(select(Account).where(Account.username == info.username))

    if existing:
        item = existing
        item.views = max(item.views, info.views)
        item.title = info.title or item.title
        item.thumbnail_url = info.thumbnail_url or item.thumbnail_url
    else:
        item = MediaItem(
            gif_id=info.gif_id,
            account_id=account.id if account else None,
            title=info.title,
            url=info.url,
            thumbnail_url=info.thumbnail_url,
            views=info.views,
            duration=info.duration,
            width=info.width,
            height=info.height,
            status="queued",
            published_at=info.published_at,
        )
        db.add(item)
        db.commit()
        db.refresh(item)

    await download_media_id(db, item.id)
    db.refresh(item)
    return item


def build_stats(db: Session) -> dict:
    total_accounts = db.scalar(select(func.count()).select_from(Account)) or 0
    active_accounts = (
        db.scalar(select(func.count()).select_from(Account).where(Account.enabled.is_(True))) or 0
    )
    total_media = db.scalar(select(func.count()).select_from(MediaItem)) or 0
    downloaded = (
        db.scalar(select(func.count()).select_from(MediaItem).where(MediaItem.status == "done")) or 0
    )
    queued = (
        db.scalar(
            select(func.count())
            .select_from(MediaItem)
            .where(MediaItem.status.in_(["queued", "discovered", "downloading"]))
        )
        or 0
    )
    failed = (
        db.scalar(select(func.count()).select_from(MediaItem).where(MediaItem.status == "failed"))
        or 0
    )
    total_views = db.scalar(select(func.coalesce(func.sum(MediaItem.views), 0))) or 0

    days = []
    today = datetime.utcnow().date()
    for i in range(6, -1, -1):
        day = today - timedelta(days=i)
        start = datetime.combine(day, datetime.min.time())
        end = start + timedelta(days=1)
        count = (
            db.scalar(
                select(func.count())
                .select_from(MediaItem)
                .where(MediaItem.downloaded_at >= start, MediaItem.downloaded_at < end)
            )
            or 0
        )
        days.append({"date": day.isoformat(), "count": count})

    top = db.execute(
        select(
            Account.username,
            func.count(MediaItem.id),
            func.coalesce(func.sum(MediaItem.views), 0),
        )
        .outerjoin(MediaItem, MediaItem.account_id == Account.id)
        .group_by(Account.id)
        .order_by(func.coalesce(func.sum(MediaItem.views), 0).desc())
        .limit(5)
    ).all()

    statuses = db.execute(select(MediaItem.status, func.count()).group_by(MediaItem.status)).all()

    return {
        "total_accounts": total_accounts,
        "active_accounts": active_accounts,
        "total_media": total_media,
        "downloaded": downloaded,
        "queued": queued,
        "failed": failed,
        "total_views_tracked": int(total_views),
        "downloads_last_7_days": days,
        "top_accounts": [{"username": u, "media": m, "views": int(v)} for u, m, v in top],
        "status_breakdown": [{"status": s, "count": c} for s, c in statuses],
    }
