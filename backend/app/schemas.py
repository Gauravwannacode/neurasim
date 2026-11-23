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


class _Base(BaseModel):
    """Python's JSON parser accepts Infinity and NaN; a simulation must not."""

    model_config = ConfigDict(allow_inf_nan=False)


class Position(_Base):
    x: float = 0
    y: float = 0


class NeuronParams(_Base):
    v_th: float
    t_ref: float = Field(0, ge=0, le=1000)
    tau_syn: float = Field(5, ge=0.1, le=1000)
    bias: float = Field(0, ge=-10_000, le=10_000)
    noise: float = Field(0, ge=0, le=10_000)
    # LIF
    tau_m: float | None = Field(None, ge=0.1, le=10_000)
    v_rest: float | None = None
    v_reset: float | None = None
    adapt_b: float | None = None
    tau_w: float | None = Field(None, gt=0)
    # Izhikevich
    a: float | None = None
    b: float | None = None
    c: float | None = None
    d: float | None = None


class Population(_Base):
    id: str = Field(min_length=1, max_length=100)
    label: str = Field("", max_length=200)
    count: int = Field(ge=1, le=5000)
    model: NeuronModel
    params: NeuronParams
    position: Position = Position()


class InputSource(_Base):
    id: str = Field(min_length=1, max_length=100)
    label: str = Field("", max_length=200)
    count: int = Field(ge=1, le=5000)
    kind: InputKind
    rate_hz: float = Field(20, ge=0, le=10_000)
    rate_max_hz: float | None = Field(None, ge=0, le=10_000)
    start_ms: float = Field(0, ge=0)
    stop_ms: float | None = Field(None, ge=0)
    pattern: list[list[float]] | None = Field(None, max_length=5000)
    period_ms: float | None = Field(None, ge=1)
    position: Position = Position()


class STDPParams(_Base):
    A_plus: float = 0.01
    A_minus: float = 0.012
    tau_plus: float = Field(20, gt=0)
    tau_minus: float = Field(20, gt=0)
    w_min: float = 0
    w_max: float = 1


class Synapse(_Base):
    id: str = Field(min_length=1, max_length=100)
    source: str
    target: str
    weight: float = Field(ge=-10_000, le=10_000)
    weight_std: float = Field(0, ge=0, le=10_000)
    p_connect: float = Field(1, ge=0, le=1)
    delay_ms: float = Field(1, ge=0, le=500)
    allow_autapses: bool = False
    plasticity: Literal["static", "stdp"] = "static"
    stdp: STDPParams = STDPParams()

    @model_validator(mode="after")
    def _weight_within_stdp_range(self) -> "Synapse":
        lo, hi = sorted((self.stdp.w_min, self.stdp.w_max))
        if self.plasticity == "stdp" and not lo <= self.weight <= hi:
            raise ValueError(
                f"synapse {self.id}: initial weight {self.weight:g} is outside the STDP range [{lo:g}, {hi:g}]"
            )
        return self


class SimSettings(_Base):
    dt: float = Field(0.1, ge=0.005, le=1)
    duration: float = Field(500, ge=1, le=1_000_000)
    seed: int = Field(42, ge=0, le=2**53)
    record_per_population: int = Field(5, ge=0, le=50)
    chunk_ms: float = Field(20, ge=1, le=10_000)


class Network(_Base):
    version: Literal[1] = 1
    name: str = Field("Untitled network", max_length=200)
    description: str | None = Field(None, max_length=5000)
    biology: str | None = Field(None, max_length=5000)
    sim: SimSettings = SimSettings()
    populations: list[Population] = Field(min_length=1, max_length=100)
    inputs: list[InputSource] = Field([], max_length=100)
    synapses: list[Synapse] = Field([], max_length=500)

    @model_validator(mode="after")
    def _check_references(self) -> "Network":
        pop_ids = [p.id for p in self.populations]
        in_ids = [i.id for i in self.inputs]
        all_ids = pop_ids + in_ids
        if len(set(all_ids)) != len(all_ids):
            raise ValueError("duplicate population/input ids")
        syn_ids = [s.id for s in self.synapses]
        if len(set(syn_ids)) != len(syn_ids):
            raise ValueError("duplicate synapse ids")
        known, pops = set(all_ids), set(pop_ids)
        for s in self.synapses:
            if s.source not in known:
                raise ValueError(f"synapse {s.id}: unknown source {s.source!r}")
            if s.target not in pops:
                raise ValueError(f"synapse {s.id}: target {s.target!r} must be a neuron population")
        return self
