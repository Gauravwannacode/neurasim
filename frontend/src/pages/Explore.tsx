import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Data } from "plotly.js";
import Plot, { GROUP_PALETTE, baseLayout } from "../components/viz/Plot";
import { NumberField, SelectField } from "../components/builder/fields";
import { postSSE } from "../lib/api";
import { useNetworkStore } from "../lib/store";
import { useSimStore, type PinnedRun, type SimMeta } from "../lib/simStore";
import type { Network } from "../lib/network";

type Kind = "population" | "input" | "synapse";
interface Target { key: string; kind: Kind; id: string; field: string; label: string; value: number }
interface Point { value: number; rates: Record<string, number>; synops: number }

const POP_FIELDS: Record<string, string> = { bias: "bias current", noise: "noise", v_th: "threshold (mV)", t_ref: "refractory period (ms)", tau_syn: "synaptic τ (ms)" };
const LIF_FIELDS: Record<string, string> = { tau_m: "membrane τ (ms)", adapt_b: "adaptation" };
const SYN_FIELDS: Record<string, string> = { weight: "weight", p_connect: "connection probability", delay_ms: "delay (ms)" };

function targets(net: Network): Target[] {
  const name = (id: string) => [...net.populations, ...net.inputs].find((n) => n.id === id)?.label || id;
  const out: Target[] = [];
  const add = (kind: Kind, id: string, field: string, label: string, value: unknown) =>
    out.push({ key: `${kind}/${id}/${field}`, kind, id, field, label, value: typeof value === "number" ? value : 0 });
  for (const p of net.populations)
    for (const [f, l] of Object.entries(p.model === "lif" ? { ...POP_FIELDS, ...LIF_FIELDS } : POP_FIELDS)) add("population", p.id, f, `${name(p.id)}: ${l}`, (p.params as Record<string, unknown>)[f]);
  for (const i of net.inputs) if (i.kind === "poisson") add("input", i.id, "rate_hz", `${name(i.id)}: rate (Hz)`, i.rate_hz);
  for (const s of net.synapses) for (const [f, l] of Object.entries(SYN_FIELDS)) add("synapse", s.id, f, `${name(s.source)} → ${name(s.target)}: ${l}`, (s as unknown as Record<string, unknown>)[f]);
  return out;
}

function defaultRange(t: Target): [number, number] {
  if (t.field === "p_connect") return [0, 1];
  if (t.field === "v_th") return [t.value - 8, t.value + 8];
  if (t.field === "bias") return [0, 30];
  if (t.field === "weight" && t.value < 0) return [t.value * 2, 0];
  if (t.field === "tau_m" || t.field === "tau_syn") return [Math.max(1, t.value / 2), t.value * 2];
  return [0, t.value ? t.value * 2 : 10];
}

