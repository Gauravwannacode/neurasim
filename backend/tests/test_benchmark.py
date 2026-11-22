from fastapi.testclient import TestClient

from app.main import app


def test_cached_benchmark_results_served():
    r = TestClient(app).get("/benchmark")
    assert r.status_code == 200
    body = r.json()
    for model in ("ann", "snn"):
        assert 0.8 < body[model]["accuracy"] <= 1.0
        assert body[model]["energy_nj_per_sample"] > 0
    # The SNN should need less estimated energy per inference than the ANN.
    assert body["snn"]["energy_nj_per_sample"] < body["ann"]["energy_nj_per_sample"]
    assert len(body["example"]["output_v"]) == 10
