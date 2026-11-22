"""MNIST SNN-vs-ANN benchmark endpoints.

``GET /benchmark`` serves the cached results (``app/benchmark/results.json``).
``POST /benchmark/run`` retrains both models in a background thread and
streams progress as Server-Sent Events; it requires the optional PyTorch
dependencies and only one run can be active at a time.
"""
from __future__ import annotations

import asyncio
import json
import threading

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from ..auth import User, current_user
from ..benchmark import mnist

router = APIRouter(prefix="/benchmark", tags=["benchmark"])


class RunRequest(BaseModel):
    train_size: int = Field(30_000, ge=1_000, le=60_000)
    test_size: int = Field(5_000, ge=500, le=10_000)
    epochs: int = Field(5, ge=1, le=10)
    timesteps: int = Field(32, ge=8, le=100)
    hidden: int = Field(256, ge=32, le=1024)


class _Job:
    def __init__(self):
        self.lock = threading.Lock()
        self.running = False
        self.state: dict = {"stage": "idle", "progress": 0.0, "message": ""}
        self.error: str | None = None

    def update(self, stage, frac, msg, extra):
        self.state = {"stage": stage, "progress": round(frac, 4), "message": msg, **(extra or {})}


job = _Job()


@router.get("")
def get_results() -> dict:
    res = mnist.load_results()
    if res is None:
        raise HTTPException(404, "No benchmark results yet. Run `python -m app.benchmark.mnist` or POST /benchmark/run.")
    return {**res, "can_run": mnist.torch_available()}


@router.post("/run")
async def run(req: RunRequest, _user: User = Depends(current_user)):
    if not mnist.torch_available():
        raise HTTPException(501, "PyTorch is not installed on this server; install requirements-benchmark.txt to retrain.")
    with job.lock:
        if job.running:
            raise HTTPException(409, "A benchmark run is already in progress.")
        job.running, job.error = True, None
        job.update("start", 0.0, "Starting", None)

    def work():
        try:
            res = mnist.run_benchmark(**req.model_dump(), progress=job.update)
            mnist.RESULTS_PATH.write_text(json.dumps(res), encoding="utf-8")
        except Exception as exc:  # report any failure to the client
            job.error = f"{type(exc).__name__}: {exc}"
        finally:
            job.running = False

    threading.Thread(target=work, daemon=True).start()

    async def gen():
        last = None
        while True:
            snapshot = json.dumps(job.state)
            if snapshot != last:
                yield {"event": "progress", "data": snapshot}
                last = snapshot
            if not job.running:
                if job.error:
                    yield {"event": "error", "data": json.dumps({"message": job.error})}
                else:
                    yield {"event": "done", "data": json.dumps(mnist.load_results())}
                break
            await asyncio.sleep(0.5)

    return EventSourceResponse(gen(), ping=15)