function Sweep() {
  const network = useNetworkStore((s) => s.network);
  const options = useMemo(() => targets(network), [network]);
  const [key, setKey] = useState(options[0]?.key ?? "");
  const target = options.find((o) => o.key === key) ?? options[0];
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(30);
  const [count, setCount] = useState(11);
  const [points, setPoints] = useState<Point[]>([]);
  const [shown, setShown] = useState<{ label: string; names: Record<string, string> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => () => ctrl.current?.abort(), []);
  useEffect(() => {
    if (!target) return;
    const [a, b] = defaultRange(target);
    setFrom(a);
    setTo(b);
    // Only when a different parameter is chosen, so edits to the range are kept.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.key]);

  async function run() {
    if (!target) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setBusy(true);
    setError(null);
    setPoints([]);
    setShown({ label: target.label, names: Object.fromEntries(network.populations.map((p) => [p.id, p.label || p.id])) });
    const values = Array.from({ length: count }, (_, i) => Number((from + ((to - from) * i) / (count - 1)).toPrecision(6)));
    let finished = false;
    try {
      await postSSE("/sweep", { network, kind: target.kind, id: target.id, field: target.field, values }, (m) => {
        const data = JSON.parse(m.data);
        if (m.event === "point") setPoints((p) => [...p, data]);
        else if (m.event === "error") { finished = true; setError(data.message); }
        else if (m.event === "done") finished = true;
      }, c.signal);
      if (!finished) setError("The sweep ended early. Try again.");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      if (ctrl.current === c) setBusy(false);
    }
  }

  const data = useMemo<Data[]>(
    () =>
      Object.entries(shown?.names ?? {}).map(([id, name], i) => ({
        type: "scatter", mode: "lines+markers", name,
        x: points.map((p) => p.value), y: points.map((p) => p.rates[id]),
        line: { width: 2, color: GROUP_PALETTE[(i % 6) + 1] }, marker: { size: 8 },
        hovertemplate: `${name}<br>%{x}: %{y:.1f} Hz<extra></extra>`,
      })),
    [points, shown],
  );
  const layout = useMemo(() => baseLayout({ margin: { l: 56, r: 16, t: 40, b: 48 }, xaxis: { title: { text: shown?.label ?? "" } }, yaxis: { title: { text: "mean firing rate (Hz)" }, rangemode: "tozero" } }), [shown]);

  if (!target) return <p className="text-slate-400">This network has nothing to sweep yet. Add a population in the builder.</p>;
  return (
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <div className="panel h-fit space-y-4 p-5">
        <SelectField label="What to change" value={target.key} options={options.map((o) => ({ value: o.key, label: o.label }))} onChange={setKey} />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="From" value={from} onChange={setFrom} />
          <NumberField label="To" value={to} onChange={setTo} />
        </div>
        <NumberField label="Runs" value={count} min={2} max={25} step={1} onChange={(v) => setCount(Math.round(v))} />
        <p className="text-sm text-slate-400">It is {Number(target.value.toPrecision(4))} now. Every run uses the same seed.</p>
        {busy ? (
          <button className="btn-danger w-full justify-center py-2" onClick={() => { ctrl.current?.abort(); setBusy(false); }}>Stop after {points.length} of {count}</button>
        ) : (
          <button className="btn-primary w-full justify-center py-2" disabled={from === to} onClick={run}>Run the sweep</button>
        )}
        {error && <p className="text-sm text-rose-300" role="alert">{error}</p>}
      </div>
      <div className="panel h-[480px] p-4">
        {points.length ? <Plot data={data} layout={layout} /> : <p className="grid h-full place-items-center px-8 text-center text-slate-400">Pick a value and run the sweep to see how firing rates respond to it.</p>}
      </div>
    </div>
  );
}

function raster(run: { meta: SimMeta; spikes: Record<string, { t: number[]; id: number[] }> }): Data[] {
  let pop = 0;
  return run.meta.groups.map((g) => ({
    type: "scattergl", mode: "markers", name: g.label, x: run.spikes[g.id]?.t ?? [], y: run.spikes[g.id]?.id ?? [],
    marker: { size: 3, color: g.kind === "input" ? GROUP_PALETTE[0] : GROUP_PALETTE[(pop++ % 6) + 1] },
    hovertemplate: `${g.label}<br>%{x:.1f} ms<extra></extra>`,
  }));
}

function RunCard({ title, run, span }: { title: string; run: PinnedRun; span: number }) {
  const data = useMemo(() => raster(run), [run]);
  const layout = useMemo(() => baseLayout({ showlegend: false, xaxis: { title: { text: "time (ms)" }, range: [0, span] }, yaxis: { title: { text: "neuron" }, range: [-1, run.meta.n_neurons] } }), [run, span]);
  return (
    <section className="panel p-4">
      <h3 className="font-semibold text-bone">{title}</h3>
      <p className="mb-2 text-sm text-slate-400">{run.meta.name} · seed {run.network.sim.seed}</p>
      <div className="h-72"><Plot data={data} layout={layout} /></div>
    </section>
  );
}

function Compare() {
  const { pinned, meta, network, spikes, summary, status, unpin } = useSimStore();
  const current = useMemo<PinnedRun | null>(() => (status === "done" && meta && network && summary ? { meta, network, spikes, summary } : null), [status, meta, network, spikes, summary]);

  if (!pinned)
    return (
      <div className="panel p-8 text-slate-300">
        <p className="max-w-lg leading-relaxed">Pin a run on the <Link className="text-bone underline underline-offset-4" to="/dashboard">dashboard</Link>, change something, and run again. Both runs appear here side by side.</p>
      </div>
    );
  const same = current && current.summary === pinned.summary;
  const span = Math.max(pinned.meta.duration, current?.meta.duration ?? 0);
  const groups = new Map<string, string>();
  for (const r of [pinned, current]) for (const g of r?.meta.groups ?? []) if (!groups.has(g.id)) groups.set(g.id, g.label);
  const cell = (v: number | undefined, digits = 1) => (v === undefined ? "none" : v.toLocaleString(undefined, { maximumFractionDigits: digits }));
  const rows: [string, number | undefined, number | undefined][] = [
    ...[...groups].map(([id, label]) => [`${label} (Hz)`, pinned.summary.mean_rates[id], current?.summary.mean_rates[id]] as [string, number | undefined, number | undefined]),
    ["Total spikes", pinned.summary.total_spikes, current?.summary.total_spikes],
    ["Synaptic operations", pinned.summary.energy.snn_synops, current?.summary.energy.snn_synops],
  ];
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <RunCard title="Pinned run" run={pinned} span={span} />
        {current && !same ? (
          <RunCard title="Latest run" run={current} span={span} />
        ) : (
          <div className="panel grid place-items-center p-8 text-center text-slate-300">
            <p>{same ? "The latest run is the pinned one. Change something and run again." : "Waiting for a finished run to compare with."}</p>
          </div>
        )}
      </div>
      {current && !same && (
        <div className="panel overflow-x-auto p-4">
          <table className="w-full min-w-[480px] text-left">
            <thead className="text-sm text-slate-400"><tr><th className="p-2 font-medium">Measure</th><th className="p-2 text-right font-medium">Pinned</th><th className="p-2 text-right font-medium">Latest</th><th className="p-2 text-right font-medium">Change</th></tr></thead>
            <tbody className="tabular-nums">
              {rows.map(([label, a, b]) => (
                <tr key={label} className="border-t border-ink-700">
                  <td className="p-2 text-slate-200">{label}</td>
                  <td className="p-2 text-right font-mono">{cell(a)}</td>
                  <td className="p-2 text-right font-mono">{cell(b)}</td>
                  <td className="p-2 text-right font-mono text-slate-300">{a === undefined || b === undefined ? "" : `${b - a > 0 ? "+" : ""}${cell(b - a)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button className="btn-ghost" onClick={unpin}>Unpin</button>
    </div>
  );
}

export default function Explore() {
  const [tab, setTab] = useState<"sweep" | "compare">("sweep");
  const name = useNetworkStore((s) => s.network.name);
  return (
    <div className="mx-auto max-w-7xl p-5 md:p-10">
      <h1 className="display text-5xl text-bone md:text-6xl">Explore</h1>
      <p className="mt-4 text-lg text-slate-300">Ask “what if” of {name}.</p>
      <div className="my-7 flex w-fit rounded-full border border-ink-700 bg-ink-900 p-1" role="tablist" aria-label="Explore">
        {([["sweep", "Sweep a value"], ["compare", "Compare two runs"]] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === id ? "bg-bone text-ink-950" : "text-slate-400 hover:text-bone"}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      <div hidden={tab !== "sweep"}><Sweep /></div>
      {tab === "compare" && <Compare />}
    </div>
  );
}
