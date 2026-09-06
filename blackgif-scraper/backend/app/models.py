from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    display_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    min_views: Mapped[int] = mapped_column(Integer, default=10000)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    media: Mapped[list["MediaItem"]] = relationship(back_populates="account")


class MediaItem(Base):
    __tablename__ = "media_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    gif_id: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"), nullable=True)
    title: Mapped[str | None] = mapped_column(String(300), nullable=True)
    url: Mapped[str] = mapped_column(Text)
    thumbnail_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    views: Mapped[int] = mapped_column(Integer, default=0)
    duration: Mapped[float | None] = mapped_column(Float, nullable=True)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="discovered")
    local_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    discovered_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    downloaded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    account: Mapped[Account | None] = relationship(back_populates="media")


class SyncJob(Base):
    __tablename__ = "sync_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(40), default="pending")
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    account_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    items_found: Mapped[int] = mapped_column(Integer, default=0)
    items_downloaded: Mapped[int] = mapped_column(Integer, default=0)
    items_failed: Mapped[int] = mapped_column(Integer, default=0)


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
