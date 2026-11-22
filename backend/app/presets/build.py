"""Source of truth for the built-in preset library.

Each preset is a regular network definition plus display metadata. Run
``python -m app.presets.build`` to regenerate the JSON files in this folder
(they are what the API serves, and they can also be imported in the builder).
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent


def lif(**kw):
    p = {"tau_m": 20, "v_rest": -65, "v_reset": -70, "v_th": -50, "t_ref": 2, "tau_syn": 5, "bias": 0, "noise": 0, "adapt_b": 0, "tau_w": 100}
    p.update(kw)
    return p


def izh(kind: str, **kw):
    classes = {
        "RS": dict(a=0.02, b=0.2, c=-65, d=8),
        "IB": dict(a=0.02, b=0.2, c=-55, d=4),
        "CH": dict(a=0.02, b=0.2, c=-50, d=2),
        "FS": dict(a=0.1, b=0.2, c=-65, d=2),
    }
    p = {"v_th": 30, "t_ref": 0, "tau_syn": 5, "bias": 0, "noise": 0, **classes[kind]}
    p.update(kw)
    return p


def pop(id, label, count, model, params, x, y):
    return {"id": id, "label": label, "count": count, "model": model, "params": params, "position": {"x": x, "y": y}}


def inp(id, label, count, kind, x, y, **kw):
    d = {"id": id, "label": label, "count": count, "kind": kind, "rate_hz": 20, "start_ms": 0, "stop_ms": None, "position": {"x": x, "y": y}}
    d.update(kw)
    return d


def syn(id, source, target, weight, p=0.2, delay=1.0, **kw):
    d = {"id": id, "source": source, "target": target, "weight": weight, "weight_std": 0, "p_connect": p, "delay_ms": delay,
         "allow_autapses": False, "plasticity": "static",
         "stdp": {"A_plus": 0.01, "A_minus": 0.012, "tau_plus": 20, "tau_minus": 20, "w_min": 0, "w_max": 1}}
    d.update(kw)
    return d


def network(name, sim, populations, inputs, synapses, description, biology):
    return {"version": 1, "name": name, "description": description, "biology": biology, "sim": sim,
            "populations": populations, "inputs": inputs, "synapses": synapses}


# ---------------------------------------------------------------------------

def winner_take_all():
    rates = {"a": 32, "b": 26, "c": 20}
    inputs = [inp(f"in_{k}", f"Stimulus {k.upper()} ({r} Hz)", 40, "poisson", 0, 40 + i * 150, rate_hz=r) for i, (k, r) in enumerate(rates.items())]
    pops = [pop(f"e_{k}", f"Excitatory {k.upper()}", 30, "lif", lif(), 320, 40 + i * 150) for i, k in enumerate(rates)]
    pops.append(pop("inh", "Shared inhibition", 30, "lif", lif(tau_m=10), 640, 190))
    syns = []
    for k in rates:
        syns += [
            syn(f"in_{k}_e", f"in_{k}", f"e_{k}", 4.0, p=0.25),
            syn(f"e_{k}_self", f"e_{k}", f"e_{k}", 2.5, p=0.3, delay=1.5),
            syn(f"e_{k}_inh", f"e_{k}", "inh", 3.0, p=0.3),
            syn(f"inh_e_{k}", "inh", f"e_{k}", -9.0, p=0.5),
        ]
    return {
        "id": "winner-take-all",
        "title": "Winner-Take-All circuit",
        "tags": ["competition", "lateral inhibition", "decision making"],
        "references": ["Douglas & Martin (2004) Neuronal circuits of the neocortex. Annu. Rev. Neurosci.",
                       "Maass (2000) On the computational power of winner-take-all. Neural Computation."],
        "network": network(
            "Winner-Take-All circuit",
            {"dt": 0.1, "duration": 1000, "seed": 7, "record_per_population": 4, "chunk_ms": 25},
            pops, inputs, syns,
            "Three excitatory groups receive stimuli of different strength and all excite one shared pool of inhibitory "
            "neurons, which inhibits every group in return. The group with the strongest input fires first, recruits "
            "inhibition and silences its competitors: the network computes an argmax with spikes.",
            "Soft winner-take-all motifs built from recurrent excitation and pooled inhibition are found throughout "
            "neocortex (e.g. between orientation columns and in attention/decision circuits). They let a population "
            "select the most salient input and suppress the rest. Inhibitory basket cells provide the shared pool.",
        ),
    }


def central_pattern_generator():
    a = lif(bias=18, noise=1.0, adapt_b=1.2, tau_w=250)
    pops = [
        pop("flexor", "Flexor half-centre", 25, "lif", a, 120, 60),
        pop("extensor", "Extensor half-centre", 25, "lif", a, 120, 300),
        pop("mn_f", "Flexor motor neurons", 15, "lif", lif(), 480, 60),
        pop("mn_e", "Extensor motor neurons", 15, "lif", lif(), 480, 300),
    ]
    syns = [
        syn("f_e", "flexor", "extensor", -8.0, p=0.5, delay=2),
        syn("e_f", "extensor", "flexor", -8.0, p=0.5, delay=2),
        syn("f_f", "flexor", "flexor", 0.8, p=0.3, delay=2),
        syn("e_e", "extensor", "extensor", 0.8, p=0.3, delay=2),
        syn("f_mn", "flexor", "mn_f", 4.0, p=0.4),
        syn("e_mn", "extensor", "mn_e", 4.0, p=0.4),
    ]
    return {
        "id": "central-pattern-generator",
        "title": "Central Pattern Generator",
        "tags": ["rhythm", "half-centre oscillator", "adaptation", "locomotion"],
        "references": ["Brown (1911) The intrinsic factors in the act of progression in the mammal. Proc. R. Soc. B.",
                       "Marder & Bucher (2001) Central pattern generators and the control of rhythmic movements. Curr. Biol."],
        "network": network(
            "Central Pattern Generator",
            {"dt": 0.2, "duration": 3000, "seed": 3, "record_per_population": 3, "chunk_ms": 50},
            pops, [], syns,
            "Two tonically driven populations inhibit each other (a half-centre oscillator). Whichever side is active "
            "suppresses the other until spike-frequency adaptation tires it out; the other side is then released and "
            "takes over. The result is a steady left/right (flexor/extensor) rhythm with no rhythmic input at all.",
            "Central pattern generators in the spinal cord and brainstem produce walking, swimming, breathing and chewing "
            "rhythms even when sensory feedback is removed (Graham Brown's half-centre model, 1911). Mutual inhibition plus "
            "a slow fatigue process (here adaptation currents, in biology e.g. Ca²⁺-activated K⁺ channels) is the "
            "classic mechanism.",
        ),
    }


def echo_state():
    rng = np.random.default_rng(11)
    # A temporal input sequence: 8 channels that light up one after another, then repeat.
    pattern = []
    for ch in range(40):
        group = ch // 5
        start = group * 40
        pattern.append(sorted(float(round(t, 1)) for t in rng.uniform(start, start + 40, 6)))
    inputs = [inp("seq", "Temporal sequence", 40, "pattern", 0, 140, pattern=pattern, period_ms=400)]
    pops = [
        pop("res_e", "Reservoir (excitatory)", 320, "lif", lif(noise=1.5), 330, 40),
        pop("res_i", "Reservoir (inhibitory)", 80, "lif", lif(tau_m=10, noise=1.5), 330, 280),
        pop("readout", "Readout", 20, "lif", lif(), 680, 160),
    ]
    syns = [
        syn("in_e", "seq", "res_e", 6.0, p=0.15),
        syn("ee", "res_e", "res_e", 1.6, p=0.1, delay=1.5, weight_std=0.5),
        syn("ei", "res_e", "res_i", 2.0, p=0.2, delay=1.0, weight_std=0.5),
        syn("ie", "res_i", "res_e", -6.0, p=0.25, delay=1.0, weight_std=1.0),
        syn("ii", "res_i", "res_i", -4.0, p=0.2, delay=1.0),
        syn("e_out", "res_e", "readout", 2.0, p=0.15, plasticity="stdp",
            stdp={"A_plus": 0.005, "A_minus": 0.006, "tau_plus": 20, "tau_minus": 20, "w_min": 0, "w_max": 3}),
    ]
    return {
        "id": "echo-state-network",
        "title": "Echo State Network (Liquid State Machine)",
        "tags": ["reservoir computing", "recurrent", "temporal memory"],
        "references": ["Jaeger (2001) The 'echo state' approach to analysing and training recurrent neural networks. GMD Report 148.",
                       "Maass, Natschläger & Markram (2002) Real-time computing without stable states. Neural Computation."],
        "network": network(
            "Echo State Network (spiking reservoir)",
            {"dt": 0.1, "duration": 1200, "seed": 11, "record_per_population": 5, "chunk_ms": 25},
            pops, inputs, syns,
            "A fixed, randomly connected recurrent 'reservoir' of 400 spiking neurons (80% excitatory, 20% inhibitory) is "
            "driven by a repeating temporal sequence. The reservoir transforms the input into a rich, high-dimensional "
            "trajectory that 'echoes' recent history; only the connections to a small readout are plastic.",
            "Reservoir computing (Jaeger's echo state networks and Maass's liquid state machines) proposes that generic "
            "cortical microcircuits act as a fading memory of their inputs, and that downstream areas only need to learn "
            "simple readouts. The spiking version shown here is the liquid state machine; the balance of excitation and "
            "inhibition keeps the reservoir at the edge of chaos.",
        ),
    }


def stdp_demo():
    rng = np.random.default_rng(5)
    # Correlated afferents fire a near-synchronous volley (3 ms jitter) every 50 ms; same mean rate as the random group.
    pattern = [[float(round(rng.uniform(20, 23), 1))] for _ in range(60)]
    inputs = [
        inp("corr", "Correlated volleys (20 Hz)", 60, "pattern", 0, 40, pattern=pattern, period_ms=50),
        inp("rand", "Random Poisson (20 Hz)", 60, "poisson", 0, 260, rate_hz=20),
    ]
    stdp = {"A_plus": 0.01, "A_minus": 0.0105, "tau_plus": 20, "tau_minus": 20, "w_min": 0, "w_max": 3}
    pops = [pop("out", "Output neurons", 10, "lif", lif(t_ref=5), 420, 150)]
    syns = [
        syn("corr_out", "corr", "out", 1.2, p=1.0, weight_std=0.4, plasticity="stdp", stdp=stdp),
        syn("rand_out", "rand", "out", 1.2, p=1.0, weight_std=0.4, plasticity="stdp", stdp=stdp),
    ]
    return {
        "id": "stdp-learning",
        "title": "STDP learning demo",
        "tags": ["plasticity", "Hebbian learning", "unsupervised"],
        "references": ["Bi & Poo (1998) Synaptic modifications in cultured hippocampal neurons. J. Neurosci.",
                       "Song, Miller & Abbott (2000) Competitive Hebbian learning through STDP. Nat. Neurosci.",
                       "Masquelier, Guyonneau & Thorpe (2008) Spike timing dependent plasticity finds the start of repeating patterns. PLoS ONE."],
        "network": network(
            "STDP learning demo",
            {"dt": 0.2, "duration": 3000, "seed": 5, "record_per_population": 3, "chunk_ms": 50},
            pops, inputs, syns,
            "Ten output neurons receive two groups of afferents that fire at exactly the same average rate (20 Hz). One "
            "group fires in near-synchronous volleys every 50 ms; the other is random. Spike-timing dependent plasticity "
            "strengthens the synapses whose spikes reliably arrive just *before* the output fires, so the correlated "
            "synapses grow while the random ones weaken: the neuron learns which inputs belong together, without a teacher.",
            "In real synapses, a presynaptic spike arriving a few ms before the postsynaptic spike causes long-term "
            "potentiation, and the reverse order causes depression (Bi & Poo 1998). This 'fire together, wire together' "
            "rule with a causal twist lets neurons detect repeating spatiotemporal patterns and is a leading candidate "
            "for unsupervised learning in cortex.",
        ),
    }


def v1_column():
    E = lambda kind, **kw: izh(kind, noise=3.0, **kw)  # noqa: E731
    I = lambda **kw: izh("FS", noise=2.0, **kw)  # noqa: E731, E741
    pops = [
        pop("l23e", "L2/3 pyramidal (RS)", 120, "izhikevich", E("RS"), 360, 0),
        pop("l23i", "L2/3 interneurons (FS)", 30, "izhikevich", I(), 660, 0),
        pop("l4e", "L4 spiny stellate (RS)", 120, "izhikevich", E("RS"), 360, 190),
        pop("l4i", "L4 interneurons (FS)", 30, "izhikevich", I(), 660, 190),
        pop("l5e", "L5 pyramidal (IB)", 80, "izhikevich", E("IB"), 360, 380),
        pop("l5i", "L5 interneurons (FS)", 20, "izhikevich", I(), 660, 380),
    ]
    inputs = [inp("lgn", "LGN (thalamic) input", 100, "poisson", 0, 190, rate_hz=25, start_ms=100, stop_ms=600)]
    syns = [
        syn("lgn_l4e", "lgn", "l4e", 7.0, p=0.15),
        syn("lgn_l4i", "lgn", "l4i", 3.0, p=0.15),
        syn("l4e_l4e", "l4e", "l4e", 2.0, p=0.1, delay=1.0),
        syn("l4e_l4i", "l4e", "l4i", 3.0, p=0.15),
        syn("l4i_l4e", "l4i", "l4e", -4.0, p=0.3),
        syn("l4e_l23e", "l4e", "l23e", 4.0, p=0.12, delay=2.0),
        syn("l23e_l23e", "l23e", "l23e", 1.0, p=0.1, delay=1.0),
        syn("l23e_l23i", "l23e", "l23i", 3.0, p=0.15),
        syn("l23i_l23e", "l23i", "l23e", -5.0, p=0.3),
        syn("l23e_l5e", "l23e", "l5e", 3.0, p=0.12, delay=2.0),
        syn("l5e_l5i", "l5e", "l5i", 3.0, p=0.15),
        syn("l5i_l5e", "l5i", "l5e", -6.0, p=0.3),
    ]
    return {
        "id": "v1-column",
        "title": "Visual cortex V1 column",
        "tags": ["cortex", "laminar", "Izhikevich", "feedforward"],
        "references": ["Douglas & Martin (1991, 2004) canonical microcircuit of neocortex.",
                       "Izhikevich (2003) Simple model of spiking neurons. IEEE Trans. Neural Networks.",
                       "Potjans & Diesmann (2014) The cell-type specific cortical microcircuit. Cereb. Cortex."],
        "network": network(
            "Visual cortex V1 column",
            {"dt": 0.1, "duration": 800, "seed": 1, "record_per_population": 4, "chunk_ms": 20},
            pops, inputs, syns,
            "A simplified cortical column with three layers, each with excitatory and fast-spiking inhibitory Izhikevich "
            "neurons. A burst of thalamic (LGN) input from 100–600 ms arrives in layer 4, is relayed to layers 2/3 and "
            "then to the bursting pyramidal cells of layer 5, the column's output. Watch activity sweep through the "
            "layers with a few ms delay each.",
            "Primary visual cortex is organised into columns whose layers follow the 'canonical microcircuit' (Douglas & "
            "Martin): thalamus → L4 → L2/3 → L5/6, with local inhibition balancing excitation in every layer. Different "
            "cell types are captured by Izhikevich's model: regular-spiking (RS) and intrinsically-bursting (IB) "
            "pyramidal cells and fast-spiking (FS) basket cells.",
        ),
    }


PRESETS = [winner_take_all, central_pattern_generator, echo_state, stdp_demo, v1_column]


def build() -> list[dict]:
    out = []
    for i, fn in enumerate(PRESETS, 1):
        preset = fn()
        path = HERE / f"{i:02d}-{preset['id']}.json"
        path.write_text(json.dumps(preset, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        out.append(preset)
    return out


if __name__ == "__main__":
    for p in build():
        print("wrote", p["id"])
