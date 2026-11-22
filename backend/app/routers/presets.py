"""Built-in preset networks (JSON files in ``app/presets``)."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, HTTPException

from ..schemas import Network

router = APIRouter(prefix="/presets", tags=["presets"])
PRESET_DIR = Path(__file__).resolve().parent.parent / "presets"


@lru_cache(maxsize=1)
def load_presets() -> list[dict]:
    presets = []
    for path in sorted(PRESET_DIR.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        Network.model_validate(data["network"])  # fail fast on a broken preset
        presets.append(data)
    return presets


@router.get("")
def list_presets() -> list[dict]:
    """Preset summaries (without the full network definitions)."""
    out = []
    for p in load_presets():
        net = p["network"]
        out.append(
            {
                "id": p["id"],
                "title": p["title"],
                "tags": p.get("tags", []),
                "description": net.get("description"),
                "biology": net.get("biology"),
                "references": p.get("references", []),
                "stats": {
                    "neurons": sum(x["count"] for x in net["populations"]) + sum(x["count"] for x in net.get("inputs", [])),
                    "populations": len(net["populations"]),
                    "inputs": len(net.get("inputs", [])),
                    "projections": len(net.get("synapses", [])),
                    "models": sorted({x["model"] for x in net["populations"]}),
                    "plastic": any(s.get("plasticity") == "stdp" for s in net.get("synapses", [])),
                    "duration_ms": net["sim"]["duration"],
                },
            }
        )
    return out


@router.get("/{preset_id}")
def get_preset(preset_id: str) -> dict:
    for p in load_presets():
        if p["id"] == preset_id:
            return p
    raise HTTPException(404, f"Unknown preset {preset_id!r}")
