import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.engine.neurons import LIF, HodgkinHuxley, Izhikevich
from app.engine.simulator import SimulationError, Simulator, run
from app.schemas import Network, NeuronParams, Synapse
from app.engine.synapses import Projection

RNG = np.random.default_rng(0)


def drive(group, current, steps):
    return sum(int(group.step(np.full(group.n, current)).sum()) for _ in range(steps))


def test_lif_matches_analytic_rate():
    # Constant suprathreshold current: ISI = t_ref + tau ln((I - (V_reset - V_rest)) / (I - (V_th - V_rest)))
    p = NeuronParams(v_th=-50, t_ref=2, tau_m=20, v_rest=-65, v_reset=-65)
    g = LIF(1, p, 0.01, RNG)
    g.v[:] = -65
    spikes = drive(g, 20.0, 100_000)  # 1 s
    isi = 2 + 20 * np.log(20 / (20 - 15))
    assert abs(spikes - 1000 / isi) <= 1


def test_lif_subthreshold_is_silent_and_refractory_caps_rate():
    p = NeuronParams(v_th=-50, t_ref=5, tau_m=20, v_rest=-65, v_reset=-65)
    g = LIF(1, p, 0.1, RNG)
    assert drive(g, 14.0, 5000) == 0  # V_inf = -51 mV < threshold
    g2 = LIF(1, p, 0.1, RNG)
    assert drive(g2, 1e4, 10_000) <= 1000 / 5 + 1  # cannot exceed 1/t_ref


def test_lif_adaptation_slows_firing():
    base = NeuronParams(v_th=-50, t_ref=2, tau_m=20, v_rest=-65, v_reset=-65)
    adapt = base.model_copy(update={"adapt_b": 3.0, "tau_w": 100})
    assert drive(LIF(1, adapt, 0.1, RNG), 25.0, 10_000) < drive(LIF(1, base, 0.1, RNG), 25.0, 10_000)


def test_izhikevich_regular_spiking_tonic_firing():
    p = NeuronParams(v_th=30, t_ref=0, a=0.02, b=0.2, c=-65, d=8)
    g = Izhikevich(1, p, 0.1, RNG)
    n = drive(g, 10.0, 10_000)
    assert 5 < n < 40  # RS neurons fire tonically at ~10-20 Hz for I = 10


def test_hodgkin_huxley_threshold():
    p = NeuronParams(v_th=0, t_ref=2)
    assert drive(HodgkinHuxley(1, p, 0.1, RNG), 2.0, 5000) == 0
    n = drive(HodgkinHuxley(1, p, 0.1, RNG), 10.0, 5000)
    assert 30 < n < 50  # ~68 Hz at 10 µA/cm² → ~34 spikes in 500 ms


def _single_syn(**kw):
    return Synapse(id="s", source="a", target="b", weight=0.5, p_connect=1, plasticity="stdp", **kw)


def test_stdp_pre_before_post_potentiates_and_reverse_depresses():
    dt = 0.1
    for order, sign in (("pre_first", 1), ("post_first", -1)):
        proj = Projection(_single_syn(), 1, 1, dt, RNG, False)
        w0 = proj.W[0, 0]
        pre_step, post_step = (10, 60) if order == "pre_first" else (60, 10)
        for step in range(200):
            pre = np.array([step == pre_step])
            post = np.array([step == post_step])
            proj.push(step, pre)
            idx = proj.arrivals(step)
            proj.transmit(idx)
            proj.post_update(idx, post)
        assert np.sign(proj.W[0, 0] - w0) == sign, order


def test_delay_shifts_arrival():
    for delay in (1.0, 5.0):
        proj = Projection(Synapse(id="s", source="a", target="b", weight=1, delay_ms=delay), 1, 1, 0.1, RNG, False)
        arrival = None
        for step in range(200):
            if proj.arrivals(step).size and arrival is None:
                arrival = step
            proj.push(step, np.array([step == 0]))
        assert arrival == round(delay / 0.1)


def small_net(**sim):
    return Network.model_validate(
        {
            "name": "t",
            "sim": {"duration": 200, "dt": 0.1, **sim},
            "inputs": [{"id": "in", "count": 50, "kind": "poisson", "rate_hz": 40}],
            "populations": [
                {"id": "e", "count": 40, "model": "lif", "params": {"v_th": -50, "t_ref": 2, "tau_m": 20, "v_rest": -65, "v_reset": -70}},
            ],
            "synapses": [{"id": "s1", "source": "in", "target": "e", "weight": 8, "p_connect": 0.3, "plasticity": "stdp",
                          "stdp": {"w_min": 0, "w_max": 16}}],
        }
    )


def test_full_run_is_deterministic_and_records_everything():
    a, b = run(small_net()), run(small_net())
    assert a["spikes"] == b["spikes"]
    s = a["summary"]
    assert s["total_spikes"] > 0
    assert s["mean_rates"]["e"] > 0
    assert s["energy"]["snn_synops"] > 0 and s["energy"]["ann_macs"] > s["energy"]["snn_synops"]
    assert "s1" in s["weight_histograms"]
    assert len(a["voltages"]["v"]["e"]) == 5


def test_limits_enforced():
    with pytest.raises(SimulationError):
        Simulator(small_net(duration=10_000, dt=0.1), max_steps=20_000)


def test_sse_stream_emits_meta_chunks_done():
    from app.main import app

    body = small_net(duration=60).model_dump()
    with TestClient(app).stream("POST", "/simulate/stream", json=body) as r:
        assert r.status_code == 200
        text = "".join(r.iter_text())
    events = [line.split(": ", 1)[1].strip() for line in text.splitlines() if line.startswith("event:")]
    assert events[0] == "meta" and events[-1] == "done" and events.count("chunk") == 3


def test_invalid_reference_rejected():
    from app.main import app

    body = small_net().model_dump()
    body["synapses"][0]["target"] = "in"
    assert TestClient(app).post("/simulate", json=body).status_code == 422
