import { motion } from "motion/react";
import { MiniRaster, type Preview } from "./fx";
import previews from "../../data/presetPreviews.json";
import learning from "../../data/learningCurve.json";
import { prefersReducedMotion } from "../../lib/motion";

const loop = (duration: number, delay = 0) => ({ duration, delay, repeat: Infinity, ease: "linear" as const });

/** A small network with spikes travelling along its synapses. */
export function WireArt() {
  const nodes: [number, number, string][] = [[60, 60, "#f6b73c"], [60, 140, "#f6b73c"], [250, 40, "#8f7bf0"], [250, 160, "#8f7bf0"], [440, 100, "#22c3a6"], [600, 100, "#ff6a4d"]];
  const edges: [number, number][] = [[0, 2], [0, 3], [1, 2], [1, 3], [2, 4], [3, 4], [4, 5]];
  const path = ([a, b]: [number, number]) => `M${nodes[a][0]} ${nodes[a][1]} C${(nodes[a][0] + nodes[b][0]) / 2} ${nodes[a][1]}, ${(nodes[a][0] + nodes[b][0]) / 2} ${nodes[b][1]}, ${nodes[b][0]} ${nodes[b][1]}`;
  return (
    <svg viewBox="0 0 660 200" className="h-full w-full" aria-hidden>
      {edges.map((e, i) => (
        <g key={i}>
          <path d={path(e)} fill="none" stroke="#383243" strokeWidth="2" />
          {!prefersReducedMotion() && (
            <motion.path d={path(e)} fill="none" stroke={nodes[e[0]][2]} strokeWidth="4" strokeLinecap="round" pathLength={1} strokeDasharray="0.05 1" initial={{ strokeDashoffset: 0.05 }} animate={{ strokeDashoffset: -1 }} transition={loop(1.5 + (i % 3) * 0.35, i * 0.21)} />
          )}
        </g>
      ))}
      {nodes.map(([x, y, c], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="20" fill="#17141f" stroke={c} strokeWidth="2" />
          <circle cx={x} cy={y} r="6" fill={c} />
        </g>
      ))}
    </svg>
  );
}

export function LiveArt() {
  return <MiniRaster preview={(previews as Preview[])[0]} className="h-full w-full" seconds={5} />;
}

/** Discs of neurons turning in perspective. */
export function SpaceArt() {
  const rings = [[-96, "#f6b73c", 12], [0, "#8f7bf0", 16], [96, "#22c3a6", 14]] as const;
  return (
    <div className="grid h-full place-items-center [perspective:520px]" aria-hidden>
      <motion.div className="relative h-32 w-32 [transform-style:preserve-3d]" initial={{ rotateY: 28, rotateX: -14 }} animate={{ rotateY: prefersReducedMotion() ? 28 : 388, rotateX: -14 }} transition={loop(22)}>
        {rings.map(([z, color, n]) => (
          <div key={z} className="absolute inset-0 [transform-style:preserve-3d]" style={{ transform: `translateX(${z}px) rotateY(74deg)` }}>
            {Array.from({ length: n * 3 }, (_, i) => {
              const r = 6 + Math.sqrt(i / (n * 3)) * 58, a = i * 2.39996;
              return <span key={i} className="absolute h-[7px] w-[7px] rounded-full" style={{ background: color, opacity: 0.35 + ((i * 7) % 10) / 15, left: 61 + r * Math.cos(a), top: 61 + r * Math.sin(a) }} />;
            })}
          </div>
        ))}
      </motion.div>
    </div>
  );
}

/** Mean synaptic weights from the real STDP run. */
export function LearnArt() {
  const { t, correlated, random } = learning;
  const all = [...correlated, ...random];
  const lo = Math.min(...all), hi = Math.max(...all);
  const line = (ys: number[]) => ys.map((y, i) => `${i ? "L" : "M"}${(t[i] / t[t.length - 1]) * 520 + 10} ${150 - ((y - lo) / (hi - lo)) * 120}`).join(" ");
  return (
    <svg viewBox="0 0 700 180" className="h-full w-full" role="img" aria-label="Mean synaptic weight over three seconds: correlated inputs strengthen, random inputs weaken">
      {([[correlated, "#ec5fa6", "correlated inputs"], [random, "#817989", "random inputs"]] as const).map(([ys, c, label]) => (
        <g key={label}>
          <motion.path d={line(ys)} fill="none" stroke={c} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" initial={{ strokeDashoffset: 1 }} whileInView={{ strokeDashoffset: 0 }} viewport={{ once: true }} transition={{ duration: 2.2, ease: "easeInOut" }} />
          <text x="545" y={156 - ((ys[ys.length - 1] - lo) / (hi - lo)) * 120} fill="#cbc4c6" fontSize="17">{label}</text>
        </g>
      ))}
    </svg>
  );
}

export function FilesArt() {
  return (
    <div className="flex h-full items-center justify-center gap-4" aria-hidden>
      {[["JSON", "#8f7bf0", -8], ["CSV", "#22c3a6", 3], ["PDF", "#ff6a4d", 10]].map(([name, c, r], i) => (
        <motion.div key={name} className="grid h-28 w-20 place-items-end rounded-xl border border-ink-600 bg-ink-800 p-3" style={{ rotate: r as number }} initial={{ y: 40, opacity: 0 }} whileInView={{ y: 0, opacity: 1 }} viewport={{ once: true }} transition={{ type: "spring", stiffness: 130, damping: 14, delay: i * 0.12 }}>
          <span className="w-full font-mono text-sm font-medium" style={{ color: c as string }}>{name}</span>
        </motion.div>
      ))}
    </div>
  );
}

/** Two runs with the same seed, spike for spike. */
export function SeedArt() {
  return (
    <div className="flex h-full flex-col justify-center gap-5" aria-hidden>
      {["run 1", "run 2"].map((label) => (
        <div key={label} className="flex items-center gap-4">
          <span className="w-12 font-mono text-xs text-slate-400">{label}</span>
          <div className="relative h-8 flex-1 border-b border-ink-600">
            {Array.from({ length: 22 }, (_, i) => (
              <motion.span key={i} className="absolute bottom-0 w-[3px] rounded-t bg-gold" style={{ left: `${(i * 37.7 + (i * i) % 11) % 97}%`, height: "100%", originY: 1 }} initial={{ scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={{ once: true }} transition={{ delay: 0.2 + (((i * 37.7) % 97) / 97) * 1.2, duration: 0.25 }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
