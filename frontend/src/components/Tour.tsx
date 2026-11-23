import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "motion/react";

const STEPS = [
  { target: "palette", title: "Pick your parts", body: "Neuron populations on top, spike sources below. Click one to place it on the canvas." },
  { target: "canvas", title: "Wire them up", body: "Drag from the dot on a node's right edge onto a population. That line is a synapse." },
  { target: "inspector", title: "Tune anything", body: "Select a node or a line and its settings appear here: threshold, weight, delay, learning rule." },
  { target: "run", title: "Make it fire", body: "Run the network and watch the spikes arrive. Ctrl+K reaches everything else from anywhere." },
] as const;

/** Four-step introduction to the builder; started only when asked for. */
export default function Tour({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState<DOMRect | null>(null);
  const next = useRef<HTMLButtonElement>(null);
  const step = STEPS[i];

  useLayoutEffect(() => {
    const measure = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      const r = el?.getBoundingClientRect();
      setBox(r && r.width > 0 ? r : null);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [step.target]);

  useEffect(() => next.current?.focus(), [i]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const W = 320;
  const vw = window.innerWidth, vh = window.innerHeight;
  const roomRight = box ? vw - box.right : 0;
  const x = !box ? (vw - W) / 2 : roomRight > W + 32 ? box.right + 16 : box.left > W + 32 ? box.left - W - 16 : Math.max(16, Math.min(vw - W - 16, box.left + (box.width - W) / 2));
  const y = !box ? vh / 2 - 90 : roomRight > W + 32 || box.left > W + 32 ? Math.max(16, Math.min(vh - 220, box.top + 24)) : Math.max(16, Math.min(vh - 220, box.bottom < vh - 220 ? box.bottom + 16 : box.top + box.height / 2 - 90));

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={step.title}>
      {box ? (
        <motion.div className="pointer-events-none absolute rounded-2xl border-2 border-sky-500 shadow-[0_0_0_9999px_rgba(4,3,8,0.72)]" initial={false} animate={{ left: box.left - 4, top: box.top - 4, width: box.width + 8, height: box.height + 8 }} transition={{ type: "spring", stiffness: 260, damping: 30 }} />
      ) : (
        <div className="absolute inset-0 bg-black/70" />
      )}
      <motion.div className="absolute rounded-3xl border border-ink-600 bg-ink-900 p-6 shadow-2xl" style={{ width: W, maxWidth: "calc(100vw - 32px)" }} initial={false} animate={{ left: x, top: y }} transition={{ type: "spring", stiffness: 260, damping: 30 }}>
        <h2 className="display text-2xl text-bone">{step.title}</h2>
        <p className="mt-3 leading-relaxed text-slate-300">{step.body}</p>
        <div className="mt-6 flex items-center gap-2">
          <span className="mr-auto text-sm text-slate-400">{i + 1} of {STEPS.length}</span>
          <button className="btn text-slate-400 hover:text-bone" onClick={onClose}>Skip</button>
          <button ref={next} className="btn-primary" onClick={() => (i + 1 < STEPS.length ? setI(i + 1) : onClose())}>{i + 1 < STEPS.length ? "Next" : "Done"}</button>
        </div>
      </motion.div>
    </div>
  );
}
