from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import SessionLocal, get_db
from ..models import Account, MediaItem
from ..schemas import AccountCreate, AccountOut, AccountUpdate
from ..services import sync as sync_service
from ..services.redgifs import redgifs_client

router = APIRouter(prefix="/accounts", tags=["accounts"])


def _out(db: Session, acc: Account) -> AccountOut:
    media_count = (
        db.scalar(select(func.count()).select_from(MediaItem).where(MediaItem.account_id == acc.id))
        or 0
    )
    downloaded = (
        db.scalar(
            select(func.count())
            .select_from(MediaItem)
            .where(MediaItem.account_id == acc.id, MediaItem.status == "done")
        )
        or 0
    )
    return AccountOut(
        id=acc.id,
        username=acc.username,
        display_name=acc.display_name,
        enabled=acc.enabled,
        min_views=acc.min_views,
        avatar_url=acc.avatar_url,
        last_synced_at=acc.last_synced_at,
        created_at=acc.created_at,
        media_count=media_count,
        downloaded_count=downloaded,
    )


@router.get("", response_model=list[AccountOut])
def list_accounts(db: Session = Depends(get_db)):
    rows = db.scalars(select(Account).order_by(Account.created_at.desc())).all()
    return [_out(db, a) for a in rows]


@router.post("", response_model=AccountOut, status_code=201)
async def create_account(payload: AccountCreate, db: Session = Depends(get_db)):
    if db.scalar(select(Account).where(Account.username == payload.username)):
        raise HTTPException(409, "Account already tracked")

    display_name = payload.username
    avatar_url = None
    try:
        sample = await redgifs_client.list_user_gifs(payload.username, pages=1)
        if not sample:
            raise ValueError(f"User not found or has no public gifs: {payload.username}")
        profile = await redgifs_client.get_user_profile(payload.username)
        display_name = profile.get("name") or profile.get("username") or payload.username
        avatar_url = profile.get("profileImageUrl") or profile.get("thumbnail")
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, f"Could not reach RedGifs: {exc}") from exc

    acc = Account(
        username=payload.username,
        display_name=display_name,
        min_views=payload.min_views,
        enabled=payload.enabled,
        avatar_url=avatar_url,
    )
    db.add(acc)
    db.commit()
    db.refresh(acc)
    sync_service.write_creator_profile(db, username=acc.username, account=acc)
    return _out(db, acc)


@router.patch("/{account_id}", response_model=AccountOut)
def update_account(account_id: int, payload: AccountUpdate, db: Session = Depends(get_db)):
    acc = db.get(Account, account_id)
    if not acc:
        raise HTTPException(404, "Account not found")
    if payload.min_views is not None:
        acc.min_views = payload.min_views
    if payload.enabled is not None:
        acc.enabled = payload.enabled
    db.commit()
    db.refresh(acc)
    return _out(db, acc)


@router.delete("/{account_id}", status_code=204)
def delete_account(account_id: int, db: Session = Depends(get_db)):
    acc = db.get(Account, account_id)
    if not acc:
        raise HTTPException(404, "Account not found")
    db.delete(acc)
    db.commit()


def _bg_sync(account_id: int, download: bool) -> None:
    import asyncio

    db = SessionLocal()
    try:
        acc = db.get(Account, account_id)
        if acc:
            asyncio.run(sync_service.sync_account(db, acc, download=download))
    finally:
        db.close()


@router.post("/{account_id}/sync")
def sync_one(
    account_id: int,
    background_tasks: BackgroundTasks,
    download: bool = False,
    db: Session = Depends(get_db),
):
    acc = db.get(Account, account_id)
    if not acc:
        raise HTTPException(404, "Account not found")
    background_tasks.add_task(_bg_sync, account_id, False)
    return {"ok": True, "message": f"Sync started for @{acc.username} (catalog only)"}
