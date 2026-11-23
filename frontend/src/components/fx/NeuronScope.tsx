import { useEffect, useRef, useState } from "react";
import { makeCell, type CellKind } from "../../lib/spiking";

const KINDS: { id: CellKind; label: string; color: string; note: string; start: number }[] = [
  { id: "lif", label: "Integrate-and-fire", color: "#ff6a4d", note: "The simplest neuron that spikes: charge up, cross the line, reset.", start: 20 },
  { id: "izhikevich", label: "Izhikevich", color: "#8f7bf0", note: "Two equations that reproduce most firing patterns seen in cortex.", start: 10 },
  { id: "hh", label: "Hodgkin-Huxley", color: "#22c3a6", note: "Real ion channels. Nobody programs the spike; it emerges.", start: 10 },
];
const WINDOW = 240; // ms on screen

/** Live oscilloscope: one real neuron integrating in the browser. */
export default function NeuronScope() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [kind, setKind] = useState<CellKind>("lif");
  const [current, setCurrent] = useState(20);
  const [rate, setRate] = useState(0);
  const input = useRef(current);
  const kick = useRef(0);
  input.current = current;
  const spec = KINDS.find((k) => k.id === kind)!;
  const { max, unit } = makeCell(kind);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const cell = makeCell(kind);
    const trace: { t: number; v: number }[] = [];
    const spikes: number[] = [];
    let t = 0;
    let raf = 0;
    let last = performance.now();
    let visible = false;
    let flash = 0;
    let shown = -1;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const elapsed = Math.min(50, now - last);
      last = now;
      if (!visible) return;
      // Slow motion: 1 s on screen is 100 ms of neural time.
      for (let sim = 0; sim < elapsed * 0.1; sim += 0.1) {
        const extra = kick.current > 0 ? cell.max * 0.9 : 0;
        kick.current -= 0.1;
        const fired = cell.step(input.current + extra, 0.1);
        t += 0.1;
        if (fired) { spikes.push(t); flash = 1; }
        trace.push({ t, v: fired && kind === "lif" ? 25 : cell.v });
      }
      while (trace.length && trace[0].t < t - WINDOW) trace.shift();
      while (spikes.length && spikes[0] < t - WINDOW) spikes.shift();
      const hz = Math.round((spikes.length / Math.min(WINDOW, Math.max(t, 20))) * 1000);
      if (hz !== shown) { shown = hz; setRate(hz); }

      const dpr = Math.min(2, window.devicePixelRatio);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const y = (v: number) => h * 0.08 + ((45 - v) / 130) * h * 0.84;
      const x = (at: number) => w - 18 - ((t - at) / WINDOW) * (w - 18);
      ctx.strokeStyle = "#817989";
      ctx.setLineDash([3, 6]);
      ctx.beginPath(); ctx.moveTo(0, y(cell.threshold)); ctx.lineTo(w, y(cell.threshold)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = spec.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.beginPath();
      trace.forEach((p, i) => (i ? ctx.lineTo(x(p.t), y(p.v)) : ctx.moveTo(x(p.t), y(p.v))));
      ctx.stroke();
      const tag = `threshold ${cell.threshold} mV`;
      ctx.font = "12px 'JetBrains Mono', monospace";
      ctx.fillStyle = "#100e17";
      ctx.fillRect(10, y(cell.threshold) - 9, ctx.measureText(tag).width + 12, 18);
      ctx.fillStyle = "#cbc4c6";
      ctx.fillText(tag, 16, y(cell.threshold) + 4);
      flash *= 0.9;
      const head = trace[trace.length - 1];
      if (head) {
        ctx.fillStyle = spec.color;
        ctx.shadowColor = spec.color;
        ctx.shadowBlur = 8 + flash * 40;
        ctx.beginPath(); ctx.arc(x(head.t), y(head.v), 5 + flash * 7, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }
    };
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(canvas);
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, [kind, spec.color]);

  return (
    <div className="overflow-hidden rounded-[28px] border border-ink-700 bg-ink-900">
      <div className="flex flex-wrap gap-1 p-3" role="tablist" aria-label="Neuron model">
        {KINDS.map((k) => (
          <button
            key={k.id}
            role="tab"
            aria-selected={k.id === kind}
            className={`btn ${k.id === kind ? "bg-ink-700 text-bone" : "text-slate-400 hover:text-slate-200"}`}
            onClick={() => { setKind(k.id); setCurrent(k.start); }}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: k.color }} /> {k.label}
          </button>
        ))}
      </div>
      <canvas ref={ref} className="block h-64 w-full cursor-crosshair md:h-80" aria-label="Live membrane potential" onPointerDown={() => (kick.current = 4)} />
      <div className="grid gap-5 border-t border-ink-700 p-5 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="block">
          <span className="mb-2 flex justify-between gap-4 text-sm text-slate-300">
            <span>Input current</span>
            <span className="font-mono text-slate-400">{current.toFixed(1)} {unit}</span>
          </span>
          <input type="range" min={0} max={max} step={0.1} value={current} onChange={(e) => setCurrent(Number(e.target.value))} className="w-full" style={{ accentColor: spec.color }} />
        </label>
        <div className="flex items-end gap-4">
          <div className="w-24 text-right">
            <div className="display text-3xl text-bone tabular-nums">{rate}</div>
            <div className="text-xs text-slate-400">spikes per second</div>
          </div>
          <button className="btn-primary py-2.5" onClick={() => (kick.current = 4)}>Zap it</button>
        </div>
        <p className="text-sm text-slate-400 sm:col-span-2">{spec.note}</p>
      </div>
    </div>
  );
}
