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
    # Potential synapses (n_pre x n_post, summed over projections); dense matrices, so this bounds memory.
    max_synapses: int = field(default_factory=lambda: int(os.getenv("MAX_SYNAPSES", "4000000")))
    max_concurrent: int = field(default_factory=lambda: int(os.getenv("MAX_CONCURRENT", "2")))
    # Optional regex for extra origins, e.g. your Vercel preview deployments.
    cors_origin_regex: str | None = field(default_factory=lambda: os.getenv("CORS_ORIGIN_REGEX") or None)
    data_dir: str = field(default_factory=lambda: os.getenv("DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data")))

    @property
    def auth_enabled(self) -> bool:
        return bool(self.supabase_jwt_secret or self.supabase_url)


settings = Settings()
