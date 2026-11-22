"""Vectorised neuron models.

Each model holds the state of a whole population as NumPy arrays and advances
it by one time step with :meth:`step`, returning a boolean spike vector.
``current`` is the total input (synaptic + bias + noise) in the model's units.

Adding a model: subclass :class:`NeuronGroup`, implement ``step`` and register
it in :data:`MODELS`.
"""
from __future__ import annotations

import numpy as np

from ..schemas import NeuronParams


class NeuronGroup:
    """Base class: common refractory bookkeeping and the membrane voltage ``v``."""

    def __init__(self, n: int, params: NeuronParams, dt: float, rng: np.random.Generator):
        self.n = n
        self.p = params
        self.dt = dt
        self.rng = rng
        self.v = np.zeros(n)
        self.ref = np.zeros(n)  # remaining refractory time (ms)

    def step(self, current: np.ndarray) -> np.ndarray:  # pragma: no cover - abstract
        raise NotImplementedError


class LIF(NeuronGroup):
    r"""Leaky integrate-and-fire with optional spike-triggered adaptation.

    .. math:: \tau_m \dot V = -(V - V_{rest}) + I - w, \qquad \tau_w \dot w = -w

    On :math:`V \ge V_{th}`: emit spike, :math:`V \leftarrow V_{reset}`,
    :math:`w \leftarrow w + b`, and clamp for ``t_ref`` ms (Lapicque 1907;
    Gerstner & Kistler 2002).
    """

    def __init__(self, n, params, dt, rng):
        super().__init__(n, params, dt, rng)
        self.tau_m = params.tau_m or 20.0
        self.v_rest = params.v_rest if params.v_rest is not None else -65.0
        self.v_reset = params.v_reset if params.v_reset is not None else -70.0
        self.b = params.adapt_b or 0.0
        self.tau_w = params.tau_w or 100.0
        # Random initial voltages between reset and threshold avoid artificial synchrony.
        self.v = rng.uniform(self.v_reset, params.v_th, n) if n > 1 else np.full(n, self.v_rest)
        self.w = np.zeros(n)

    def step(self, current):
        dt = self.dt
        active = self.ref <= 0
        dv = (-(self.v - self.v_rest) + current - self.w) * (dt / self.tau_m)
        self.v = np.where(active, self.v + dv, self.v_reset)
        if self.b:
            self.w -= self.w * (dt / self.tau_w)
        self.ref = np.maximum(self.ref - dt, 0)
        spikes = self.v >= self.p.v_th
        if spikes.any():
            self.v[spikes] = self.v_reset
            self.ref[spikes] = self.p.t_ref
            if self.b:
                self.w[spikes] += self.b
        return spikes


class Izhikevich(NeuronGroup):
    r"""Izhikevich (2003) two-variable model.

    .. math:: \dot v = 0.04v^2 + 5v + 140 - u + I, \qquad \dot u = a(bv - u)

    On :math:`v \ge v_{peak}` (``v_th``, usually 30 mV): :math:`v \leftarrow c`,
    :math:`u \leftarrow u + d`. ``v`` is integrated in two half steps for
    numerical stability, as in the original paper.
    """

    def __init__(self, n, params, dt, rng):
        super().__init__(n, params, dt, rng)
        self.a = params.a if params.a is not None else 0.02
        self.b = params.b if params.b is not None else 0.2
        self.c = params.c if params.c is not None else -65.0
        self.d = params.d if params.d is not None else 8.0
        self.v = np.full(n, -65.0) + rng.uniform(0, 5, n)
        self.u = self.b * self.v

    def step(self, current):
        dt = self.dt
        if self.p.t_ref > 0:
            current = np.where(self.ref > 0, 0.0, current)
            self.ref = np.maximum(self.ref - dt, 0)
        for _ in range(2):
            self.v += 0.5 * dt * (0.04 * self.v**2 + 5 * self.v + 140 - self.u + current)
        self.u += dt * self.a * (self.b * self.v - self.u)
        spikes = self.v >= self.p.v_th
        if spikes.any():
            self.v[spikes] = self.c
            self.u[spikes] += self.d
            self.ref[spikes] = self.p.t_ref
        # Guard against overflow if a huge current is applied.
        np.clip(self.v, -120, self.p.v_th, out=self.v)
        return spikes


def _vtrap(x: np.ndarray, y: float) -> np.ndarray:
    """x / (exp(x/y) - 1), with the removable singularity at x = 0 handled."""
    small = np.abs(x / y) < 1e-6
    safe = np.where(small, 1.0, x)
    return np.where(small, y * (1 - x / y / 2), safe / np.expm1(safe / y))


class HodgkinHuxley(NeuronGroup):
    r"""Hodgkin & Huxley (1952) squid giant axon model.

    .. math:: C_m \dot V = I - g_{Na} m^3 h (V - E_{Na}) - g_K n^4 (V - E_K) - g_L (V - E_L)

    Gating variables use the exponential-Euler update and the membrane is
    sub-stepped at ≤ 0.025 ms so that the default ``dt`` of 0.1 ms is stable.
    A spike is an upward crossing of ``v_th`` (0 mV by default).
    """

    g_na, g_k, g_l = 120.0, 36.0, 0.3
    e_na, e_k, e_l = 50.0, -77.0, -54.387
    c_m = 1.0

    def __init__(self, n, params, dt, rng):
        super().__init__(n, params, dt, rng)
        self.v = np.full(n, -65.0) + rng.normal(0, 0.5, n)
        am, bm, ah, bh, an, bn = self._rates(self.v)
        self.m = am / (am + bm)
        self.h = ah / (ah + bh)
        self.nk = an / (an + bn)
        self.substeps = max(1, int(np.ceil(dt / 0.025)))
        self.h_dt = dt / self.substeps
        self.above = self.v >= params.v_th

    @staticmethod
    def _rates(v):
        am = 0.1 * _vtrap(-(v + 40), 10)
        bm = 4.0 * np.exp(-(v + 65) / 18)
        ah = 0.07 * np.exp(-(v + 65) / 20)
        bh = 1.0 / (1 + np.exp(-(v + 35) / 10))
        an = 0.01 * _vtrap(-(v + 55), 10)
        bn = 0.125 * np.exp(-(v + 65) / 80)
        return am, bm, ah, bh, an, bn

    def step(self, current):
        hdt = self.h_dt
        for _ in range(self.substeps):
            am, bm, ah, bh, an, bn = self._rates(self.v)
            for name, a, b in (("m", am, bm), ("h", ah, bh), ("nk", an, bn)):
                tau = 1.0 / (a + b)
                inf = a * tau
                x = getattr(self, name)
                setattr(self, name, inf + (x - inf) * np.exp(-hdt / tau))
            i_ion = (
                self.g_na * self.m**3 * self.h * (self.v - self.e_na)
                + self.g_k * self.nk**4 * (self.v - self.e_k)
                + self.g_l * (self.v - self.e_l)
            )
            self.v = self.v + hdt * (current - i_ion) / self.c_m
        above = self.v >= self.p.v_th
        spikes = above & ~self.above & (self.ref <= 0)
        self.above = above
        self.ref = np.maximum(self.ref - self.dt, 0)
        self.ref[spikes] = self.p.t_ref
        return spikes


MODELS: dict[str, type[NeuronGroup]] = {"lif": LIF, "izhikevich": Izhikevich, "hh": HodgkinHuxley}
