import { ReactFlowProvider } from "@xyflow/react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Tour from "../components/Tour";
import { useHistory } from "../lib/history";
import { networkFromHash, shareLink } from "../lib/share";
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
    <aside data-tour="palette" className="hidden w-60 shrink-0 flex-col gap-5 overflow-y-auto border-r border-ink-700 bg-ink-900 p-4 md:flex">
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
  const { undo, redo } = useHistory.getState();
  const canUndo = useHistory((h) => h.past.length > 0);
  const canRedo = useHistory((h) => h.future.length > 0);
  const [tour, setTour] = useState(false);
  const [note, setNote] = useState<{ text: string; bad?: boolean; link?: string } | null>(null);
  const { hash } = useLocation();

  // Open a shared network, then drop it from the address so a reload keeps later edits.
  useEffect(() => {
    if (!hash.startsWith("#n=")) return;
    let cancelled = false;
    networkFromHash(hash)
      .then((shared) => {
        if (cancelled || !shared) return;
        setNetwork(shared);
        setNote({ text: `Opened “${shared.name}”. Undo brings back what you had.` });
      })
      .catch((e: Error) => !cancelled && setNote({ text: e.message, bad: true }))
      .finally(() => !cancelled && navigate("/builder", { replace: true }));
    return () => { cancelled = true; };
  }, [hash, navigate, setNetwork]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement).closest("input, textarea, select")) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  async function share() {
    let link: string | undefined;
    try {
      link = await shareLink(network);
      await navigator.clipboard.writeText(link);
      setNote({ text: "Link copied. Anyone who opens it gets this network." });
    } catch (e) {
      setNote(link ? { text: "Copy this link to share the network:", link } : { text: (e as Error).message, bad: true });
    }
  }
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
        <div className="flex flex-wrap items-center gap-2">
          <NetworkJsonButtons />
          <button className="btn-ghost" onClick={share}>Share</button>
          <button className="btn-ghost" disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)">Undo</button>
          <button className="btn-ghost" disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Shift+Z)">Redo</button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button className="btn hidden text-slate-400 hover:text-bone md:inline-flex" onClick={() => setTour(true)}>Tour</button>
          <button
            className="btn-ghost"
            onClick={() => setNetwork(starterNetwork())}
            title="Start over from the starter network (you can undo this)"
          >
            Reset
          </button>
          <button data-tour="run" className="btn-primary" disabled={empty} onClick={() => navigate("/dashboard", { state: { autorun: true } })}>
            Run simulation
          </button>
        </div>
      </div>
      {note && (
        <div role="status" className={`flex items-center gap-3 border-b border-ink-700 px-4 py-2 text-sm ${note.bad ? "bg-rose-500/10 text-rose-200" : "bg-ink-800 text-slate-200"}`}>
          <span>{note.text}</span>
          {note.link && <input readOnly className="input max-w-md" value={note.link} aria-label="Share link" onFocus={(e) => e.target.select()} />}
          <button className="ml-auto text-slate-400 hover:text-bone" onClick={() => setNote(null)}>Dismiss</button>
        </div>
      )}
      {tour && <Tour onClose={() => setTour(false)} />}
      <div className="flex min-h-0 flex-1">
        <Palette />
        <div className="min-w-0 flex-1" data-tour="canvas">
          <ReactFlowProvider>
            <NetworkCanvas rates={summary?.mean_rates} learnedWeights={learned} />
          </ReactFlowProvider>
        </div>
        <div className="hidden md:block" data-tour="inspector"><Inspector /></div>
      </div>
    </div>
  );
}
