import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getJSON } from "../lib/api";
import { MODEL_COLORS, MODEL_LABELS, parseNetwork, type NeuronModel } from "../lib/network";
import { useNetworkStore } from "../lib/store";
import { MiniRaster, Spotlight, type Preview } from "../components/fx/fx";
import previews from "../data/presetPreviews.json";

interface PresetSummary {
  id: string;
  title: string;
  tags: string[];
  description: string;
  biology: string;
  references: string[];
  stats: { neurons: number; projections: number; models: NeuronModel[]; plastic: boolean; duration_ms: number };
}

const GLOW: Record<string, string> = {
  "winner-take-all": "#8f7bf0",
  "central-pattern-generator": "#22c3a6",
  "echo-state-network": "#5ea3f0",
  "stdp-learning": "#ff6a4d",
  "v1-column": "#ec5fa6",
};

export default function Presets() {
  const [presets, setPresets] = useState<PresetSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [params] = useSearchParams();
  const setNetwork = useNetworkStore((s) => s.setNetwork);
  const navigate = useNavigate();
  const autorun = useRef<string | null>(null);

  useEffect(() => {
    getJSON<PresetSummary[]>("/presets").then(setPresets).catch((e) => setError((e as Error).message));
  }, []);

  const load = useCallback(
    async (id: string, thenRun: boolean) => {
      setLoading(id);
      try {
        const preset = await getJSON<{ network: unknown }>(`/presets/${encodeURIComponent(id)}`);
        setNetwork(parseNetwork(preset.network));
        navigate(thenRun ? "/dashboard" : "/builder", thenRun ? { state: { autorun: true } } : undefined);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(null);
      }
    },
    [navigate, setNetwork],
  );

  // Deep link from the landing page and command palette: /presets?run=<id>
  const wanted = params.get("run");
  useEffect(() => {
    if (wanted && autorun.current !== wanted) {
      autorun.current = wanted;
      load(wanted, true);
    }
  }, [wanted, load]);

  return (
    <div className="mx-auto max-w-7xl p-5 md:p-10">
      <h1 className="display text-5xl text-bone md:text-6xl">Circuits</h1>
      <p className="mb-8 mt-4 max-w-xl text-lg text-slate-300">Open one in the builder to take it apart, or run it as it is. Each raster replays a real run.</p>
      {error && <div className="mb-4 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
      {!presets && !error && <p className="text-slate-400">Loading circuits…</p>}
      <div className="grid gap-5 md:grid-cols-2">
        {presets?.map((p, i) => {
          const preview = (previews as Preview[]).find((x) => x.id === p.id);
          const wide = i === presets.length - 1 && presets.length % 2 === 1;
          return (
            <Spotlight key={p.id} glow={GLOW[p.id]} className={`flex flex-col rounded-[28px] border border-ink-700 bg-ink-900 ${wide ? "md:col-span-2" : ""}`}>
              {preview && <MiniRaster preview={preview} className="h-44 w-full bg-ink-950/60 px-6 py-5" />}
              <div className="flex flex-1 flex-col p-6 md:p-7">
                <h2 className="display text-3xl" style={{ color: GLOW[p.id] }}>{p.title}</h2>
                <p className="mt-3 leading-relaxed text-slate-200">{p.description}</p>
                {open === p.id && (
                  <div className="mt-4 border-l-2 pl-4" style={{ borderColor: GLOW[p.id] }}>
                    <p className="text-sm leading-relaxed text-slate-300">{p.biology}</p>
                    <ul className="mt-3 space-y-1 text-xs text-slate-400">{p.references.map((r) => <li key={r}>{r}</li>)}</ul>
                  </div>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400">
                  <span>{p.stats.neurons} neurons</span>
                  <span>{p.stats.projections} projections</span>
                  <span>{p.stats.duration_ms} ms</span>
                  {p.stats.models.map((m) => (
                    <span key={m} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: MODEL_COLORS[m] }} />{MODEL_LABELS[m]}</span>
                  ))}
                  {p.stats.plastic && <span>learns</span>}
                </div>
                <div className="mt-auto flex flex-wrap gap-2 pt-6">
                  <button className="btn-primary px-5 py-2" disabled={loading !== null} onClick={() => load(p.id, true)}>{loading === p.id ? "Loading…" : "Run"}</button>
                  <button className="btn-ghost px-5 py-2" disabled={loading !== null} onClick={() => load(p.id, false)}>Open in builder</button>
                  <button className="btn text-slate-400 hover:text-bone" aria-expanded={open === p.id} onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? "Hide the biology" : "The biology"}</button>
                </div>
              </div>
            </Spotlight>
          );
        })}
      </div>
    </div>
  );
}
