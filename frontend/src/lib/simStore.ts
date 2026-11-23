import { create } from "zustand";
import { streamSimulation } from "./api";
import type { Network } from "./network";

export interface GroupMeta {
  id: string;
  label: string;
  kind: "input" | "population";
  model: string | null;
  offset: number;
  count: number;
}

export interface SimMeta {
  name: string;
  dt: number;
  duration: number;
  steps: number;
  n_neurons: number;
  n_connections: number;
  groups: GroupMeta[];
  recorded: Record<string, number[]>;
  thresholds: Record<string, number>;
  plastic: { id: string; source: string; target: string }[];
}

export interface EnergySummary {
  snn_synops: number;
  ann_macs: number;
  snn_energy_nj: number;
  ann_energy_nj: number;
  ratio: number | null;
  activity: number;
  e_ac_pj: number;
  e_mac_pj: number;
  frame_ms: number;
  n_connections: number;
}

export interface SimSummary {
  wall_time_s: number;
  total_spikes: number;
  truncated: boolean;
  mean_rates: Record<string, number>;
  energy: EnergySummary;
  weight_histograms: Record<string, { bins: number[]; initial: number[]; final: number[] }>;
}

interface Chunk {
  t0: number;
  t1: number;
  progress: number;
  spikes: { t: number[]; id: number[] };
  rates: Record<string, number>;
  voltages: { t: number[]; v: Record<string, number[][]> };
  weights: Record<string, { mean: number; sample: number[] }>;
  synops: number;
}

export type SimStatus = "idle" | "running" | "done" | "error" | "stopped";

/**
 * Live simulation results. Large arrays are appended in place and `version`
 * is bumped so charts re-render without copying hundreds of thousands of points.
 */
interface SimState {
  status: SimStatus;
  error: string | null;
  progress: number;
  version: number;
  network: Network | null;
  meta: SimMeta | null;
  spikes: Record<string, { t: number[]; id: number[] }>;
  rateTimes: number[];
  rates: Record<string, number[]>;
  vTimes: number[];
  vTraces: Record<string, number[][]>;
  weightTimes: number[];
  weightMeans: Record<string, number[]>;
  weightSamples: Record<string, number[][]>;
  synopsTimes: number[];
  synops: number[];
  summary: SimSummary | null;
  start: (net: Network, paceMs: number) => Promise<void>;
  stop: () => void;
}

let controller: AbortController | null = null;

const empty = () => ({
  error: null,
  progress: 0,
  meta: null,
  spikes: {},
  rateTimes: [],
  rates: {},
  vTimes: [],
  vTraces: {},
  weightTimes: [],
  weightMeans: {},
  weightSamples: {},
  synopsTimes: [],
  synops: [],
  summary: null,
});

export const useSimStore = create<SimState>((set, get) => ({
  status: "idle",
  version: 0,
  network: null,
  ...empty(),

  stop() {
    controller?.abort();
    controller = null;
    if (get().status === "running") set({ status: "stopped" });
  },

  async start(net, paceMs) {
    controller?.abort();
    const ctrl = new AbortController();
    controller = ctrl;
    set({ ...empty(), status: "running", network: structuredClone(net), version: get().version + 1 });

    // Map a global neuron id to its group (groups are contiguous and ordered).
    let bounds: { id: string; end: number }[] = [];
    const groupOf = (gid: number) => {
      for (const b of bounds) if (gid < b.end) return b.id;
      return bounds[bounds.length - 1].id;
    };

    const onMeta = (meta: SimMeta) => {
      bounds = meta.groups.map((g) => ({ id: g.id, end: g.offset + g.count }));
      const spikes: SimState["spikes"] = {};
      const rates: SimState["rates"] = {};
      for (const g of meta.groups) {
        spikes[g.id] = { t: [], id: [] };
        rates[g.id] = [];
      }
      const vTraces: SimState["vTraces"] = {};
      for (const [pid, ids] of Object.entries(meta.recorded)) vTraces[pid] = ids.map(() => []);
      const weightMeans: SimState["weightMeans"] = {};
      const weightSamples: SimState["weightSamples"] = {};
      for (const p of meta.plastic) {
        weightMeans[p.id] = [];
        weightSamples[p.id] = [];
      }
      set({ meta, spikes, rates, vTraces, weightMeans, weightSamples });
    };

    const onChunk = (c: Chunk) => {
      const s = get();
      for (let i = 0; i < c.spikes.id.length; i++) {
        const g = s.spikes[groupOf(c.spikes.id[i])];
        g.t.push(c.spikes.t[i]);
        g.id.push(c.spikes.id[i]);
      }
      s.rateTimes.push((c.t0 + c.t1) / 2);
      for (const [gid, r] of Object.entries(c.rates)) s.rates[gid]?.push(r);
      for (const t of c.voltages.t) s.vTimes.push(t);
      for (const [pid, traces] of Object.entries(c.voltages.v)) {
        traces.forEach((tr, i) => {
          const acc = s.vTraces[pid]?.[i];
          if (acc) for (const v of tr) acc.push(v);
        });
      }
      s.weightTimes.push(c.t1);
      for (const [sid, w] of Object.entries(c.weights)) {
        s.weightMeans[sid]?.push(w.mean);
        const samples = s.weightSamples[sid];
        if (samples) w.sample.forEach((v, i) => (samples[i] ??= []).push(v));
      }
      s.synopsTimes.push(c.t1);
      s.synops.push(c.synops);
      set({ progress: c.progress, version: s.version + 1 });
    };

    try {
      await streamSimulation(
        net,
        paceMs,
        (m) => {
          const data = JSON.parse(m.data);
          if (m.event === "meta") onMeta(data);
          else if (m.event === "chunk") onChunk(data);
          else if (m.event === "error") set({ status: "error", error: data.message });
          else if (m.event === "done") set({ summary: data, status: "done", progress: 1, version: get().version + 1 });
        },
        ctrl.signal,
      );
      if (get().status === "running") set({ status: "error", error: "Stream ended before the simulation finished." });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      set({ status: "error", error: (e as Error).message });
    } finally {
      if (controller === ctrl) controller = null;
    }
  },
}));
