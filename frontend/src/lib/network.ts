/**
 * Network definition schema shared by the builder, presets, export/import and
 * the backend simulator (mirrored by backend/app/schemas.py).
 *
 * Units: time in ms, voltage in mV. Synaptic weights depend on the *target*
 * model: for LIF a weight w gives a post-synaptic potential of roughly w mV;
 * for Izhikevich (dimensionless I) and Hodgkin-Huxley (µA/cm²) it is the peak
 * synaptic current. Negative weights are inhibitory.
 */
import { z } from "zod";

export const NEURON_MODELS = ["lif", "izhikevich", "hh"] as const;
export type NeuronModel = (typeof NEURON_MODELS)[number];

export const MODEL_LABELS: Record<NeuronModel, string> = {
  lif: "Leaky Integrate-and-Fire",
  izhikevich: "Izhikevich",
  hh: "Hodgkin-Huxley",
};

export const MODEL_COLORS: Record<NeuronModel, string> = {
  lif: "#ff6a4d",
  izhikevich: "#8f7bf0",
  hh: "#22c3a6",
};

const position = z.object({ x: z.number(), y: z.number() });

export const neuronParams = z
  .object({
    v_th: z.number(),
    t_ref: z.number().min(0),
    tau_syn: z.number().positive().default(5),
    bias: z.number().default(0),
    noise: z.number().min(0).default(0),
    // LIF
    tau_m: z.number().positive().optional(),
    v_rest: z.number().optional(),
    v_reset: z.number().optional(),
    adapt_b: z.number().optional(),
    tau_w: z.number().positive().optional(),
    // Izhikevich
    a: z.number().optional(),
    b: z.number().optional(),
    c: z.number().optional(),
    d: z.number().optional(),
  })
  .passthrough();
export type NeuronParams = z.infer<typeof neuronParams>;

export const populationSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  count: z.number().int().min(1).max(5000),
  model: z.enum(NEURON_MODELS),
  params: neuronParams,
  position: position.default({ x: 0, y: 0 }),
});
export type Population = z.infer<typeof populationSchema>;

export const INPUT_KINDS = ["poisson", "rate", "pattern"] as const;
export type InputKind = (typeof INPUT_KINDS)[number];
export const INPUT_LABELS: Record<InputKind, string> = {
  poisson: "Poisson process",
  rate: "Rate-coded (regular)",
  pattern: "Custom pattern",
};

export const inputSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  count: z.number().int().min(1).max(5000),
  kind: z.enum(INPUT_KINDS),
  rate_hz: z.number().min(0).default(20),
  /** For rate-coded inputs: per-neuron rates spread linearly from rate_hz to rate_max_hz. */
  rate_max_hz: z.number().min(0).optional(),
  start_ms: z.number().min(0).default(0),
  stop_ms: z.number().min(0).nullable().default(null),
  /** For pattern inputs: spike times (ms) for each input neuron. */
  pattern: z.array(z.array(z.number())).optional(),
  /** Pattern repeats with this period (ms) if set. */
  period_ms: z.number().positive().nullable().optional(),
  position: position.default({ x: 0, y: 0 }),
});
export type InputSource = z.infer<typeof inputSchema>;

export const stdpSchema = z.object({
  A_plus: z.number().default(0.01),
  A_minus: z.number().default(0.012),
  tau_plus: z.number().positive().default(20),
  tau_minus: z.number().positive().default(20),
  w_min: z.number().default(0),
  w_max: z.number().default(1),
});
export type STDPParams = z.infer<typeof stdpSchema>;

export const synapseSchema = z.object({
  id: z.string().min(1),
  source: z.string(),
  target: z.string(),
  weight: z.number(),
  weight_std: z.number().min(0).default(0),
  p_connect: z.number().min(0).max(1).default(1),
  delay_ms: z.number().min(0).default(1),
  allow_autapses: z.boolean().default(false),
  plasticity: z.enum(["static", "stdp"]).default("static"),
  stdp: stdpSchema.prefault({}),
});
export type Synapse = z.infer<typeof synapseSchema>;

export const simSchema = z.object({
  dt: z.number().positive().max(1).default(0.1),
  duration: z.number().positive().default(500),
  seed: z.number().int().default(42),
  record_per_population: z.number().int().min(0).max(50).default(5),
  chunk_ms: z.number().positive().default(20),
});
export type SimSettings = z.infer<typeof simSchema>;

export const networkSchema = z.object({
  version: z.literal(1).default(1),
  name: z.string().default("Untitled network"),
  description: z.string().optional(),
  biology: z.string().optional(),
  sim: simSchema.prefault({}),
  populations: z.array(populationSchema),
  inputs: z.array(inputSchema).default([]),
  synapses: z.array(synapseSchema).default([]),
});
export type Network = z.infer<typeof networkSchema>;

// ---------------------------------------------------------------------------
// Defaults & factories
// ---------------------------------------------------------------------------

