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
# Further requests queue here, so simultaneous runs cannot exhaust server memory.
slots = asyncio.Semaphore(settings.max_concurrent)


def limits() -> dict:
    return {
        "max_neurons": settings.max_neurons,
        "max_steps": settings.max_steps,
        "max_synapses": settings.max_synapses,
    }


async def run_limited(net: Network) -> dict:
    """Run to completion off the event loop, mapping simulator errors to HTTP 422."""
    async with slots:
        try:
            return await run_in_threadpool(run, net, **limits())
        except SimulationError as exc:
            raise HTTPException(422, str(exc)) from exc


@router.post("")
async def simulate(net: Network, _user: User = Depends(current_user)) -> dict:
    """Run the whole simulation and return all recorded data at once."""
    return await run_limited(net)


@router.post("/stream")
async def simulate_stream(
    net: Network,
    request: Request,
    pace_ms: int = Query(0, ge=0, le=500, description="Minimum wall-clock delay between chunks, for live playback"),
    _user: User = Depends(current_user),
):
    """Stream ``meta``, ``chunk`` and ``done`` events (or ``error``) as the simulation runs."""

    async def gen():
        async with slots:
            try:
                sim = await run_in_threadpool(Simulator, net, **limits())
                events = sim.run_iter()
                while not await request.is_disconnected():
                    ev = await run_in_threadpool(next, events, _SENTINEL)
                    if ev is _SENTINEL:
                        break
                    yield {"event": ev["type"], "data": json.dumps(ev, separators=(",", ":"), allow_nan=False)}
                    if pace_ms and ev["type"] == "chunk":
                        await asyncio.sleep(pace_ms / 1000)
            except SimulationError as exc:
                yield {"event": "error", "data": json.dumps({"message": str(exc)})}

    return EventSourceResponse(gen(), ping=15)
