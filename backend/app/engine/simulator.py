"""Clock-driven network simulator.

The simulator advances all groups in lock-step with a fixed ``dt``. Per step:

1. input groups emit spikes;
2. every projection delivers the spikes that were emitted ``delay`` steps ago,
   incrementing the target's exponentially-decaying synaptic current
   (and applying STDP depression);
3. neuron groups integrate their total input current and emit spikes;
4. STDP traces / potentiation are updated and new spikes are written into
   the projections' delay buffers.

:meth:`Simulator.run_iter` yields JSON-serialisable events (``meta``, many
``chunk`` events, then ``done``) so results can be streamed to the browser
while the simulation is still running.
"""
from __future__ import annotations

import time
from collections.abc import Iterator
from dataclasses import dataclass

import numpy as np

from ..schemas import Network
from . import energy
from .inputs import InputGroup
from .neurons import MODELS, NeuronGroup
from .synapses import Projection

MAX_SPIKES = 2_000_000
MAX_SYNAPSE_ENTRIES = 30_000_000
MAX_TRACE_POINTS = 2_000
WEIGHT_SAMPLE = 12


class SimulationError(ValueError):
    pass


@dataclass
class GroupInfo:
    id: str
    label: str
    kind: str  # "input" | "population"
    model: str | None
    offset: int
    count: int


