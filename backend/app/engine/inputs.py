"""Input spike-train generators.

* ``poisson`` – homogeneous Poisson process: each neuron fires independently
  with probability ``rate·dt`` per step.
* ``rate``    – rate code: neuron *i* fires regularly at a rate spread
  linearly between ``rate_hz`` and ``rate_max_hz`` (random initial phase).
* ``pattern`` – user-supplied spike times per neuron, optionally repeated
  every ``period_ms``.
"""
from __future__ import annotations

from collections import defaultdict

import numpy as np

from ..schemas import InputSource


class InputGroup:
    def __init__(self, spec: InputSource, dt: float, duration: float, rng: np.random.Generator):
        self.spec = spec
        self.n = spec.count
        self.dt = dt
        self.rng = rng
        self.start = int(round(spec.start_ms / dt))
        self.stop = int(round((spec.stop_ms if spec.stop_ms is not None else duration) / dt))
        self.v = None  # inputs have no membrane voltage

        if spec.kind == "rate":
            hi = spec.rate_max_hz if spec.rate_max_hz is not None else spec.rate_hz
            self.rates = np.linspace(spec.rate_hz, hi, self.n)
            self.phase = rng.random(self.n)
        elif spec.kind == "pattern":
            self.schedule = self._build_schedule(spec, dt, duration)

    def _build_schedule(self, spec: InputSource, dt: float, duration: float) -> dict[int, np.ndarray]:
        sched: dict[int, list[int]] = defaultdict(list)
        pattern = (spec.pattern or [])[: self.n]
        period = spec.period_ms
        for i, times in enumerate(pattern):
            for t in times:
                repeats = int(duration // period) + 1 if period else 1
                for k in range(repeats):
                    tt = t + k * (period or 0) + spec.start_ms
                    if tt < duration:
                        sched[int(round(tt / dt))].append(i)
        return {k: np.array(v, dtype=int) for k, v in sched.items()}

    def step(self, step: int) -> np.ndarray:
        spikes = np.zeros(self.n, dtype=bool)
        if step < self.start or step >= self.stop:
            return spikes
        kind = self.spec.kind
        if kind == "poisson":
            spikes = self.rng.random(self.n) < self.spec.rate_hz * self.dt / 1000.0
        elif kind == "rate":
            self.phase += self.rates * self.dt / 1000.0
            spikes = self.phase >= 1.0
            self.phase[spikes] -= 1.0
        else:
            idx = self.schedule.get(step)
            if idx is not None:
                spikes[idx] = True
        return spikes
