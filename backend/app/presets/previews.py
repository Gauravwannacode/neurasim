"""Export small, real excerpts of simulation output for the website.

Run ``python -m app.presets.previews`` after changing presets or the benchmark.
Every raster on the landing page and in the gallery is a genuine simulation.
"""
from __future__ import annotations

import json
from pathlib import Path

from ..benchmark.mnist import load_results
from ..engine.simulator import run
from ..schemas import Network
from .build import build

OUT = Path(__file__).resolve().parents[3] / "frontend" / "src" / "data"
MAX_ROWS = 26  # neurons shown per group
WINDOW_MS = 900


def preview(preset: dict) -> dict:
    res = run(Network.model_validate(preset["network"]))
    spikes = list(zip(res["spikes"]["t"], res["spikes"]["id"]))
    rows, offset = [], 0
    end = min(WINDOW_MS, res["meta"]["duration"])
    for g in res["meta"]["groups"]:
        n = min(MAX_ROWS, g["count"])
        step = g["count"] / n
        keep = {g["offset"] + int(i * step): i for i in range(n)}
        pts = [[round(t, 1), offset + keep[i]] for t, i in spikes if t < end and i in keep]
        rows.append({"label": g["label"], "kind": g["kind"], "offset": offset, "n": n, "pts": pts})
        offset += n
    return {"id": preset["id"], "duration": end, "rows": offset, "groups": rows}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    data = [preview(p) for p in build()]
    (OUT / "presetPreviews.json").write_text(json.dumps(data, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")
    stdp = next(p for p in build() if p["id"] == "stdp-learning")
    weights = run(Network.model_validate(stdp["network"]))["weights"]
    curve = {
        "t": [w["t"] for w in weights],
        "correlated": [round(w["corr_out"], 4) for w in weights],
        "random": [round(w["rand_out"], 4) for w in weights],
    }
    (OUT / "learningCurve.json").write_text(json.dumps(curve, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")
    bench = load_results()
    if bench:
        a, s = bench["ann"], bench["snn"]
        summary = {
            "annAccuracy": a["accuracy"],
            "snnAccuracy": s["accuracy"],
            "annDense": a["energy_nj_per_sample"],
            "annSkip": a["energy_zero_skipping_nj_per_sample"],
            "snnSynapses": s["energy_nj_per_sample"],
            "snnFull": s["energy_with_updates_nj_per_sample"],
        }
        (OUT / "benchmarkSummary.json").write_text(json.dumps(summary) + "\n", encoding="utf-8", newline="\n")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
