"""Pydantic models for the network definition JSON.

Mirrors ``frontend/src/lib/network.ts``. Units: time in ms, voltage in mV.
Synaptic weights depend on the *target* model: for LIF a weight of w produces
a PSP of roughly w mV (the simulator scales the current jump by tau_m/tau_syn);
for Izhikevich (dimensionless I) and Hodgkin-Huxley (µA/cm²) it is the peak
synaptic current.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

NeuronModel = Literal["lif", "izhikevich", "hh"]
InputKind = Literal["poisson", "rate", "pattern"]


class Position(BaseModel):
    x: float = 0
    y: float = 0


class NeuronParams(BaseModel):
    model_config = ConfigDict(extra="allow")

    v_th: float
    t_ref: float = Field(0, ge=0)
    tau_syn: float = Field(5, gt=0)
    bias: float = 0
    noise: float = Field(0, ge=0)
    # LIF
    tau_m: float | None = Field(None, gt=0)
    v_rest: float | None = None
    v_reset: float | None = None
    adapt_b: float | None = None
    tau_w: float | None = Field(None, gt=0)
    # Izhikevich
    a: float | None = None
    b: float | None = None
    c: float | None = None
    d: float | None = None


class Population(BaseModel):
    id: str = Field(min_length=1)
    label: str = ""
    count: int = Field(ge=1, le=5000)
    model: NeuronModel
    params: NeuronParams
    position: Position = Position()


class InputSource(BaseModel):
    id: str = Field(min_length=1)
    label: str = ""
    count: int = Field(ge=1, le=5000)
    kind: InputKind
    rate_hz: float = Field(20, ge=0)
    rate_max_hz: float | None = Field(None, ge=0)
    start_ms: float = Field(0, ge=0)
    stop_ms: float | None = Field(None, ge=0)
    pattern: list[list[float]] | None = None
    period_ms: float | None = Field(None, gt=0)
    position: Position = Position()


class STDPParams(BaseModel):
    A_plus: float = 0.01
    A_minus: float = 0.012
    tau_plus: float = Field(20, gt=0)
    tau_minus: float = Field(20, gt=0)
    w_min: float = 0
    w_max: float = 1


class Synapse(BaseModel):
    id: str = Field(min_length=1)
    source: str
    target: str
    weight: float
    weight_std: float = Field(0, ge=0)
    p_connect: float = Field(1, ge=0, le=1)
    delay_ms: float = Field(1, ge=0)
    allow_autapses: bool = False
    plasticity: Literal["static", "stdp"] = "static"
    stdp: STDPParams = STDPParams()


class SimSettings(BaseModel):
    dt: float = Field(0.1, gt=0, le=1)
    duration: float = Field(500, gt=0)
    seed: int = 42
    record_per_population: int = Field(5, ge=0, le=50)
    chunk_ms: float = Field(20, gt=0)


class Network(BaseModel):
    version: Literal[1] = 1
    name: str = "Untitled network"
    description: str | None = None
    biology: str | None = None
    sim: SimSettings = SimSettings()
    populations: list[Population]
    inputs: list[InputSource] = []
    synapses: list[Synapse] = []

    @model_validator(mode="after")
    def _check_references(self) -> "Network":
        pop_ids = [p.id for p in self.populations]
        in_ids = [i.id for i in self.inputs]
        all_ids = pop_ids + in_ids
        if len(set(all_ids)) != len(all_ids):
            raise ValueError("duplicate population/input ids")
        known, pops = set(all_ids), set(pop_ids)
        for s in self.synapses:
            if s.source not in known:
                raise ValueError(f"synapse {s.id}: unknown source {s.source!r}")
            if s.target not in pops:
                raise ValueError(f"synapse {s.id}: target {s.target!r} must be a neuron population")
        return self
