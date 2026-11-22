import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useNetworkStore } from "../lib/store";
import { useSimStore } from "../lib/simStore";
import { ActivityHeatmap, EnergyCompare, SpikeRaster, Stat, VoltageTrace, WeightEvolution } from "../components/viz/charts";

function Card({ title, subtitle, children, className }: { title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`panel flex min-h-0 flex-col p-3 ${className ?? ""}`}>
      <header className="mb-1 flex items-baseline gap-2">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        {subtitle && <span className="truncate text-xs text-slate-500">{subtitle}</span>}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

const SPEEDS = [
  { label: "Live (slow-mo)", pace: 120 },
  { label: "Live", pace: 40 },
  { label: "Instant", pace: 0 },
];

export default function Dashboard() {
  const network = useNetworkStore((s) => s.network);
  const { status, error, progress, meta, summary, start, stop } = useSimStore();
  const runNetwork = useSimStore((s) => s.network);
  const location = useLocation();
  const navigate = useNavigate();
  const [pace, setPace] = useState(40);
  const autorun = useRef(false);

  useEffect(() => {
    const state = location.state as { autorun?: boolean } | null;
    if (state?.autorun && !autorun.current) {
      autorun.current = true;
      navigate(".", { replace: true, state: null });
      start(network, pace);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const running = status === "running";
  const pops = meta?.groups.filter((g) => g.kind === "population") ?? [];
  const stale = runNetwork && JSON.stringify(runNetwork) !== JSON.stringify(network);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-ink-700 bg-ink-900/60 px-4 py-2">
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{runNetwork?.name ?? network.name}</h2>
          <p className="text-xs text-slate-500">
            {meta
              ? `${meta.n_neurons.toLocaleString()} neurons · ${meta.n_connections.toLocaleString()} synapses · ${meta.duration} ms @ dt=${meta.dt} ms`
              : "Run the network from the builder or here."}
            {stale && !running && <span className="ml-2 text-amber-300">network edited since this run</span>}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select className="input w-auto py-1 text-xs" value={pace} onChange={(e) => setPace(Number(e.target.value))} disabled={running}>
            {SPEEDS.map((s) => (
              <option key={s.pace} value={s.pace}>{s.label}</option>
            ))}
          </select>
          {running ? (
            <button className="btn-danger" onClick={stop}>■ Stop</button>
          ) : (
            <button className="btn-primary" onClick={() => start(network, pace)} disabled={network.populations.length === 0}>
              ▶ {status === "idle" ? "Run" : "Re-run"}
            </button>
          )}
          <div id="dashboard-export-slot" className="flex items-center gap-2" />
        </div>
        <div className="h-1 w-full overflow-hidden rounded bg-ink-700">
          <div
            className={`h-full transition-all ${status === "error" ? "bg-rose-500" : status === "done" ? "bg-emerald-400" : "bg-sky-400"}`}
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>
      )}

      {status === "idle" && !meta ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-slate-400">
          <p className="max-w-md">
            Press <b>Run</b> to simulate <i>{network.name}</i>. Spikes stream in from the server as the simulation advances.
          </p>
          <Link to="/presets" className="text-sky-400 hover:underline">or start from a preset →</Link>
        </div>
      ) : (
        <div className="grid flex-1 auto-rows-[minmax(300px,1fr)] grid-cols-1 gap-3 overflow-auto p-3 xl:grid-cols-3">
          <Card title="Spike raster" subtitle="each dot is one spike" className="xl:col-span-2">
            <SpikeRaster />
          </Card>
          <Card title="Energy estimate" subtitle="SNN vs equivalent ANN">
            <EnergyCompare />
          </Card>
          <Card title="Membrane voltage" subtitle="integrate → threshold → fire → reset" className="xl:col-span-2">
            <VoltageTrace />
          </Card>
          <Card title="Summary">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Total spikes" value={(summary?.total_spikes ?? 0).toLocaleString()} />
              <Stat label="Wall time" value={summary ? `${summary.wall_time_s.toFixed(2)} s` : running ? "…" : "–"} />
              {pops.slice(0, 6).map((p) => (
                <Stat key={p.id} label={`${p.label} rate`} value={summary ? `${summary.mean_rates[p.id].toFixed(1)} Hz` : "…"} color="text-sky-300" />
              ))}
            </div>
            {summary?.truncated && (
              <p className="mt-2 text-xs text-amber-300">Spike recording was capped at 2M spikes; rates and energy are still exact.</p>
            )}
          </Card>
          <Card title="Population activity" subtitle="firing rate per population over time">
            <ActivityHeatmap />
          </Card>
          <Card title="Synaptic weights" subtitle="STDP learning" className="xl:col-span-2">
            <WeightEvolution />
          </Card>
        </div>
      )}
    </div>
  );
}
