"""Export endpoints: spike raster as CSV and a PDF summary report."""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response

from .. import report
from ..auth import User, current_user
from ..config import settings
from ..engine.simulator import run
from ..schemas import Network
from .simulate import _build

router = APIRouter(prefix="/export", tags=["export"])


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "network"


def _run(net: Network) -> dict:
    return run(net, max_neurons=settings.max_neurons, max_steps=settings.max_steps)


@router.post("/csv")
async def export_csv(net: Network, _user: User = Depends(current_user)) -> Response:
    _build(net)
    result = await run_in_threadpool(_run, net)
    return Response(
        report.raster_csv(result),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{_slug(net.name)}-raster.csv"'},
    )


@router.post("/pdf")
async def export_pdf(net: Network, user: User = Depends(current_user)) -> Response:
    _build(net)

    def make() -> bytes:
        return report.pdf_report(net, _run(net), None if user.guest else user.name)

    pdf = await run_in_threadpool(make)
    return Response(
        pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{_slug(net.name)}-report.pdf"'},
    )
