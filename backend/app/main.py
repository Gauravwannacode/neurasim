"""FastAPI entry point for NeuraSim."""
from __future__ import annotations

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import __version__
from .auth import User, current_user
from .config import settings
from .routers import benchmark, export, presets, simulate, sweep

app = FastAPI(title="NeuraSim API", version=__version__, description="Spiking Neural Network simulator backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
    """FastAPI's default minus the echoed input, which may be huge or NaN (not valid JSON)."""
    detail = [{"loc": list(e["loc"]), "msg": e["msg"], "type": e["type"]} for e in exc.errors()]
    return JSONResponse({"detail": detail}, status_code=422)


app.include_router(simulate.router)
app.include_router(sweep.router)
app.include_router(benchmark.router)
app.include_router(presets.router)
app.include_router(export.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "version": __version__, "auth": settings.auth_enabled}


@app.get("/me")
def me(user: User = Depends(current_user)) -> dict:
    return {"id": user.id, "email": user.email, "name": user.name, "guest": user.guest}
