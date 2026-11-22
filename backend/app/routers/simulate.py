"""Simulation endpoints: one-shot JSON and Server-Sent Events streaming."""
from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from sse_starlette.sse import EventSourceResponse

from ..auth import User, current_user
from ..config import settings
from ..engine.simulator import SimulationError, Simulator, run
from ..schemas import Network

router = APIRouter(prefix="/simulate", tags=["simulation"])

_SENTINEL = object()


def _build(net: Network) -> Simulator:
    try:
        return Simulator(net, max_neurons=settings.max_neurons, max_steps=settings.max_steps)
    except SimulationError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.post("")
async def simulate(net: Network, _user: User = Depends(current_user)) -> dict:
    """Run the whole simulation and return all recorded data at once."""
    _build(net)  # validate limits early with a 422
    return await run_in_threadpool(run, net, max_neurons=settings.max_neurons, max_steps=settings.max_steps)


@router.post("/stream")
async def simulate_stream(
    net: Network,
    request: Request,
    pace_ms: int = Query(0, ge=0, le=500, description="Minimum wall-clock delay between chunks, for live playback"),
    _user: User = Depends(current_user),
):
    """Stream ``meta``, ``chunk`` and ``done`` events as the simulation runs."""
    sim = _build(net)
    events = sim.run_iter()

    async def gen():
        while True:
            if await request.is_disconnected():
                break
            ev = await run_in_threadpool(next, events, _SENTINEL)
            if ev is _SENTINEL:
                break
            yield {"event": ev["type"], "data": json.dumps(ev, separators=(",", ":"))}
            if pace_ms and ev["type"] == "chunk":
                await asyncio.sleep(pace_ms / 1000)

    return EventSourceResponse(gen(), ping=15)
