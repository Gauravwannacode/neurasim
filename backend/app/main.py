"""FastAPI entry point for NeuraSim."""
from __future__ import annotations

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .auth import User, current_user
from .config import settings
from .routers import benchmark, presets, simulate

app = FastAPI(title="NeuraSim API", version=__version__, description="Spiking Neural Network simulator backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(simulate.router)
app.include_router(benchmark.router)
app.include_router(presets.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "version": __version__, "auth": settings.auth_enabled}


@app.get("/me")
def me(user: User = Depends(current_user)) -> dict:
    return {"id": user.id, "email": user.email, "name": user.name, "guest": user.guest}