export const DEFAULT_PARAMS: Record<NeuronModel, NeuronParams> = {
  lif: { tau_m: 20, v_rest: -65, v_reset: -70, v_th: -50, t_ref: 2, tau_syn: 5, bias: 0, noise: 0, adapt_b: 0, tau_w: 100 },
  // Regular-spiking cortical neuron (Izhikevich 2003)
  izhikevich: { a: 0.02, b: 0.2, c: -65, d: 8, v_th: 30, t_ref: 0, tau_syn: 5, bias: 0, noise: 0 },
  // Squid giant axon (Hodgkin & Huxley 1952), threshold = spike detection level
  hh: { v_th: 0, t_ref: 2, tau_syn: 5, bias: 0, noise: 0 },
};

/** Typical weight magnitude for each target model, used when drawing new edges. */
export const DEFAULT_WEIGHT: Record<NeuronModel, number> = { lif: 4, izhikevich: 6, hh: 4 };

let counter = 0;
export function uid(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}

export function makePopulation(model: NeuronModel, position = { x: 300, y: 150 }): Population {
  return {
    id: uid("pop"),
    label: `${model.toUpperCase()} population`,
    count: 50,
    model,
    params: { ...DEFAULT_PARAMS[model] },
    position,
  };
}

export function makeInput(kind: InputKind, position = { x: 40, y: 150 }): InputSource {
  return {
    id: uid("in"),
    label: `${INPUT_LABELS[kind]}`,
    count: 50,
    kind,
    rate_hz: 20,
    rate_max_hz: kind === "rate" ? 80 : undefined,
    start_ms: 0,
    stop_ms: null,
    pattern: kind === "pattern" ? Array.from({ length: 50 }, (_, i) => [10 + i * 2]) : undefined,
    period_ms: kind === "pattern" ? 100 : null,
    position,
  };
}

export function makeSynapse(source: string, target: string, weight: number): Synapse {
  return {
    id: uid("syn"),
    source,
    target,
    weight,
    weight_std: 0,
    p_connect: 0.2,
    delay_ms: 1,
    allow_autapses: false,
    plasticity: "static",
    stdp: { A_plus: 0.01, A_minus: 0.012, tau_plus: 20, tau_minus: 20, w_min: 0, w_max: weight * 2 || 1 },
  };
}

export function starterNetwork(): Network {
  const input = { ...makeInput("poisson", { x: 40, y: 160 }), id: "input", label: "Poisson input", count: 100, rate_hz: 15 };
  const exc = { ...makePopulation("lif", { x: 360, y: 80 }), id: "exc", label: "Excitatory", count: 80 };
  const inh = { ...makePopulation("lif", { x: 360, y: 300 }), id: "inh", label: "Inhibitory", count: 20 };
  return {
    version: 1,
    name: "Starter E/I network",
    description: "A Poisson input drives a small balanced excitatory/inhibitory network.",
    sim: { dt: 0.1, duration: 500, seed: 42, record_per_population: 5, chunk_ms: 20 },
    populations: [exc, inh],
    inputs: [input],
    synapses: [
      { ...makeSynapse("input", "exc", 5), id: "in_exc", p_connect: 0.1 },
      { ...makeSynapse("input", "inh", 5), id: "in_inh", p_connect: 0.1 },
      { ...makeSynapse("exc", "inh", 2), id: "exc_inh", p_connect: 0.2 },
      { ...makeSynapse("inh", "exc", -4), id: "inh_exc", p_connect: 0.3 },
      { ...makeSynapse("exc", "exc", 1), id: "exc_exc", p_connect: 0.1, delay_ms: 2 },
    ],
  };
}

/** Validate untrusted JSON (imports, presets). Throws a readable error. */
export function parseNetwork(raw: unknown): Network {
  const result = networkSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`Invalid network: ${issue.path.join(".") || "(root)"} ${issue.message}`);
  }
  const net = result.data;
  const ids = new Set([...net.populations.map((p) => p.id), ...net.inputs.map((i) => i.id)]);
  if (ids.size !== net.populations.length + net.inputs.length) throw new Error("Invalid network: duplicate node ids");
  for (const s of net.synapses) {
    if (!ids.has(s.source)) throw new Error(`Invalid network: synapse ${s.id} has unknown source ${s.source}`);
    if (!net.populations.some((p) => p.id === s.target))
      throw new Error(`Invalid network: synapse ${s.id} must target a neuron population`);
  }
  return net;
}

/** Canonical form of everything that affects a simulation (labels, text and layout do not). */
export function simulationKey(net: Network): string {
  const strip = <T extends { position: unknown; label: string }>({ position: _p, label: _l, ...rest }: T) => rest;
  return JSON.stringify([net.sim, net.populations.map(strip), net.inputs.map(strip), net.synapses]);
}

export function nodeModel(net: Network, id: string): NeuronModel | "input" | undefined {
  if (net.inputs.some((i) => i.id === id)) return "input";
  return net.populations.find((p) => p.id === id)?.model;
}
