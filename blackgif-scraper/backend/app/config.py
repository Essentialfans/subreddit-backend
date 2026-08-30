from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "BlackGif Scraper"
    api_prefix: str = "/api"
    cors_origins: str = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173"

    data_dir: Path = Path(__file__).resolve().parents[2] / "data"
    download_dir: Path | None = None
    database_url: str | None = None

    sync_interval_minutes: int = 60
    default_min_views: int = 10000
    max_concurrent_downloads: int = 2
    request_timeout_seconds: float = 30.0
    auth_token: str | None = None

    @property
    def downloads_path(self) -> Path:
        path = self.download_dir or (self.data_dir / "downloads")
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def db_url(self) -> str:
        if self.database_url:
            return self.database_url
        self.data_dir.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{self.data_dir / 'blackgif.db'}"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
