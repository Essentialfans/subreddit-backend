"""Sync & download orchestration."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from pathlib import Path

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
    if item.local_path:
        try:
            return Path(item.local_path).parent.name.lower() or None
        except Exception:
            return None
    return None


def write_creator_profile(
    db: Session,
    *,
    username: str,
    account: Account | None = None,
    display_name: str | None = None,
    avatar_url: str | None = None,
) -> Path:
    """Ensure downloads/<username>/ exists and write profile.json sidecar."""
    username = username.lower().strip()
    folder = settings.downloads_path / username
    folder.mkdir(parents=True, exist_ok=True)

    if account is None:
        account = db.scalar(select(Account).where(Account.username == username))

    q = select(MediaItem)
    if account:
        q = q.where(MediaItem.account_id == account.id)
    else:
        # Orphan downloads already under this folder name
        q = q.where(MediaItem.local_path.ilike(f"%/{username}/%"))

    items = db.scalars(q).all()
    total_views = sum(i.views or 0 for i in items)
    downloaded = sum(1 for i in items if i.status == "done")
    first_post = None
    for i in items:
        ts = i.published_at or i.discovered_at
        if ts and (first_post is None or ts < first_post):
            first_post = ts

    payload = {
        "username": username,
        "display_name": (account.display_name if account else None)
        or display_name
        or username,
        "avatar_url": (account.avatar_url if account else None) or avatar_url,
        "profile_url": f"https://www.redgifs.com/users/{username}",
        "tracked": bool(account),
        "media_count": len(items),
        "downloaded_count": downloaded,
        "total_views": int(total_views),
        "first_post_at": first_post.isoformat() if first_post else None,
        "last_synced_at": account.last_synced_at.isoformat() if account and account.last_synced_at else None,
        "folder": str(folder),
        "updated_at": datetime.utcnow().isoformat(),
        "videos": [
            {
                "gif_id": i.gif_id,
                "title": i.title,
                "views": i.views,
                "status": i.status,
                "published_at": i.published_at.isoformat() if i.published_at else None,
                "file": Path(i.local_path).name if i.local_path else None,
            }
            for i in sorted(items, key=lambda x: x.published_at or x.discovered_at or datetime.min)
        ],
    }
    path = folder / "profile.json"
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return path


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

        write_creator_profile(db, username=account.username, account=account)

        downloaded = failed = 0
        if download:
            for mid in queued_ids:
                if await download_media_id(db, mid):
                    downloaded += 1
                else:
                    failed += 1

        write_creator_profile(db, username=account.username, account=account)

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
        username = _username(db, item)
        if not username:
            try:
                info = await redgifs_client.get_gif(item.url)
                username = (info.username or "").lower() or None
                if username and not item.account_id:
                    acc = db.scalar(select(Account).where(Account.username == username))
                    if acc:
                        item.account_id = acc.id
            except Exception:
                username = None
        username = username or "unknown"
        dest = settings.downloads_path / username
        path = await redgifs_client.download(item.url, dest, item.gif_id)
        item.local_path = str(path)
        item.status = "done"
        item.downloaded_at = datetime.utcnow()
        db.commit()
        if username != "unknown":
            write_creator_profile(db, username=username)
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
        if account and not item.account_id:
            item.account_id = account.id
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
    if info.username:
        write_creator_profile(
            db,
            username=info.username,
            account=account,
            display_name=info.username,
        )
    return item


def list_creator_folders(db: Session) -> list[dict]:
    """Build one folder entry per creator (tracked accounts + orphan download dirs)."""
    folders: dict[str, dict] = {}

    accounts = db.scalars(select(Account).order_by(Account.username)).all()
    for acc in accounts:
        items = db.scalars(select(MediaItem).where(MediaItem.account_id == acc.id)).all()
        total_views = sum(i.views or 0 for i in items)
        downloaded = sum(1 for i in items if i.status == "done")
        first_post = None
        for i in items:
            ts = i.published_at or i.discovered_at
            if ts and (first_post is None or ts < first_post):
                first_post = ts
        folder_path = str(settings.downloads_path / acc.username)
        folders[acc.username] = {
            "username": acc.username,
            "display_name": acc.display_name or acc.username,
            "account_id": acc.id,
            "avatar_url": acc.avatar_url,
            "profile_url": f"https://www.redgifs.com/users/{acc.username}",
            "folder_path": folder_path,
            "tracked": True,
            "media_count": len(items),
            "downloaded_count": downloaded,
            "total_views": int(total_views),
            "first_post_at": first_post,
            "last_synced_at": acc.last_synced_at,
        }

    # Orphan / manual downloads sitting under downloads/<user>/
    orphans = db.scalars(select(MediaItem).where(MediaItem.account_id.is_(None))).all()
    for item in orphans:
        uname = None
        if item.local_path:
            try:
                parent = Path(item.local_path).parent.name.lower()
                if parent and parent != "downloads":
                    uname = parent
            except Exception:
                uname = None
        uname = uname or "unknown"
        if uname in folders:
            folders[uname]["media_count"] += 1
            folders[uname]["total_views"] += item.views or 0
            if item.status == "done":
                folders[uname]["downloaded_count"] += 1
            ts = item.published_at or item.discovered_at
            fp = folders[uname]["first_post_at"]
            if ts and (fp is None or ts < fp):
                folders[uname]["first_post_at"] = ts
            continue
        folders[uname] = {
            "username": uname,
            "display_name": uname,
            "account_id": None,
            "avatar_url": None,
            "profile_url": f"https://www.redgifs.com/users/{uname}"
            if uname != "unknown"
            else "https://www.redgifs.com/",
            "folder_path": str(settings.downloads_path / uname),
            "tracked": False,
            "media_count": 1,
            "downloaded_count": 1 if item.status == "done" else 0,
            "total_views": int(item.views or 0),
            "first_post_at": item.published_at or item.discovered_at,
            "last_synced_at": None,
        }

    return sorted(folders.values(), key=lambda f: (-f["total_views"], f["username"]))


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
