import json

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

NET = {
    "sim": {"duration": 300, "dt": 0.1, "seed": 1},
    "inputs": [{"id": "i", "count": 10, "kind": "poisson", "rate_hz": 20}],
    "populations": [{"id": "e", "count": 5, "model": "lif", "params": {"v_th": -50, "t_ref": 2, "tau_m": 20, "v_rest": -65, "v_reset": -65}}],
    "synapses": [{"id": "s", "source": "i", "target": "e", "weight": 0, "plasticity": "stdp", "stdp": {"w_min": 0, "w_max": 2}}],
}


def run(**kw):
    body = {"network": NET, "kind": "population", "id": "e", "field": "bias", "values": [0, 10, 20, 30], **kw}
    r = client.post("/sweep", json=body)
    events = []
    for block in r.text.replace("\r\n", "\n").split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.split("\n") if ": " in line)
        if "event" in lines:
            events.append((lines["event"], json.loads(lines["data"])))
    return r, events


def test_f_i_curve_is_monotonic_with_the_right_threshold():
    r, events = run()
    assert r.status_code == 200 and events[-1][0] == "done"
    rates = [d["rates"]["e"] for e, d in events if e == "point"]
    # Rheobase is 15 mV here (V_th - V_rest): silent at 0 and 10, firing at 20 and 30.
    assert rates[0] == rates[1] == 0 < rates[2] < rates[3]


def test_sweeping_does_not_disturb_other_settings():
    _, events = run(kind="input", id="i", field="rate_hz", values=[10, 100])
    rates = [d["rates"]["i"] for e, d in events if e == "point"]
    assert rates[0] < 30 < rates[1]


def test_value_outside_stdp_range_reports_which_value():
    _, events = run(kind="synapse", id="s", field="weight", values=[1, 5])
    assert [e for e, _ in events] == ["point", "error"]
    assert "weight = 5" in events[-1][1]["message"]


@pytest.mark.parametrize(
    "kw",
    [
        {"field": "count"},
        {"field": "__class__"},
        {"id": "nope"},
        {"values": [1]},
        {"values": list(range(26))},
        {"network": {**NET, "sim": {"duration": 20_000, "dt": 0.1}}},
    ],
)
def test_bad_sweeps_rejected(kw):
    assert run(**kw)[0].status_code == 422
