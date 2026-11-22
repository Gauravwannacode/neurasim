"""Synaptic projections: connectivity, transmission delays and STDP.

A projection connects every neuron of a source group to every neuron of a
target group with probability ``p_connect``. Weights live in a dense
``(n_pre, n_post)`` matrix together with a boolean connectivity ``mask``;
spikes are sparse, so each step touches only the rows of neurons that fired.

Plasticity follows pair-based, all-to-all STDP with exponential traces
(Song, Miller & Abbott 2000; Bi & Poo 1998):

* each presynaptic arrival increments trace ``x`` (decays with ``tau_plus``)
* each postsynaptic spike increments trace ``y`` (decays with ``tau_minus``)
* on a postsynaptic spike:  ``w += A_plus  * w_max * x``  (pre-before-post → LTP)
* on a presynaptic arrival: ``w -= A_minus * w_max * y``  (post-before-pre → LTD)
"""
from __future__ import annotations

import numpy as np

from ..schemas import Synapse


class Projection:
    def __init__(self, spec: Synapse, n_pre: int, n_post: int, dt: float, rng: np.random.Generator, same_group: bool):
        self.spec = spec
        self.n_pre, self.n_post = n_pre, n_post
        mask = rng.random((n_pre, n_post)) < spec.p_connect
        if same_group and not spec.allow_autapses:
            np.fill_diagonal(mask, False)
        weights = np.full((n_pre, n_post), spec.weight, dtype=np.float64)
        if spec.weight_std > 0:
            weights += rng.normal(0, spec.weight_std, weights.shape)
            # Keep Dale's principle: jitter must not flip the sign of a projection.
            weights = np.maximum(weights, 0) if spec.weight >= 0 else np.minimum(weights, 0)
        self.mask = mask
        self.W = np.where(mask, weights, 0.0)
        self.fanout = mask.sum(axis=1)  # synapses per presynaptic neuron (for SynOp counting)
        self.n_connections = int(mask.sum())

        # Ring buffer implementing the transmission delay (at least one step).
        self.delay_steps = max(1, int(round(spec.delay_ms / dt)))
        self.buffer = np.zeros((self.delay_steps, n_pre), dtype=bool)

        self.plastic = spec.plasticity == "stdp"
        if self.plastic:
            s = spec.stdp
            self.decay_x = np.exp(-dt / s.tau_plus)
            self.decay_y = np.exp(-dt / s.tau_minus)
            self.x = np.zeros(n_pre)
            self.y = np.zeros(n_post)
            self.lo, self.hi = min(s.w_min, s.w_max), max(s.w_min, s.w_max)
            self.W = np.where(mask, np.clip(self.W, self.lo, self.hi), 0.0)
            self.initial_W = self.W[mask].copy()

    def arrivals(self, step: int) -> np.ndarray:
        """Indices of presynaptic neurons whose spikes arrive at ``step``."""
        return np.flatnonzero(self.buffer[step % self.delay_steps])

    def push(self, step: int, pre_spikes: np.ndarray) -> None:
        self.buffer[step % self.delay_steps] = pre_spikes

    def transmit(self, idx: np.ndarray) -> tuple[np.ndarray, int]:
        """Postsynaptic current increments for arriving spikes, and SynOps used."""
        if idx.size == 0:
            return np.zeros(self.n_post), 0
        current = self.W[idx].sum(axis=0)
        if self.plastic:
            # LTD: arrival after recent postsynaptic spikes depresses the synapse.
            s = self.spec.stdp
            self.W[idx] -= (s.A_minus * s.w_max) * self.y[None, :]
            self._clip_rows(idx)
        return current, int(self.fanout[idx].sum())

    def post_update(self, arrived: np.ndarray, post_spikes: np.ndarray) -> None:
        """Trace bookkeeping and LTP after the target group has been updated."""
        if not self.plastic:
            return
        s = self.spec.stdp
        self.x *= self.decay_x
        self.y *= self.decay_y
        if arrived.size:
            self.x[arrived] += 1.0
        cols = np.flatnonzero(post_spikes)
        if cols.size:
            self.W[:, cols] += (s.A_plus * s.w_max) * self.x[:, None]
            np.clip(self.W[:, cols], self.lo, self.hi, out=self.W[:, cols])
            self.W[:, cols] *= self.mask[:, cols]
            self.y[cols] += 1.0

    def _clip_rows(self, idx: np.ndarray) -> None:
        rows = np.clip(self.W[idx], self.lo, self.hi)
        self.W[idx] = rows * self.mask[idx]

    # -- recording helpers -------------------------------------------------
    def weights(self) -> np.ndarray:
        return self.W[self.mask]

    def mean_weight(self) -> float:
        return float(self.W[self.mask].mean()) if self.n_connections else 0.0
