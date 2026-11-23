import { useMemo, useState } from "react";
import type { Data } from "plotly.js";
import Plot, { GROUP_PALETTE, baseLayout } from "./Plot";
import { useSimStore } from "../../lib/simStore";

export function useGroupColors() {
  const meta = useSimStore((s) => s.meta);
  return useMemo(() => {
    const out: Record<string, string> = {};
    let popIndex = 0;
    let inIndex = 0;
    for (const g of meta?.groups ?? []) {
      out[g.id] = g.kind === "input" ? ["#c98500", "#a87420", "#e0a33a"][inIndex++ % 3] : GROUP_PALETTE[(popIndex++ % (GROUP_PALETTE.length - 1)) + 1];
    }
    return out;
  }, [meta]);
}

// ---------------------------------------------------------------------------

export function SpikeRaster() {
  const meta = useSimStore((s) => s.meta);
  const spikes = useSimStore((s) => s.spikes);
  const version = useSimStore((s) => s.version);
  const colors = useGroupColors();

  const data = useMemo<Data[]>(
    () =>
      (meta?.groups ?? []).map((g) => ({
        type: "scattergl",
        mode: "markers",
        name: g.label,
        x: spikes[g.id]?.t ?? [],
        y: spikes[g.id]?.id ?? [],
        marker: { size: g.count > 400 ? 2 : 3, color: colors[g.id], line: { width: 0 } },
        hovertemplate: `${g.label}<br>t=%{x:.1f} ms<br>neuron %{y}<extra></extra>`,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meta, spikes, colors, version],
  );

  const layout = useMemo(() => {
    const shapes = (meta?.groups ?? []).slice(1).map((g) => ({
      type: "line" as const,
      x0: 0,
      x1: 1,
      xref: "paper" as const,
      y0: g.offset - 0.5,
      y1: g.offset - 0.5,
      line: { color: "#383243", width: 1, dash: "dot" as const },
    }));
    return baseLayout({
      xaxis: { title: { text: "time (ms)" }, range: [0, meta?.duration ?? 100] },
      yaxis: { title: { text: "neuron id" }, range: [-1, meta?.n_neurons ?? 10] },
      shapes,
      margin: { l: 52, r: 14, t: 56, b: 40 },
      legend: { orientation: "h", x: 0, y: 1.02, yanchor: "bottom", bgcolor: "rgba(0,0,0,0)", font: { size: 11 }, itemsizing: "constant" },
    });
  }, [meta]);

  return <Plot data={data} layout={layout} />;
}

// ---------------------------------------------------------------------------

export function VoltageTrace() {
  const meta = useSimStore((s) => s.meta);
  const vTimes = useSimStore((s) => s.vTimes);
  const vTraces = useSimStore((s) => s.vTraces);
  const version = useSimStore((s) => s.version);
  const pops = (meta?.groups ?? []).filter((g) => g.kind === "population" && (meta?.recorded[g.id]?.length ?? 0) > 0);
  const [popSel, setPopSel] = useState<string | null>(null);
  const [neuronSel, setNeuronSel] = useState<number | "all">(0);
  const pop = pops.find((p) => p.id === popSel) ?? pops[0];
  const ids = pop ? meta!.recorded[pop.id] : [];

  const data = useMemo<Data[]>(() => {
    if (!pop) return [];
    const traces = vTraces[pop.id] ?? [];
    const show = neuronSel === "all" ? traces.map((_, i) => i) : [Math.min(neuronSel, traces.length - 1)];
    return show.map((i, k) => ({
      type: "scattergl",
      mode: "lines",
      name: `neuron ${ids[i]}`,
      x: vTimes,
      y: traces[i],
      line: { width: show.length > 1 ? 1 : 1.6, color: show.length > 1 ? GROUP_PALETTE[(k % 6) + 1] : "#e0563c" },
      hovertemplate: "t=%{x:.1f} ms<br>V=%{y:.1f} mV<extra></extra>",
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pop, neuronSel, vTimes, vTraces, version, ids]);

  const layout = useMemo(() => {
    const vth = pop ? meta?.thresholds[pop.id] : undefined;
    return baseLayout({
      xaxis: { title: { text: "time (ms)" }, range: [0, meta?.duration ?? 100] },
      yaxis: { title: { text: "membrane potential (mV)" } },
      showlegend: neuronSel === "all",
      shapes:
        vth !== undefined
          ? [{ type: "line", x0: 0, x1: 1, xref: "paper", y0: vth, y1: vth, line: { color: "#a39ba8", width: 1, dash: "dash" } }]
          : [],
      annotations:
        vth !== undefined
          ? [{ x: 1, xref: "paper", y: vth, text: "threshold", showarrow: false, xanchor: "right", yanchor: "bottom", font: { color: "#a39ba8", size: 10 } }]
          : [],
    });
  }, [meta, pop, neuronSel]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-2 pb-1">
        <select className="input w-auto py-1 text-xs" value={pop?.id ?? ""} onChange={(e) => { setPopSel(e.target.value); setNeuronSel(0); }}>
          {pops.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <select className="input w-auto py-1 text-xs" value={String(neuronSel)} onChange={(e) => setNeuronSel(e.target.value === "all" ? "all" : Number(e.target.value))}>
          {ids.map((id, i) => (
            <option key={id} value={i}>neuron {id}</option>
          ))}
          <option value="all">all recorded</option>
        </select>
      </div>
      <div className="min-h-0 flex-1">
        <Plot data={data} layout={layout} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ActivityHeatmap() {
  const meta = useSimStore((s) => s.meta);
  const rateTimes = useSimStore((s) => s.rateTimes);
  const rates = useSimStore((s) => s.rates);
  const version = useSimStore((s) => s.version);

  const data = useMemo<Data[]>(() => {
    const groups = meta?.groups ?? [];
    return [
      {
        type: "heatmap",
        x: rateTimes,
        y: groups.map((g) => g.label),
        z: groups.map((g) => rates[g.id] ?? []),
        colorscale: [
          [0, "#100e17"],
          [0.35, "#5a2a22"],
          [0.7, "#c4513a"],
          [1, "#ffc2b0"],
        ],
        colorbar: { title: { text: "Hz", side: "right" }, thickness: 10, outlinewidth: 0, tickfont: { size: 10 } },
        hovertemplate: "%{y}<br>t=%{x:.0f} ms<br>%{z:.1f} Hz<extra></extra>",
        xgap: 1,
        ygap: 2,
      } as unknown as Data,
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, rateTimes, rates, version]);

  const layout = useMemo(
    () =>
      baseLayout({
        margin: { l: 96, r: 8, t: 8, b: 40 },
        xaxis: { title: { text: "time (ms)" }, range: [0, meta?.duration ?? 100] },
        yaxis: { automargin: true },
        showlegend: false,
      }),
    [meta],
  );
  return <Plot data={data} layout={layout} />;
}

// ---------------------------------------------------------------------------

export function WeightEvolution() {
  const meta = useSimStore((s) => s.meta);
  const times = useSimStore((s) => s.weightTimes);
  const means = useSimStore((s) => s.weightMeans);
  const samples = useSimStore((s) => s.weightSamples);
  const summary = useSimStore((s) => s.summary);
  const version = useSimStore((s) => s.version);
  const [view, setView] = useState<"time" | "hist">("time");
  const plastic = meta?.plastic ?? [];
  const label = (id: string) => meta?.groups.find((g) => g.id === id)?.label ?? id;

  const data = useMemo<Data[]>(() => {
    if (view === "hist") {
      return plastic.flatMap((p, k) => {
        const h = summary?.weight_histograms[p.id];
        if (!h) return [];
        const centers = h.bins.slice(0, -1).map((b, i) => (b + h.bins[i + 1]) / 2);
        const c = GROUP_PALETTE[(k % 6) + 1];
        return [
          { type: "bar", x: centers, y: h.initial, name: `${label(p.source)}→${label(p.target)} initial`, marker: { color: "#817989" }, opacity: 0.7 },
          { type: "bar", x: centers, y: h.final, name: `${label(p.source)}→${label(p.target)} final`, marker: { color: c }, opacity: 0.8 },
        ] as Data[];
      });
    }
    return plastic.flatMap((p, k) => {
      const c = GROUP_PALETTE[(k % 6) + 1];
      const lines: Data[] = (samples[p.id] ?? []).map((ys, i) => ({
        type: "scatter",
        mode: "lines",
        x: times,
        y: ys,
        line: { width: 0.8, color: c },
        opacity: 0.3,
        showlegend: false,
        hoverinfo: "skip",
        name: `synapse ${i}`,
      }));
      lines.push({
        type: "scatter",
        mode: "lines",
        x: times,
        y: means[p.id] ?? [],
        name: `${label(p.source)} → ${label(p.target)} (mean)`,
        line: { width: 2.5, color: c },
        hovertemplate: "t=%{x:.0f} ms<br>mean w=%{y:.3f}<extra></extra>",
      });
      return lines;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plastic, times, means, samples, summary, view, version]);

  const layout = useMemo(
    () =>
      view === "hist"
        ? baseLayout({ barmode: "overlay", xaxis: { title: { text: "weight" } }, yaxis: { title: { text: "synapses" } } })
        : baseLayout({ xaxis: { title: { text: "time (ms)" }, range: [0, meta?.duration ?? 100] }, yaxis: { title: { text: "synaptic weight" } } }),
    [meta, view],
  );

  if (meta && plastic.length === 0)
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
        No plastic synapses in this network. Set a projection's plasticity to STDP in the builder to watch weights learn.
      </div>
    );

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 pb-1">
        {(["time", "hist"] as const).map((v) => (
          <button key={v} className={`btn py-0.5 text-xs ${view === v ? "bg-ink-600 text-white" : "text-slate-400"}`} onClick={() => setView(v)} disabled={v === "hist" && !summary}>
            {v === "time" ? "Over time" : "Initial vs final"}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        <Plot data={data} layout={layout} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function fmt(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} G`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)} M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} k`;
  return n.toFixed(0);
}

export function EnergyCompare() {
  const meta = useSimStore((s) => s.meta);
  const summary = useSimStore((s) => s.summary);
  const synops = useSimStore((s) => s.synops);
  const synopsTimes = useSimStore((s) => s.synopsTimes);
  useSimStore((s) => s.version);

  // Live estimate while running; exact figures from the server once done.
  const tNow = synopsTimes[synopsTimes.length - 1] ?? 0;
  const live = summary?.energy ?? {
    snn_synops: synops[synops.length - 1] ?? 0,
    ann_macs: (meta?.n_connections ?? 0) * tNow,
    e_ac_pj: 0.9,
    e_mac_pj: 4.6,
  };
  const snnNj = (live.snn_synops * live.e_ac_pj) / 1000;
  const annNj = (live.ann_macs * live.e_mac_pj) / 1000;
  const ratio = snnNj > 0 ? annNj / snnNj : null;

  const data: Data[] = [
    {
      type: "bar",
      orientation: "h",
      y: ["ANN (dense MACs)", "SNN (event SynOps)"],
      x: [annNj, snnNj],
      marker: { color: ["#817989", "#e0563c"] },
      text: [`${fmt(annNj)} nJ`, `${fmt(snnNj)} nJ`],
      textposition: "auto",
      hovertemplate: "%{y}: %{x:.3g} nJ<extra></extra>",
    },
  ];
  const layout = baseLayout({
    margin: { l: 130, r: 14, t: 4, b: 36 },
    showlegend: false,
    xaxis: { title: { text: "estimated energy (nJ, log)" }, type: "log" },
  });

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="SNN SynOps" value={fmt(live.snn_synops)} sub={`× ${live.e_ac_pj} pJ`} color="text-sky-300" />
        <Stat label="ANN MACs" value={fmt(live.ann_macs)} sub={`× ${live.e_mac_pj} pJ`} color="text-slate-300" />
        <Stat label="Against dense ANN" value={ratio ? `${ratio.toFixed(1)}×` : "–"} sub="less, at most" color="text-bone" />
      </div>
      <div className="min-h-0 flex-1">
        <Plot data={data} layout={layout} />
      </div>
      <p className="text-[11px] leading-snug text-slate-500">
        The SNN only does work when a spike arrives (an accumulate per synapse); an equivalent ANN multiplies every one of the{" "}
        {fmt(meta?.n_connections ?? 0)} connections every 1 ms frame. Energies per op: Horowitz (2014), 45 nm, 32-bit float. Neuron updates and memory access are not counted, and an ANN that skips zeros would close much of the gap, so read this as an upper bound.
      </p>
    </div>
  );
}

export function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl bg-ink-950/60 px-3 py-2">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`font-mono text-lg font-semibold ${color ?? "text-slate-100"}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
