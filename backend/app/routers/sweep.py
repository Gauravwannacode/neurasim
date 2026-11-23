"""Parameter sweeps: run one network many times, changing a single value each time."""
from __future__ import annotations

import json
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sse_starlette.sse import EventSourceResponse

from ..auth import User, current_user
from ..config import settings
from ..engine.simulator import SimulationError, Simulator
from ..schemas import Network
from .simulate import limits, slots

router = APIRouter(prefix="/sweep", tags=["sweep"])

# What may be swept. Sizes are excluded: changing them changes what is compared.
FIELDS: dict[str, set[str]] = {
    "population": {"bias", "noise", "v_th", "t_ref", "tau_syn", "tau_m", "adapt_b"},
    "input": {"rate_hz"},
    "synapse": {"weight", "p_connect", "delay_ms"},
}
MAX_TOTAL_STEPS = 10  # sweeps may use at most this many times the single-run step limit


class SweepRequest(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    network: Network
    kind: Literal["population", "input", "synapse"]
    id: str = Field(max_length=100)
    field: str = Field(max_length=40)
    values: list[Annotated[float, Field(ge=-1e6, le=1e6)]] = Field(min_length=2, max_length=25)


def variant(req: SweepRequest, value: float) -> Network:
    """Copy of the network with the swept field set, fully re-validated."""
    data = req.network.model_dump()
    data["sim"]["record_per_population"] = 0
    data["sim"]["chunk_ms"] = min(10_000, max(1, data["sim"]["duration"]))
    group = {"population": "populations", "input": "inputs", "synapse": "synapses"}[req.kind]
    item = next(x for x in data[group] if x["id"] == req.id)
    (item["params"] if req.kind == "population" else item)[req.field] = value
    return Network.model_validate(data)


def measure(net: Network) -> dict:
    sim = Simulator(net, **limits())
    done = None
    for ev in sim.run_iter():
        if ev["type"] == "done":
            done = ev
    return {"rates": done["mean_rates"], "synops": done["energy"]["snn_synops"]}


@router.post("")
async def sweep(req: SweepRequest, request: Request, _user: User = Depends(current_user)):
    """Stream one ``point`` event per value, then ``done`` (or ``error``)."""
    if req.field not in FIELDS[req.kind]:
        raise HTTPException(422, f"Cannot sweep {req.field!r}; choose one of {sorted(FIELDS[req.kind])}.")
    group = {"population": req.network.populations, "input": req.network.inputs, "synapse": req.network.synapses}[req.kind]
    if not any(x.id == req.id for x in group):
        raise HTTPException(422, f"No {req.kind} with id {req.id!r} in this network.")
    steps = req.network.sim.duration / req.network.sim.dt * len(req.values)
    if steps > settings.max_steps * MAX_TOTAL_STEPS:
        raise HTTPException(422, "This sweep is too long. Use fewer points, a shorter duration or a larger dt.")

    async def gen():
        for i, value in enumerate(req.values):
            if await request.is_disconnected():
                return
            try:
                net = variant(req, value)
                async with slots:
                    result = await run_in_threadpool(measure, net)
            except ValidationError as exc:
                reason = exc.errors()[0]["msg"].removeprefix("Value error, ")
                yield {"event": "error", "data": json.dumps({"message": f"{req.field} = {value:g} is not allowed: {reason}"})}
                return
            except SimulationError as exc:
                yield {"event": "error", "data": json.dumps({"message": f"{req.field} = {value:g}: {exc}"})}
                return
            data = {"value": value, "progress": (i + 1) / len(req.values), **result}
            yield {"event": "point", "data": json.dumps(data, allow_nan=False)}
        yield {"event": "done", "data": "{}"}

    return EventSourceResponse(gen(), ping=15)
