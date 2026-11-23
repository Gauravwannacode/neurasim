import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Data } from "plotly.js";
import { getJSON, postSSE } from "../lib/api";
import Plot, { baseLayout } from "../components/viz/Plot";
import { Stat } from "../components/viz/charts";

interface ModelResult {
  accuracy: number;
  inference_ms_per_sample: number;
  ops_per_sample: number;
  energy_nj_per_sample: number;
  train_time_s: number;
  curve: number[];
  params: number;
  per_class: number[];
  input_spikes_per_sample?: number;
  hidden_spikes_per_sample?: number;
  hidden_rate_hz?: number;
}

interface AnnResult extends ModelResult {
  nonzero_macs_per_sample: number;
  energy_zero_skipping_nj_per_sample: number;
}

interface SnnResult extends ModelResult {
  neuron_update_macs_per_sample: number;
  energy_with_updates_nj_per_sample: number;
}

interface BenchmarkResult {
  created_at: string;
  snn_backend: string;
  can_run: boolean;
  config: { train_size: number; test_size: number; epochs: number; hidden: number; timesteps: number; dt_ms: number; f_max_hz: number; torch: string };
  energy_constants: { e_mac_pj: number; e_ac_pj: number; source: string };
  ann: AnnResult;
  snn: SnnResult;
  example: {
    image: number[];
    label: number;
    pred_ann: number;
    pred_snn: number;
    input_spikes: { t: number[]; id: number[] };
    hidden_spikes: { t: number[]; id: number[] };
    output_v: number[][];
  };
}

const ANN_COLOR = "#94a3b8";
const SNN_COLOR = "#38bdf8";

function Card({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`panel p-4 ${className ?? ""}`}>
      <h3 className="mb-2 text-sm font-semibold text-slate-200">{title}</h3>
      {children}
    </section>
  );
}

function ModelColumn({ name, color, r, energy, ops }: { name: string; color: string; r: ModelResult; energy: [string, string]; ops: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: `${color}55` }}>
      <h4 className="mb-3 text-lg font-semibold" style={{ color }}>{name}</h4>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Test accuracy" value={`${(r.accuracy * 100).toFixed(2)}%`} />
        <Stat label="Energy / inference" value={energy[0]} sub={energy[1]} />
        <Stat label={ops} value={Math.round(r.ops_per_sample).toLocaleString()} />
        <Stat label="CPU latency" value={`${r.inference_ms_per_sample.toFixed(3)} ms`} sub="per sample, batched" />
        <Stat label="Training time" value={`${r.train_time_s.toFixed(1)} s`} />
        <Stat label="Parameters" value={r.params.toLocaleString()} />
      </div>
    </div>
  );
}

