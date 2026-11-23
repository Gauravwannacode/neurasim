import { ReactFlowProvider } from "@xyflow/react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useSimStore } from "../lib/simStore";
import NetworkCanvas from "../components/builder/NetworkCanvas";
import Inspector from "../components/builder/Inspector";
import { NetworkJsonButtons } from "../components/export/ExportButtons";
import { useNetworkStore } from "../lib/store";
import {
  INPUT_KINDS,
  INPUT_LABELS,
  MODEL_COLORS,
  MODEL_LABELS,
  NEURON_MODELS,
  makeInput,
  makePopulation,
  simulationKey,
  starterNetwork,
} from "../lib/network";

function Palette() {
  const { addPopulation, addInput } = useNetworkStore.getState();
  const n = useNetworkStore((s) => s.network.populations.length + s.network.inputs.length);
  const jitter = () => ({ x: 260 + (n % 4) * 60, y: 60 + (n % 6) * 70 });

  return (
    <aside className="hidden w-60 shrink-0 flex-col gap-5 overflow-y-auto border-r border-ink-700 bg-ink-900 p-4 md:flex">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-bone">Neuron populations</h3>
        <div className="flex flex-col gap-1.5">
          {NEURON_MODELS.map((m) => (
            <button key={m} className="btn-ghost justify-start text-left" onClick={() => addPopulation(makePopulation(m, jitter()))}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: MODEL_COLORS[m] }} />
              {MODEL_LABELS[m]}
            </button>
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-bone">Input spike trains</h3>
        <div className="flex flex-col gap-1.5">
          {INPUT_KINDS.map((k) => (
            <button key={k} className="btn-ghost justify-start text-left" onClick={() => addInput(makeInput(k, { x: 20, y: 60 + (n % 6) * 70 }))}>
              <span className="text-amber-300">⟿</span>
              {INPUT_LABELS[k]}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-auto space-y-1 text-[11px] leading-relaxed text-slate-500">
        <p>
          <span className="text-sky-400">→</span> excitatory · <span className="text-azure">●</span> inhibitory ·{" "}
          <span className="text-fuchsia-300">- -</span> plastic (STDP)
        </p>
      </div>
    </aside>
  );
}

export default function Builder() {
  const navigate = useNavigate();
  const network = useNetworkStore((s) => s.network);
  const setNetwork = useNetworkStore((s) => s.setNetwork);
  const empty = network.populations.length === 0;
  // Overlay results of the latest run on the canvas (node glow = firing rate, edge label = learned weight).
  const lastSummary = useSimStore((s) => s.summary);
  const runNetwork = useSimStore((s) => s.network);
  const fresh = useMemo(() => runNetwork !== null && simulationKey(runNetwork) === simulationKey(network), [runNetwork, network]);
  const summary = fresh ? lastSummary : null;
  const weightMeans = useSimStore((s) => s.weightMeans);
  const learned = useMemo(() => {
    if (!summary) return undefined;
    const out: Record<string, number> = {};
    for (const [id, series] of Object.entries(weightMeans)) if (series.length) out[id] = series[series.length - 1];
    return out;
  }, [summary, weightMeans]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-700 px-4 py-2.5">
        <h2 className="mr-2 truncate text-lg font-semibold text-bone">{network.name}</h2>
        <div className="flex items-center gap-2">
          <NetworkJsonButtons />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            className="btn-ghost"
            onClick={() => confirm("Replace the current network with the starter network?") && setNetwork(starterNetwork())}
          >
            Reset
          </button>
          <button className="btn-primary" disabled={empty} onClick={() => navigate("/dashboard", { state: { autorun: true } })}>
            Run simulation
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <Palette />
        <div className="min-w-0 flex-1">
          <ReactFlowProvider>
            <NetworkCanvas rates={summary?.mean_rates} learnedWeights={learned} />
          </ReactFlowProvider>
        </div>
        <div className="hidden md:block"><Inspector /></div>
      </div>
    </div>
  );
}
