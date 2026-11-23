"""Export endpoints: spike raster as CSV and a PDF summary report."""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response

from .. import report
from ..auth import User, current_user
from ..schemas import Network
from .simulate import run_limited

router = APIRouter(prefix="/export", tags=["export"])


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "network"


@router.post("/csv")
async def export_csv(net: Network, _user: User = Depends(current_user)) -> Response:
    result = await run_limited(net)
    return Response(
        report.raster_csv(result),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{_slug(net.name)}-raster.csv"'},
    )


@router.post("/pdf")
async def export_pdf(net: Network, user: User = Depends(current_user)) -> Response:
    result = await run_limited(net)
    pdf = await run_in_threadpool(report.pdf_report, net, result, None if user.guest else user.name)
    return Response(
        pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{_slug(net.name)}-report.pdf"'},
    )