export default function Benchmark() {
  const [res, setRes] = useState<BenchmarkResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ progress: number; message: string } | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    getJSON<BenchmarkResult>("/benchmark").then(setRes).catch((e) => setLoadError((e as Error).message));
  }, []);

  async function rerun() {
    setRunError(null);
    setProgress({ progress: 0, message: "Starting…" });
    try {
      await postSSE("/benchmark/run", {}, (m) => {
        const data = JSON.parse(m.data);
        if (m.event === "progress") setProgress({ progress: data.progress, message: data.message });
        else if (m.event === "done") setRes({ ...data, can_run: true });
        else if (m.event === "error") setRunError(data.message);
      });
    } catch (e) {
      setRunError((e as Error).message);
    } finally {
      setProgress(null);
    }
  }

  const charts = useMemo(() => {
    if (!res) return null;
    const { ann, snn, example, config } = res;
    const compare = (title: string, a: number, s: number, fmt: (v: number) => string): [Data[], ReturnType<typeof baseLayout>] => [
      [
        {
          type: "bar",
          x: ["ANN", "SNN"],
          y: [a, s],
          marker: { color: [ANN_COLOR, SNN_COLOR] },
          text: [fmt(a), fmt(s)],
          textposition: "auto",
          hoverinfo: "skip",
        },
      ],
      baseLayout({ showlegend: false, margin: { l: 48, r: 8, t: 8, b: 28 }, yaxis: { title: { text: title } } }),
    ];
    const energyValues = [
      ann.energy_nj_per_sample,
      ann.energy_zero_skipping_nj_per_sample,
      snn.energy_nj_per_sample,
      snn.energy_with_updates_nj_per_sample,
    ];
    const energy: [Data[], ReturnType<typeof baseLayout>] = [
      [
        {
          type: "bar",
          x: ["ANN<br>dense", "ANN<br>skip zeros", "SNN<br>synapses", "SNN<br>+ updates"],
          y: energyValues,
          marker: { color: [ANN_COLOR, "#64748b", SNN_COLOR, "#0284c7"] },
          text: energyValues.map((v) => v.toFixed(0)),
          textposition: "auto",
          hoverinfo: "skip",
        },
      ],
      baseLayout({ showlegend: false, margin: { l: 48, r: 8, t: 8, b: 40 }, yaxis: { title: { text: "nJ per inference" } } }),
    ];
    const curves: Data[] = [
      { type: "scatter", mode: "lines", y: ann.curve, x: ann.curve.map((_, i) => (i + 1) * 10), name: "ANN", line: { color: ANN_COLOR } },
      { type: "scatter", mode: "lines", y: snn.curve, x: snn.curve.map((_, i) => (i + 1) * 10), name: "SNN", line: { color: SNN_COLOR } },
    ];
    const perClass: Data[] = [
      { type: "bar", x: [...Array(10).keys()].map(String), y: ann.per_class, name: "ANN", marker: { color: ANN_COLOR } },
      { type: "bar", x: [...Array(10).keys()].map(String), y: snn.per_class, name: "SNN", marker: { color: SNN_COLOR } },
    ];
    const img: Data[] = [
      {
        type: "heatmap",
        z: Array.from({ length: 28 }, (_, r) => example.image.slice(r * 28, r * 28 + 28)).reverse(),
        colorscale: "Greys",
        reversescale: true,
        showscale: false,
        hoverinfo: "skip",
      } as unknown as Data,
    ];
    const inRaster: Data[] = [
      { type: "scattergl", mode: "markers", x: example.input_spikes.t, y: example.input_spikes.id, name: "input (pixels)", marker: { size: 3, color: "#facc15" } },
    ];
    const hidRaster: Data[] = [
      { type: "scattergl", mode: "markers", x: example.hidden_spikes.t, y: example.hidden_spikes.id, name: "hidden LIF", marker: { size: 3, color: SNN_COLOR } },
    ];
    const outV: Data[] = example.output_v.map((ys, digit) => ({
      type: "scatter",
      mode: "lines",
      y: ys,
      name: String(digit),
      line: { width: digit === example.pred_snn ? 3 : 1, color: digit === example.pred_snn ? "#34d399" : "#475569" },
    }));
    return {
      acc: compare("accuracy (%)", ann.accuracy * 100, snn.accuracy * 100, (v) => `${v.toFixed(1)}%`),
      energy,
      latency: compare("ms per sample (CPU)", ann.inference_ms_per_sample, snn.inference_ms_per_sample, (v) => `${v.toFixed(3)}`),
      curves,
      perClass,
      img,
      inRaster,
      hidRaster,
      outV,
      T: config.timesteps,
    };
  }, [res]);

  const running = progress !== null;

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h2 className="text-xl font-semibold">MNIST benchmark: spiking vs. conventional network</h2>
          <p className="text-sm text-slate-400">
            Same 784–{res?.config.hidden ?? 256}–10 architecture, same training data. The SNN sees each digit as Poisson spike trains over{" "}
            {res?.config.timesteps ?? 32} ms.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {res && <span className="text-xs text-slate-500">results from {new Date(res.created_at).toLocaleString()} · SNN via {res.snn_backend}</span>}
          <button className="btn-ghost" onClick={rerun} disabled={running || (res !== null && !res.can_run)} title={res && !res.can_run ? "PyTorch is not installed on the server" : undefined}>
            {running ? "Training…" : "↻ Retrain both"}
          </button>
        </div>
      </div>

      {progress && (
        <div className="panel p-3">
          <div className="mb-1 flex justify-between text-xs text-slate-400">
            <span>{progress.message}</span>
            <span>{Math.round(progress.progress * 100)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded bg-ink-700">
            <div className="h-full bg-sky-400 transition-all" style={{ width: `${progress.progress * 100}%` }} />
          </div>
        </div>
      )}
      {(runError || (loadError && !res)) && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{runError ?? loadError}</div>
      )}

      {res && charts && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <ModelColumn name="Conventional ANN (ReLU MLP)" color={ANN_COLOR} r={res.ann} ops="MACs / inference" energy={[`${res.ann.energy_zero_skipping_nj_per_sample.toFixed(0)}–${res.ann.energy_nj_per_sample.toFixed(0)} nJ`, "skipping zeros – fully dense"]} />
            <ModelColumn name="Spiking NN (LIF, surrogate gradients)" color={SNN_COLOR} r={res.snn} ops="SynOps / inference" energy={[`${res.snn.energy_nj_per_sample.toFixed(0)}–${res.snn.energy_with_updates_nj_per_sample.toFixed(0)} nJ`, "synapses only – with neuron updates"]} />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card title="Accuracy"><div className="h-56"><Plot data={charts.acc[0]} layout={charts.acc[1]} /></div></Card>
            <Card title="Estimated energy per inference"><div className="h-56"><Plot data={charts.energy[0]} layout={charts.energy[1]} /></div></Card>
            <Card title="Latency on a CPU"><div className="h-56"><Plot data={charts.latency[0]} layout={charts.latency[1]} /></div></Card>
          </div>

          <Card title="When is an SNN more efficient? (in plain English)">
            <div className="grid gap-4 text-sm leading-relaxed text-slate-300 md:grid-cols-3">
              <p>
                <b className="text-slate-100">Work happens only when something changes.</b> A dense ANN multiplies every input by every weight for every image:{" "}
                {Math.round(res.ann.ops_per_sample).toLocaleString()} multiply-accumulates, even for the black background that makes up most of an MNIST digit.
                The SNN's input neurons fire only for bright pixels, so on average only{" "}
                {res.snn.input_spikes_per_sample?.toFixed(0)} input spikes travel through the network per digit.
              </p>
              <p>
                <b className="text-slate-100">Spikes are 1-bit, so a synapse only adds.</b> A spike either arrives or not, so the receiving neuron just adds the weight to its
                membrane potential. An addition costs about {res.energy_constants.e_ac_pj} pJ, while a multiply-accumulate costs about {res.energy_constants.e_mac_pj} pJ
                ({res.energy_constants.source}). Hidden neurons fired at only {res.snn.hidden_rate_hz?.toFixed(0)} Hz on average, so activity stays sparse.
              </p>
              <p>
                <b className="text-slate-100">The catch: time and hardware.</b> The SNN processes each digit over {res.config.timesteps} time steps, so on a CPU or GPU that simulates
                every step it is <i>slower</i> (see latency). Any energy advantage needs event-driven neuromorphic chips (e.g. Intel Loihi, SpiNNaker, IBM TrueNorth)
                that spend energy mainly when spikes occur, and sparse, temporal data such as event-camera or audio streams.
              </p>
            </div>
            <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm leading-relaxed text-slate-300">
              <b className="text-slate-100">So who wins here? It depends on the baseline.</b> Counting synapses only, the SNN needs{" "}
              {(res.ann.energy_nj_per_sample / res.snn.energy_nj_per_sample).toFixed(1)}× less energy than a dense ANN. But most MNIST pixels are black, and an
              ANN accelerator that skips zeros needs only {res.ann.energy_zero_skipping_nj_per_sample.toFixed(0)} nJ, while updating every SNN neuron on every
              step brings the SNN to {res.snn.energy_with_updates_nj_per_sample.toFixed(0)} nJ. On that comparison the SNN uses{" "}
              {res.snn.energy_with_updates_nj_per_sample > res.ann.energy_zero_skipping_nj_per_sample
                ? `${(res.snn.energy_with_updates_nj_per_sample / res.ann.energy_zero_skipping_nj_per_sample).toFixed(1)}× more`
                : `${(res.ann.energy_zero_skipping_nj_per_sample / res.snn.energy_with_updates_nj_per_sample).toFixed(1)}× less`}{" "}
              energy. A static image shown for {res.config.timesteps} steps does not play to an SNN&apos;s strengths.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Estimates count arithmetic only; memory access and data movement usually dominate in practice. Both networks are limited by the short training run
              ({res.config.train_size.toLocaleString()} images × {res.config.epochs} epochs).
            </p>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Training loss (cross-entropy per batch)">
              <div className="h-60"><Plot data={charts.curves} layout={baseLayout({ xaxis: { title: { text: "batch" } }, yaxis: { title: { text: "loss" } } })} /></div>
            </Card>
            <Card title="Accuracy per digit">
              <div className="h-60"><Plot data={charts.perClass} layout={baseLayout({ barmode: "group", xaxis: { title: { text: "digit" } }, yaxis: { range: [0.5, 1], tickformat: ".0%" } })} /></div>
            </Card>
          </div>

          <Card title={`One test digit through the SNN (label ${res.example.label}; SNN predicts ${res.example.pred_snn}, ANN predicts ${res.example.pred_ann})`}>
            <div className="grid gap-4 lg:grid-cols-4">
              <div className="h-56"><Plot data={charts.img} layout={baseLayout({ showlegend: false, margin: { l: 8, r: 8, t: 8, b: 8 }, xaxis: { visible: false }, yaxis: { visible: false, scaleanchor: "x" } })} /></div>
              <div className="h-56"><Plot data={charts.inRaster} layout={baseLayout({ showlegend: false, xaxis: { title: { text: "time step (ms)" }, range: [-0.5, charts.T] }, yaxis: { title: { text: "pixel" } } })} /></div>
              <div className="h-56"><Plot data={charts.hidRaster} layout={baseLayout({ showlegend: false, xaxis: { title: { text: "time step (ms)" }, range: [-0.5, charts.T] }, yaxis: { title: { text: "hidden neuron" } } })} /></div>
              <div className="h-56"><Plot data={charts.outV} layout={baseLayout({ legend: { orientation: "v", x: 1, y: 1, font: { size: 9 } }, xaxis: { title: { text: "time step (ms)" } }, yaxis: { title: { text: "readout potential" } } })} /></div>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Left to right: the image, its Poisson spike encoding (brighter pixels fire more), the hidden LIF layer's spikes, and the 10 leaky-integrator readout
              neurons; the class whose potential peaks highest wins (highlighted).
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
