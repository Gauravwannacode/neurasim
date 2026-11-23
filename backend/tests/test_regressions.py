"""Regression tests for defects found while auditing the first version."""
import copy

import jwt
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient

from app import auth, config
from app.engine.simulator import SimulationError, Simulator, run
from app.main import app
from app.routers.presets import load_presets
from app.schemas import Network

client = TestClient(app)


def preset(pid, **sim):
    net = copy.deepcopy(next(p for p in load_presets() if p["id"] == pid)["network"])
    net["sim"].update(sim)
    return net


def lif_net(**kw):
    return {"sim": {"duration": 20}, "populations": [{"id": "e", "label": "E", "count": 5, "model": "lif", "params": {"v_th": -50}}], **kw}


def test_stdp_weights_never_leave_their_bounds():
    sim = Simulator(Network.model_validate(preset("stdp-learning")))
    for _ in sim.run_iter():
        for p in sim.projections:
            w = p.weights()
            assert w.min() >= p.lo and w.max() <= p.hi
    # Histograms must therefore account for every synapse.
    done = run(Network.model_validate(preset("stdp-learning", duration=500)))["summary"]
    assert all(sum(h["final"]) == sum(h["initial"]) == 600 for h in done["weight_histograms"].values())


def test_initial_weight_outside_stdp_range_is_rejected():
    syn = {"id": "s", "source": "e", "target": "e", "weight": 5, "plasticity": "stdp", "stdp": {"w_min": 0, "w_max": 1}}
    r = client.post("/simulate", json=lif_net(synapses=[syn]))
    assert r.status_code == 422 and "STDP range" in r.text


@pytest.mark.parametrize("seed", [1, 2, 3])
def test_preset_signatures_hold_for_other_seeds(seed):
    w = run(Network.model_validate(preset("stdp-learning", seed=seed)))["weights"]
    assert w[-1]["corr_out"] > w[0]["corr_out"] and w[-1]["rand_out"] < w[0]["rand_out"]
    r = run(Network.model_validate(preset("winner-take-all", seed=seed)))["summary"]["mean_rates"]
    assert r["e_a"] > r["e_b"] > r["e_c"]


@pytest.mark.parametrize("seed", [1, 2, 3])
def test_v1_activity_sweeps_through_layers_in_order(seed):
    res = run(Network.model_validate(preset("v1-column", seed=seed)))
    first = {}
    for g in res["meta"]["groups"]:
        ts = sorted(t for t, i in zip(res["spikes"]["t"], res["spikes"]["id"]) if g["offset"] <= i < g["offset"] + g["count"])
        first[g["id"]] = ts[9]  # tenth spike: robust against a single stray one
    assert 100 < first["l4e"] < first["l23e"] < first["l5e"]


@pytest.mark.parametrize(
    "text",
    ["a < b & c", "<b>unclosed", "<img src='C:/Windows/win.ini' width='9' height='9'/>", "cost $5 $x_{", "x^$\\frac"],
)
def test_pdf_treats_user_text_as_plain_text(text):
    net = lif_net(name=text, description=text, biology=text)
    net["populations"][0]["label"] = text
    net["synapses"] = [{"id": "s", "source": "e", "target": "e", "weight": 1}]
    r = client.post("/export/pdf", json=net)
    assert r.status_code == 200 and r.content[:5] == b"%PDF-"


@pytest.mark.parametrize(
    "patch",
    [
        {"sim": {"duration": 1e30}},
        {"sim": {"duration": 20, "dt": 1e-9}},
        {"synapses": [{"id": "s", "source": "e", "target": "e", "weight": 1, "delay_ms": 1e7}]},
        {"inputs": [{"id": "i", "count": 1, "kind": "pattern", "pattern": [[1]], "period_ms": 1e-6}]},
        {"populations": []},
    ],
)
def test_resource_exhausting_requests_rejected(patch):
    assert client.post("/simulate", json={**lif_net(), **patch}).status_code == 422


def test_infinity_in_json_is_a_clean_422():
    body = '{"sim":{"duration":Infinity},"populations":[{"id":"e","count":1,"model":"lif","params":{"v_th":-50}}]}'
    r = client.post("/simulate", content=body, headers={"Content-Type": "application/json"})
    assert r.status_code == 422


def test_synapse_memory_limit():
    net = lif_net(synapses=[{"id": "s", "source": "e", "target": "e", "weight": 1}])
    net["populations"][0]["count"] = 2500
    with pytest.raises(SimulationError, match="potential synapses"):
        Simulator(Network.model_validate(net))


def test_limit_errors_reach_the_stream_as_error_events():
    net = lif_net()
    net["sim"] = {"duration": 100_000, "dt": 0.1}
    with client.stream("POST", "/simulate/stream", json=net) as r:
        text = "".join(r.iter_text())
    assert "event: error" in text and "time steps requested" in text


def test_require_auth_without_supabase_fails_closed(monkeypatch):
    monkeypatch.setattr(auth, "settings", config.Settings(require_auth=True, supabase_url="", supabase_jwt_secret=""))
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="anything")
    with pytest.raises(HTTPException):
        auth.current_user(creds)


def test_unsigned_and_unexpected_algorithms_rejected(monkeypatch):
    monkeypatch.setattr(auth, "settings", config.Settings(supabase_url="https://x.supabase.co", supabase_jwt_secret="s" * 40))
    claims = {"sub": "u", "aud": "authenticated"}
    for token in (jwt.encode(claims, None, algorithm="none"), jwt.encode(claims, "s" * 64, algorithm="HS512")):
        with pytest.raises(jwt.PyJWTError):
            auth.verify_token(token)
