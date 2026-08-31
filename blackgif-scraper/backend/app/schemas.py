from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class AccountCreate(BaseModel):
    username: str = Field(min_length=1, max_length=120)
    min_views: int = Field(default=10000, ge=0)
    enabled: bool = True

    @field_validator("username")
    @classmethod
    def clean_username(cls, v: str) -> str:
        v = v.strip().lstrip("@")
        if v.startswith("http"):
            v = v.rstrip("/").split("/")[-1]
        return v.lower()


class AccountUpdate(BaseModel):
    min_views: int | None = Field(default=None, ge=0)
    enabled: bool | None = None


class AccountOut(BaseModel):
    id: int
    username: str
    display_name: str | None
    enabled: bool
    min_views: int
    avatar_url: str | None
    last_synced_at: datetime | None
    created_at: datetime
    media_count: int = 0
    downloaded_count: int = 0

    model_config = {"from_attributes": True}


class MediaOut(BaseModel):
    id: int
    gif_id: str
    account_id: int | None
    username: str | None = None
    title: str | None
    url: str
    thumbnail_url: str | None
    views: int
    duration: float | None
    status: str
    local_path: str | None
    error: str | None
    published_at: datetime | None
    discovered_at: datetime
    downloaded_at: datetime | None

    model_config = {"from_attributes": True}


class CreatorFolderOut(BaseModel):
    """One library folder per creator — profile + aggregated stats."""

    username: str
    display_name: str | None = None
    account_id: int | None = None
    avatar_url: str | None = None
    profile_url: str
    folder_path: str
    tracked: bool = False
    media_count: int = 0
    downloaded_count: int = 0
    total_views: int = 0
    first_post_at: datetime | None = None
    last_synced_at: datetime | None = None


class DownloadUrlRequest(BaseModel):
    url: str = Field(min_length=8)
    save_file: bool = False


class SyncRequest(BaseModel):
    account_id: int | None = None
    download: bool = False


class JobOut(BaseModel):
    id: int
    kind: str
    status: str
    message: str | None
    account_id: int | None
    created_at: datetime
    finished_at: datetime | None
    items_found: int
    items_downloaded: int
    items_failed: int

    model_config = {"from_attributes": True}


class StatsOut(BaseModel):
    total_accounts: int
    active_accounts: int
    total_media: int
    downloaded: int
    queued: int
    failed: int
    total_views_tracked: int
    downloads_last_7_days: list[dict]
    top_accounts: list[dict]
    status_breakdown: list[dict]


class SettingsOut(BaseModel):
    sync_interval_minutes: int
    default_min_views: int
    max_concurrent_downloads: int
    download_dir: str


class SettingsUpdate(BaseModel):
    sync_interval_minutes: int | None = Field(default=None, ge=5, le=1440)
    default_min_views: int | None = Field(default=None, ge=0)
    max_concurrent_downloads: int | None = Field(default=None, ge=1, le=8)
