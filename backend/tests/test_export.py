import csv
import io

from fastapi.testclient import TestClient

from app.main import app
from app.routers.presets import load_presets

client = TestClient(app)


def _preset(pid):
    return next(p for p in load_presets() if p["id"] == pid)["network"]


def test_csv_export_lists_every_spike():
    net = _preset("winner-take-all")
    net = {**net, "sim": {**net["sim"], "duration": 200}}
    r = client.post("/export/csv", json=net)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    rows = list(csv.DictReader(io.StringIO(r.text)))
    assert rows and set(rows[0]) == {"time_ms", "neuron_id", "group", "local_index"}
    assert {row["group"] for row in rows} >= {"in_a", "e_a"}


def test_pdf_report_for_plastic_network():
    net = _preset("stdp-learning")
    net = {**net, "sim": {**net["sim"], "duration": 500}}
    r = client.post("/export/pdf", json=net)
    assert r.status_code == 200
    assert r.content[:5] == b"%PDF-" and len(r.content) > 20_000