class Simulator:
    def __init__(self, net: Network, max_neurons: int = 5000, max_steps: int = 20000):
        self.net = net
        sim = net.sim
        self.dt = sim.dt
        self.steps = int(round(sim.duration / sim.dt))
        total = sum(p.count for p in net.populations) + sum(i.count for i in net.inputs)
        if total > max_neurons:
            raise SimulationError(f"Network has {total} neurons; the limit is {max_neurons}.")
        if self.steps > max_steps:
            raise SimulationError(
                f"{self.steps} time steps requested; the limit is {max_steps}. Increase dt or shorten the run."
            )
        self.rng = np.random.default_rng(sim.seed)

        # Groups and global neuron numbering: inputs first, then populations.
        self.groups: dict[str, GroupInfo] = {}
        self.inputs: dict[str, InputGroup] = {}
        self.pops: dict[str, NeuronGroup] = {}
        offset = 0
        for spec in net.inputs:
            self.inputs[spec.id] = InputGroup(spec, self.dt, sim.duration, self.rng)
            self.groups[spec.id] = GroupInfo(spec.id, spec.label or spec.id, "input", None, offset, spec.count)
            offset += spec.count
        for spec in net.populations:
            self.pops[spec.id] = MODELS[spec.model](spec.count, spec.params, self.dt, self.rng)
            self.groups[spec.id] = GroupInfo(spec.id, spec.label or spec.id, "population", spec.model, offset, spec.count)
            offset += spec.count
        self.n_total = offset

        entries = sum(self.groups[s.source].count * self.groups[s.target].count for s in net.synapses)
        if entries > MAX_SYNAPSE_ENTRIES:
            raise SimulationError("Too many potential synapses; reduce population sizes.")
        self.projections = [
            Projection(s, self.groups[s.source].count, self.groups[s.target].count, self.dt, self.rng, s.source == s.target)
            for s in net.synapses
        ]
        self.isyn = {pid: np.zeros(g.n) for pid, g in self.pops.items()}
        self.syn_decay = {pid: np.exp(-self.dt / net.populations[i].params.tau_syn) for i, pid in enumerate(self.pops)}
        self.pop_params = {p.id: p.params for p in net.populations}
        # LIF weights are scaled by tau_m / tau_syn so that a weight of w produces a
        # post-synaptic potential of roughly w mV (more precisely ~0.6*w for the
        # default 20 ms / 5 ms time constants). Izhikevich and HH weights are the
        # peak synaptic current in the model's native units.
        self.syn_scale = {
            p.id: ((p.params.tau_m or 20.0) / p.params.tau_syn if p.model == "lif" else 1.0) for p in net.populations
        }

        # Membrane traces: the first k neurons of each population.
        k = sim.record_per_population
        self.recorded = {pid: list(range(min(k, g.n))) for pid, g in self.pops.items()}
        self.v_stride = max(1, self.steps // MAX_TRACE_POINTS)

    # ------------------------------------------------------------------
    def layout(self) -> list[dict]:
        return [g.__dict__ for g in self.groups.values()]

    def run_iter(self) -> Iterator[dict]:
        net, dt = self.net, self.dt
        chunk_steps = max(1, int(round(net.sim.chunk_ms / dt)))
        last = {gid: np.zeros(g.count, dtype=bool) for gid, g in self.groups.items()}
        spike_counts = {gid: 0 for gid in self.groups}
        plastic = [p for p in self.projections if p.plastic]
        n_connections = sum(p.n_connections for p in self.projections)
        total_synops = 0
        total_spikes = 0
        truncated = False
        t_wall = time.perf_counter()

        yield {
            "type": "meta",
            "name": net.name,
            "dt": dt,
            "duration": net.sim.duration,
            "steps": self.steps,
            "n_neurons": self.n_total,
            "n_connections": n_connections,
            "groups": self.layout(),
            "recorded": {
                pid: [self.groups[pid].offset + i for i in idx] for pid, idx in self.recorded.items()
            },
            "thresholds": {pid: self.pop_params[pid].v_th for pid in self.pops},
            "plastic": [{"id": p.spec.id, "source": p.spec.source, "target": p.spec.target} for p in plastic],
            "v_stride": self.v_stride,
        }

        # Spikes of recorded neurons since the last voltage sample, so that downsampled
        # traces never drop a spike.
        latch = {pid: np.zeros(len(idx), dtype=bool) for pid, idx in self.recorded.items()}

        for c0 in range(0, self.steps, chunk_steps):
            c1 = min(self.steps, c0 + chunk_steps)
            chunk_spikes_t: list[np.ndarray] = []
            chunk_spikes_id: list[np.ndarray] = []
            chunk_counts = {gid: 0 for gid in self.groups}
            v_times: list[float] = []
            v_traces: dict[str, list[list[float]]] = {pid: [] for pid in self.recorded}
            chunk_synops = 0

            for step in range(c0, c1):
                # 1. inputs
                for gid, grp in self.inputs.items():
                    last[gid] = grp.step(step)

                # 2. deliver delayed spikes
                arrived: list[np.ndarray] = []
                for proj in self.projections:
                    idx = proj.arrivals(step)
                    arrived.append(idx)
                    if idx.size:
                        cur, ops = proj.transmit(idx)
                        self.isyn[proj.spec.target] += cur * self.syn_scale[proj.spec.target]
                        chunk_synops += ops

                # 3. integrate neurons
                for pid, grp in self.pops.items():
                    prm = self.pop_params[pid]
                    current = self.isyn[pid] + prm.bias
                    if prm.noise:
                        current = current + prm.noise * self.rng.standard_normal(grp.n)
                    last[pid] = grp.step(current)
                    self.isyn[pid] *= self.syn_decay[pid]

                # 4. plasticity + delay buffers
                for proj, idx in zip(self.projections, arrived):
                    proj.post_update(idx, last[proj.spec.target])
                    proj.push(step, last[proj.spec.source])

                # record
                t_ms = step * dt
                for gid, s in last.items():
                    if s.any():
                        ids = np.flatnonzero(s)
                        chunk_counts[gid] += ids.size
                        if total_spikes + ids.size <= MAX_SPIKES:
                            chunk_spikes_t.append(np.full(ids.size, t_ms))
                            chunk_spikes_id.append(ids + self.groups[gid].offset)
                            total_spikes += ids.size
                        else:
                            truncated = True
                for pid, idx in self.recorded.items():
                    latch[pid] |= last[pid][idx]
                if step % self.v_stride == 0:
                    v_times.append(round(t_ms, 4))
                    for pid, idx in self.recorded.items():
                        vals = self.pops[pid].v[idx].copy()
                        # Draw emitted spikes as a full-height spike for reset-based models
                        # (Hodgkin-Huxley produces real action potentials).
                        fired = latch[pid]
                        if fired.any() and self.groups[pid].model != "hh":
                            vals[fired] = max(self.pop_params[pid].v_th, 20.0)
                        fired[:] = False
                        v_traces[pid].append(np.round(vals, 3).tolist())

            total_synops += chunk_synops
            for gid, n in chunk_counts.items():
                spike_counts[gid] += n
            span_s = (c1 - c0) * dt / 1000.0
            t = np.concatenate(chunk_spikes_t) if chunk_spikes_t else np.zeros(0)
            ids = np.concatenate(chunk_spikes_id) if chunk_spikes_id else np.zeros(0, dtype=int)
            yield {
                "type": "chunk",
                "t0": c0 * dt,
                "t1": c1 * dt,
                "progress": c1 / self.steps,
                "spikes": {"t": np.round(t, 3).tolist(), "id": ids.astype(int).tolist()},
                "rates": {gid: chunk_counts[gid] / (g.count * span_s) for gid, g in self.groups.items()},
                "voltages": {
                    "t": v_times,
                    # transpose to one list per recorded neuron
                    "v": {pid: (np.array(tr).T.tolist() if tr else []) for pid, tr in v_traces.items()},
                },
                "weights": {
                    p.spec.id: {
                        "mean": p.mean_weight(),
                        "sample": np.round(p.weights()[:WEIGHT_SAMPLE], 4).tolist(),
                    }
                    for p in plastic
                },
                "synops": total_synops,
            }

        duration_s = net.sim.duration / 1000.0
        weight_hist = {}
        for p in plastic:
            lo, hi = p.lo, p.hi if p.hi > p.lo else p.lo + 1
            bins = np.linspace(lo, hi, 21)
            weight_hist[p.spec.id] = {
                "bins": np.round(bins, 4).tolist(),
                "initial": np.histogram(p.initial_W, bins)[0].tolist(),
                "final": np.histogram(p.weights(), bins)[0].tolist(),
            }
        yield {
            "type": "done",
            "wall_time_s": time.perf_counter() - t_wall,
            "total_spikes": int(sum(spike_counts.values())),
            "truncated": truncated,
            "mean_rates": {gid: spike_counts[gid] / (g.count * duration_s) for gid, g in self.groups.items()},
            "energy": energy.estimate(total_synops, n_connections, net.sim.duration),
            "weight_histograms": weight_hist,
        }


def run(net: Network, **limits) -> dict:
    """Run to completion and merge all events into one result (used by export & tests)."""
    sim = Simulator(net, **limits)
    result: dict = {"spikes": {"t": [], "id": []}, "rates": [], "voltages": {"t": [], "v": {}}, "weights": []}
    for ev in sim.run_iter():
        if ev["type"] == "meta":
            result["meta"] = ev
        elif ev["type"] == "chunk":
            result["spikes"]["t"] += ev["spikes"]["t"]
            result["spikes"]["id"] += ev["spikes"]["id"]
            result["rates"].append({"t0": ev["t0"], "t1": ev["t1"], **ev["rates"]})
            result["voltages"]["t"] += ev["voltages"]["t"]
            for pid, traces in ev["voltages"]["v"].items():
                acc = result["voltages"]["v"].setdefault(pid, [[] for _ in traces])
                for a, tr in zip(acc, traces):
                    a += tr
            result["weights"].append({"t": ev["t1"], **{k: v["mean"] for k, v in ev["weights"].items()}})
        else:
            result["summary"] = ev
    return result
