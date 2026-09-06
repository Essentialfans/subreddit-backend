"""RedGifs API client + yt-dlp downloads."""

from __future__ import annotations

import asyncio
import logging
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

from ..config import settings

# Ensure asyncio is available for sleep/to_thread even if import order shifts

logger = logging.getLogger(__name__)

API_BASE = "https://api.redgifs.com/v2"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
GIF_ID_RE = re.compile(
    r"(?:redgifs\.com/(?:watch|ifr)/|thumbs\d*\.redgifs\.com/)([A-Za-z0-9]+)",
    re.I,
)


@dataclass
class GifInfo:
    gif_id: str
    url: str
    title: str | None
    thumbnail_url: str | None
    media_url: str | None
    views: int
    duration: float | None
    width: int | None
    height: int | None
    published_at: datetime | None
    username: str | None


class RedGifsClient:
    def __init__(self) -> None:
        self._token: str | None = None
        self._token_expires: float = 0
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        # Recreate client per event loop (background threads use asyncio.run)
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None
        if (
            self._client is None
            or self._client.is_closed
            or getattr(self, "_loop_id", None) != id(loop)
        ):
            if self._client is not None and not self._client.is_closed:
                try:
                    await self._client.aclose()
                except Exception:
                    pass
            self._client = httpx.AsyncClient(
                timeout=settings.request_timeout_seconds,
                headers={
                    "User-Agent": USER_AGENT,
                    "Origin": "https://www.redgifs.com",
                    "Referer": "https://www.redgifs.com/",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
            )
            self._loop_id = id(loop)
            # Force token refresh on new client/loop
            self._token = None
        return self._client

    async def _ensure_token(self, client: httpx.AsyncClient, *, force: bool = False) -> str:
        if not force and self._token and time.time() < self._token_expires - 60:
            return self._token
        resp = await client.get(f"{API_BASE}/auth/temporary")
        resp.raise_for_status()
        self._token = resp.json()["token"]
        self._token_expires = time.time() + 23 * 3600
        return self._token

    def _headers(self, token: str, context_url: str) -> dict[str, str]:
        # Required by RedGifs temporary-token sender checks (same as yt-dlp)
        return {
            "Authorization": f"Bearer {token}",
            "x-customheader": context_url,  # yt-dlp RedGifs extractor header
        }

    @staticmethod
    def parse_gif_id(url_or_id: str) -> str | None:
        url_or_id = url_or_id.strip()
        if re.fullmatch(r"[A-Za-z0-9]+", url_or_id):
            return url_or_id.lower()
        m = GIF_ID_RE.search(url_or_id)
        return m.group(1).lower() if m else None

    @staticmethod
    def _parse_gif(raw: dict[str, Any]) -> GifInfo:
        gif_id = (raw.get("id") or raw.get("gifId") or "").lower()
        urls = raw.get("urls") or {}
        thumb = urls.get("thumbnail") or urls.get("poster") or urls.get("hd") or urls.get("sd")
        create = raw.get("createDate") or raw.get("publishedAt")
        published = None
        if isinstance(create, (int, float)):
            published = datetime.fromtimestamp(create, tz=timezone.utc).replace(tzinfo=None)
        elif isinstance(create, str):
            try:
                published = datetime.fromisoformat(create.replace("Z", "+00:00")).replace(tzinfo=None)
            except ValueError:
                published = None
        tags = raw.get("tags") or []
        title = " ".join(tags) if tags else (raw.get("title") or gif_id)
        user = raw.get("userName") or (raw.get("user") or {}).get("username")
        media = urls.get("hd") or urls.get("sd") or urls.get("gif")
        return GifInfo(
            gif_id=gif_id,
            url=f"https://www.redgifs.com/watch/{gif_id}",
            title=title,
            thumbnail_url=thumb,
            media_url=media,
            views=int(raw.get("views") or raw.get("viewCount") or 0),
            duration=float(raw["duration"]) if raw.get("duration") is not None else None,
            width=raw.get("width"),
            height=raw.get("height"),
            published_at=published,
            username=user.lower() if isinstance(user, str) else None,
        )

    async def _api_get(self, ep: str, context_url: str, params: dict | None = None) -> dict[str, Any]:
        client = await self._get_client()
        token = await self._ensure_token(client)
        for attempt in range(2):
            resp = await client.get(
                f"{API_BASE}/{ep}",
                headers=self._headers(token, context_url),
                params=params,
            )
            if resp.status_code == 401 and attempt == 0:
                token = await self._ensure_token(client, force=True)
                continue
            if resp.status_code == 404:
                raise ValueError(f"Not found: {ep}")
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, dict) and data.get("error"):
                raise RuntimeError(f"RedGifs error: {data['error']}")
            return data
        raise RuntimeError("RedGifs auth failed")

    async def get_user_profile(self, username: str) -> dict[str, Any]:
        username = username.lower()
        try:
            data = await self._api_get(
                f"users/{username}",
                f"https://www.redgifs.com/users/{username}",
            )
            return data.get("user") or data
        except ValueError:
            gifs = await self.list_user_gifs(username, order="new", pages=1)
            if not gifs:
                return {"username": username, "name": username}
            return {
                "username": username,
                "name": username,
                "profileImageUrl": gifs[0].thumbnail_url,
            }

    async def list_user_gifs(
        self,
        username: str,
        *,
        order: str = "new",
        count: int = 40,
        pages: int = 3,
    ) -> list[GifInfo]:
        username = username.lower()
        api_order = {"new": "recent", "recent": "recent", "trending": "trending", "top": "top"}.get(
            order, order
        )
        results: list[GifInfo] = []
        context = f"https://www.redgifs.com/users/{username}"
        for page in range(1, pages + 1):
            data = await self._api_get(
                f"users/{username}/search",
                context,
                params={"order": api_order, "count": count, "page": page},
            )
            gifs = data.get("gifs") or []
            for g in gifs:
                info = self._parse_gif(g)
                if info.gif_id:
                    results.append(info)
            if not gifs:
                break
            total_pages = data.get("pages")
            if isinstance(total_pages, int) and page >= total_pages:
                break
            await asyncio.sleep(0.25)
        return results

    async def get_gif(self, gif_id_or_url: str) -> GifInfo:
        gif_id = self.parse_gif_id(gif_id_or_url)
        if not gif_id:
            raise ValueError("Invalid RedGifs URL or ID")
        data = await self._api_get(
            f"gifs/{gif_id}?views=yes",
            f"https://www.redgifs.com/watch/{gif_id}",
        )
        return self._parse_gif(data.get("gif") or data)

    async def download(self, url: str, dest_dir: Path, gif_id: str) -> Path:
        """Download media via direct CDN URL from the API (more reliable than yt-dlp here)."""
        dest_dir.mkdir(parents=True, exist_ok=True)
        info = await self.get_gif(url if "://" in url else gif_id)
        media_url = info.media_url
        if not media_url:
            raise RuntimeError(f"No media URL for {gif_id}")

        # Infer extension from URL
        ext = "mp4"
        if ".webm" in media_url:
            ext = "webm"
        elif ".gif" in media_url and ".mp4" not in media_url:
            ext = "gif"
        dest = dest_dir / f"{gif_id}.{ext}"

        client = await self._get_client()
        async with client.stream(
            "GET",
            media_url,
            headers={
                "User-Agent": USER_AGENT,
                "Referer": "https://www.redgifs.com/",
                "Origin": "https://www.redgifs.com",
            },
            follow_redirects=True,
        ) as resp:
            resp.raise_for_status()
            with dest.open("wb") as f:
                async for chunk in resp.aiter_bytes(65536):
                    f.write(chunk)
        if not dest.exists() or dest.stat().st_size == 0:
            raise RuntimeError("Download produced empty file")
        return dest


redgifs_client = RedGifsClient()
