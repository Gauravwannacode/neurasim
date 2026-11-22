"""First-order energy model comparing event-driven SNN inference with an ANN.

Energy per operation for 32-bit floating point arithmetic in 45 nm CMOS
(Horowitz, "Computing's energy problem", ISSCC 2014):

* add (accumulate, AC):            0.9 pJ
* multiply-accumulate (MAC):       3.7 pJ (mult) + 0.9 pJ (add) = 4.6 pJ

An SNN only spends a synaptic operation (SynOp = one AC) when a spike
actually arrives at a synapse, while a conventional ANN with the same
connectivity performs a MAC on *every* connection every time it is evaluated.
We compare against an ANN that is evaluated once per ``frame_ms`` of
simulated time (1 ms by default, i.e. processing the same temporal stream at
1 kHz). Memory access, neuron-state updates and routing are deliberately left
out; see the README for the caveats.
"""
from __future__ import annotations

E_AC_PJ = 0.9
E_MAC_PJ = 4.6


def estimate(synops: int, n_connections: int, duration_ms: float, frame_ms: float = 1.0) -> dict:
    frames = max(1.0, duration_ms / frame_ms)
    ann_macs = int(n_connections * frames)
    snn_pj = synops * E_AC_PJ
    ann_pj = ann_macs * E_MAC_PJ
    return {
        "snn_synops": int(synops),
        "ann_macs": ann_macs,
        "snn_energy_nj": snn_pj / 1000,
        "ann_energy_nj": ann_pj / 1000,
        "ratio": (ann_pj / snn_pj) if snn_pj > 0 else None,
        "activity": (synops / ann_macs) if ann_macs else 0.0,
        "e_ac_pj": E_AC_PJ,
        "e_mac_pj": E_MAC_PJ,
        "frame_ms": frame_ms,
        "n_connections": int(n_connections),
    }
