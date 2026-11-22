"""Runtime configuration read from environment variables."""
from __future__ import annotations

import os
from dataclasses import dataclass, field


def _split(value: str) -> list[str]:
    return [v.strip() for v in value.split(",") if v.strip()]


@dataclass(frozen=True)
class Settings:
    supabase_url: str = field(default_factory=lambda: os.getenv("SUPABASE_URL", "").rstrip("/"))
    supabase_jwt_secret: str = field(default_factory=lambda: os.getenv("SUPABASE_JWT_SECRET", ""))
    # When true, requests without a valid token are rejected even if Supabase is configured.
    require_auth: bool = field(default_factory=lambda: os.getenv("REQUIRE_AUTH", "false").lower() == "true")
    cors_origins: list[str] = field(
        default_factory=lambda: _split(os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"))
    )
    max_neurons: int = field(default_factory=lambda: int(os.getenv("MAX_NEURONS", "5000")))
    max_steps: int = field(default_factory=lambda: int(os.getenv("MAX_STEPS", "20000")))
    data_dir: str = field(default_factory=lambda: os.getenv("DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data")))

    @property
    def auth_enabled(self) -> bool:
        return bool(self.supabase_jwt_secret or self.supabase_url)


settings = Settings()
