import pytest
from fastapi.testclient import TestClient

from app.engine.simulator import run
from app.main import app
from app.routers.presets import load_presets
from app.schemas import Network

client = TestClient(app)


def test_five_presets_listed():
    r = client.get("/presets")
    assert r.status_code == 200
    ids = [p["id"] for p in r.json()]
    assert ids == ["winner-take-all", "central-pattern-generator", "echo-state-network", "stdp-learning", "v1-column"]
    assert all(p["biology"] and p["description"] for p in r.json())


def test_unknown_preset_404():
    assert client.get("/presets/nope").status_code == 404


@pytest.mark.parametrize("preset", load_presets(), ids=lambda p: p["id"])
def test_preset_runs_and_is_active(preset):
    res = run(Network.model_validate(preset["network"]))
    rates = res["summary"]["mean_rates"]
    assert all(rates[p["id"]] > 0.5 for p in preset["network"]["populations"]), rates


def _by_id(pid):
    return next(p for p in load_presets() if p["id"] == pid)


def test_winner_take_all_strongest_input_wins():
    rates = run(Network.model_validate(_by_id("winner-take-all")["network"]))["summary"]["mean_rates"]
    assert rates["e_a"] > 2 * rates["e_b"] > 0 and rates["e_b"] > rates["e_c"]


def test_stdp_demo_separates_correlated_from_random():
    w = run(Network.model_validate(_by_id("stdp-learning")["network"]))["weights"]
    assert w[-1]["corr_out"] > w[0]["corr_out"] and w[-1]["rand_out"] < w[0]["rand_out"]


def test_cpg_alternates():
    rates = run(Network.model_validate(_by_id("central-pattern-generator")["network"]))["rates"]
    dominant = ["f" if c["flexor"] > c["extensor"] else "e" for c in rates]
    switches = sum(a != b for a, b in zip(dominant, dominant[1:]))
    assert switches >= 6
