from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import AppSetting
from ..schemas import SettingsOut, SettingsUpdate

router = APIRouter(prefix="/settings", tags=["settings"])


def _get(db: Session, key: str, default: str) -> str:
    row = db.get(AppSetting, key)
    return row.value if row else default


def _set(db: Session, key: str, value: str) -> None:
    row = db.get(AppSetting, key)
    if row:
        row.value = value
    else:
        db.add(AppSetting(key=key, value=value))


@router.get("", response_model=SettingsOut)
def get_settings(db: Session = Depends(get_db)):
    return SettingsOut(
        sync_interval_minutes=int(
            _get(db, "sync_interval_minutes", str(settings.sync_interval_minutes))
        ),
        default_min_views=int(_get(db, "default_min_views", str(settings.default_min_views))),
        max_concurrent_downloads=int(
            _get(db, "max_concurrent_downloads", str(settings.max_concurrent_downloads))
        ),
        download_dir=str(settings.downloads_path),
    )


@router.patch("", response_model=SettingsOut)
def update_settings(payload: SettingsUpdate, db: Session = Depends(get_db)):
    if payload.sync_interval_minutes is not None:
        _set(db, "sync_interval_minutes", str(payload.sync_interval_minutes))
    if payload.default_min_views is not None:
        _set(db, "default_min_views", str(payload.default_min_views))
    if payload.max_concurrent_downloads is not None:
        _set(db, "max_concurrent_downloads", str(payload.max_concurrent_downloads))
    db.commit()
    return get_settings(db)
