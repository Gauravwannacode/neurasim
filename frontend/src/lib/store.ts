import { create } from "zustand";
import {
  type InputSource,
  type Network,
  type Population,
  type SimSettings,
  type Synapse,
  parseNetwork,
  starterNetwork,
} from "./network";

const STORAGE_KEY = "neurasim.network.v1";

function loadSaved(): Network {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return parseNetwork(JSON.parse(raw));
  } catch {
    /* corrupted or unavailable storage: fall back to the starter network */
  }
  return starterNetwork();
}

export type Selection = { kind: "population" | "input" | "synapse"; id: string } | null;

interface NetworkStore {
  network: Network;
  selection: Selection;
  /** Bumped whenever the network is replaced wholesale (import / preset) so views can refit. */
  revision: number;
  select: (s: Selection) => void;
  setNetwork: (n: Network) => void;
  updateMeta: (patch: Partial<Pick<Network, "name" | "description" | "biology">>) => void;
  updateSim: (patch: Partial<SimSettings>) => void;
  addPopulation: (p: Population) => void;
  updatePopulation: (id: string, patch: Partial<Population>) => void;
  addInput: (i: InputSource) => void;
  updateInput: (id: string, patch: Partial<InputSource>) => void;
  addSynapse: (s: Synapse) => void;
  updateSynapse: (id: string, patch: Partial<Synapse>) => void;
  moveNode: (id: string, position: { x: number; y: number }) => void;
  removeNode: (id: string) => void;
  removeSynapse: (id: string) => void;
}

export const useNetworkStore = create<NetworkStore>((set) => ({
  network: loadSaved(),
  selection: null,
  revision: 0,
  select: (selection) => set({ selection }),
  setNetwork: (network) => set((s) => ({ network, selection: null, revision: s.revision + 1 })),
  updateMeta: (patch) => set((s) => ({ network: { ...s.network, ...patch } })),
  updateSim: (patch) => set((s) => ({ network: { ...s.network, sim: { ...s.network.sim, ...patch } } })),
  addPopulation: (p) =>
    set((s) => ({ network: { ...s.network, populations: [...s.network.populations, p] }, selection: { kind: "population", id: p.id } })),
  updatePopulation: (id, patch) =>
    set((s) => ({
      network: { ...s.network, populations: s.network.populations.map((p) => (p.id === id ? { ...p, ...patch } : p)) },
    })),
  addInput: (i) =>
    set((s) => ({ network: { ...s.network, inputs: [...s.network.inputs, i] }, selection: { kind: "input", id: i.id } })),
  updateInput: (id, patch) =>
    set((s) => ({
      network: { ...s.network, inputs: s.network.inputs.map((i) => (i.id === id ? { ...i, ...patch } : i)) },
    })),
  addSynapse: (syn) =>
    set((s) => ({ network: { ...s.network, synapses: [...s.network.synapses, syn] }, selection: { kind: "synapse", id: syn.id } })),
  updateSynapse: (id, patch) =>
    set((s) => ({
      network: { ...s.network, synapses: s.network.synapses.map((x) => (x.id === id ? { ...x, ...patch } : x)) },
    })),
  moveNode: (id, position) =>
    set((s) => ({
      network: {
        ...s.network,
        populations: s.network.populations.map((p) => (p.id === id ? { ...p, position } : p)),
        inputs: s.network.inputs.map((i) => (i.id === id ? { ...i, position } : i)),
      },
    })),
  removeNode: (id) =>
    set((s) => ({
      network: {
        ...s.network,
        populations: s.network.populations.filter((p) => p.id !== id),
        inputs: s.network.inputs.filter((i) => i.id !== id),
        synapses: s.network.synapses.filter((x) => x.source !== id && x.target !== id),
      },
      selection: null,
    })),
  removeSynapse: (id) =>
    set((s) => ({ network: { ...s.network, synapses: s.network.synapses.filter((x) => x.id !== id) }, selection: null })),
}));

// Persist the working network per browser (a convenience; JSON export is the durable path).
useNetworkStore.subscribe((state) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.network));
  } catch {
    /* ignore quota / private mode */
  }
});
