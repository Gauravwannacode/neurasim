import { create } from "zustand";
import type { Network } from "./network";
import { useNetworkStore } from "./store";

const LIMIT = 100;
const BURST_MS = 500; // edits closer together than this undo as one step

interface History {
  past: Network[];
  future: Network[];
  undo: () => void;
  redo: () => void;
}

let replaying = false;
let lastChange = 0;

function show(network: Network) {
  replaying = true;
  const s = useNetworkStore.getState();
  useNetworkStore.setState({ network, selection: null, revision: s.revision + 1 });
  replaying = false;
  lastChange = 0; // the next edit starts a new step
}

export const useHistory = create<History>((set, get) => ({
  past: [],
  future: [],
  undo() {
    const { past, future } = get();
    const previous = past[past.length - 1];
    if (!previous) return;
    set({ past: past.slice(0, -1), future: [useNetworkStore.getState().network, ...future] });
    show(previous);
  },
  redo() {
    const { past, future } = get();
    const next = future[0];
    if (!next) return;
    set({ past: [...past, useNetworkStore.getState().network], future: future.slice(1) });
    show(next);
  },
}));

useNetworkStore.subscribe((state, before) => {
  if (replaying || state.network === before.network) return;
  const now = performance.now();
  const replaced = state.revision !== before.revision; // imports and presets are always their own step
  if (replaced || lastChange === 0 || now - lastChange > BURST_MS) {
    useHistory.setState((h) => ({ past: [...h.past, before.network].slice(-LIMIT), future: [] }));
  } else {
    useHistory.setState({ future: [] });
  }
  lastChange = now;
});
