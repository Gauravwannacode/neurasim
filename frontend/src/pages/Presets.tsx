import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getJSON } from "../lib/api";
import { MODEL_COLORS, MODEL_LABELS, parseNetwork, type NeuronModel } from "../lib/network";
import { useNetworkStore } from "../lib/store";

interface PresetSummary {
  id: string;
  title: string;
  tags: string[];
  description: string;
  biology: string;
  references: string[];
  stats: {
    neurons: number;
    populations: number;
    inputs: number;
    projections: number;
    models: NeuronModel[];
    plastic: boolean;
    duration_ms: number;
  };
}

/** Small decorative spike-train motif per preset, so cards are distinguishable at a glance. */
function Motif({ id }: { id: string }) {
  const rows = 6;
  const pattern = (r: number, i: number): boolean => {
    switch (id) {
      case "winner-take-all":
        return r < 2 ? i % 3 === 0 : i % 11 === r;
      case "central-pattern-generator":
        return (r < 3 ? Math.floor(i / 8) % 2 === 0 : Math.floor(i / 8) % 2 === 1) && (i + r) % 2 === 0;
      case "echo-state-network":
        return (i * 7 + r * 13) % 9 === 0;
      case "stdp-learning":
        return r < 3 ? i % 8 === 2 : (i * 5 + r * 3) % 8 === 0;
      default:
        return i % 6 === r || (i % 6 === r - 1 && i > 10);
    }
  };
  return (
    <svg viewBox="0 0 160 48" className="h-12 w-full" aria-hidden>
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: 32 }, (_, i) =>
          pattern(r, i) ? <rect key={`${r}-${i}`} x={i * 5} y={r * 8} width="1.6" height="6" rx="0.8" fill={r < 3 ? "#38bdf8" : "#f472b6"} /> : null,
        ),
      )}
    </svg>
  );
}

export default function Presets() {
  const [presets, setPresets] = useState<PresetSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const setNetwork = useNetworkStore((s) => s.setNetwork);
  const navigate = useNavigate();

  useEffect(() => {
    getJSON<PresetSummary[]>("/presets").then(setPresets).catch((e) => setError((e as Error).message));
  }, []);

  async function load(id: string, thenRun: boolean) {
    setLoading(id);
    try {
      const preset = await getJSON<{ network: unknown }>(`/presets/${id}`);
      setNetwork(parseNetwork(preset.network));
      navigate(thenRun ? "/dashboard" : "/builder", thenRun ? { state: { autorun: true } } : undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-4">
      <h2 className="text-xl font-semibold">Preset library</h2>
      <p className="mb-4 text-sm text-slate-400">
        Five classic circuits from computational neuroscience. Load one into the builder to explore and modify it, or run it straight away.
      </p>
      {error && <div className="mb-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}
      {!presets && !error && <p className="text-slate-500">Loading presets…</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {presets?.map((p) => (
          <article key={p.id} className="panel flex flex-col p-4">
            <Motif id={p.id} />
            <h3 className="mt-2 text-lg font-semibold">{p.title}</h3>
            <div className="mt-1 flex flex-wrap gap-1">
              {p.tags.map((t) => (
                <span key={t} className="chip">{t}</span>
              ))}
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">{p.description}</p>

            <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-emerald-300/80">Biological inspiration</h4>
              <p className={`text-sm leading-relaxed text-slate-300 ${open === p.id ? "" : "line-clamp-3"}`}>{p.biology}</p>
              {open === p.id && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-slate-400">
                  {p.references.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
              <button className="mt-1 text-xs text-sky-400 hover:underline" onClick={() => setOpen(open === p.id ? null : p.id)}>
                {open === p.id ? "less" : "more & references"}
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-slate-400">
              <span>{p.stats.neurons} neurons</span>
              <span>{p.stats.projections} projections</span>
              <span>{p.stats.duration_ms} ms</span>
              {p.stats.models.map((m) => (
                <span key={m} className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ background: MODEL_COLORS[m] }} />
                  {MODEL_LABELS[m]}
                </span>
              ))}
              {p.stats.plastic && <span className="text-fuchsia-300">STDP</span>}
            </div>
            <div className="mt-auto flex gap-2 pt-4">
              <button className="btn-ghost" disabled={loading !== null} onClick={() => load(p.id, false)}>Open in builder</button>
              <button className="btn-primary" disabled={loading !== null} onClick={() => load(p.id, true)}>
                {loading === p.id ? "Loading…" : "▶ Run"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
