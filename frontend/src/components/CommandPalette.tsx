import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { MODEL_LABELS, NEURON_MODELS, INPUT_KINDS, INPUT_LABELS, makeInput, makePopulation, starterNetwork } from "../lib/network";
import { prefersReducedMotion, setMotion } from "../lib/motion";
import { useNetworkStore } from "../lib/store";
import { useSimStore } from "../lib/simStore";

interface Command { group: string; label: string; run: () => void }

const PRESETS: [string, string][] = [
  ["winner-take-all", "Winner-Take-All"],
  ["central-pattern-generator", "Central Pattern Generator"],
  ["echo-state-network", "Echo State Network"],
  ["stdp-learning", "STDP learning"],
  ["v1-column", "V1 column"],
];

export default function CommandPalette({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  useEffect(() => {
    if (open) { setQuery(""); setIndex(0); }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const store = useNetworkStore.getState;
    return [
      { group: "Simulate", label: "Run the current network", run: () => navigate("/dashboard", { state: { autorun: true } }) },
      { group: "Simulate", label: "Stop the run", run: () => useSimStore.getState().stop() },
      ...PRESETS.map(([id, t]) => ({ group: "Circuits", label: `Run ${t}`, run: () => navigate(`/presets?run=${id}`) })),
      ...NEURON_MODELS.map((m) => ({ group: "Build", label: `Add ${MODEL_LABELS[m]} population`, run: () => { navigate("/builder"); store().addPopulation(makePopulation(m)); } })),
      ...INPUT_KINDS.map((k) => ({ group: "Build", label: `Add ${INPUT_LABELS[k]} input`, run: () => { navigate("/builder"); store().addInput(makeInput(k)); } })),
      { group: "Build", label: "Start over from the starter network", run: () => { navigate("/builder"); store().setNetwork(starterNetwork()); } },
      ...[["Builder", "/builder"], ["Dashboard", "/dashboard"], ["Circuits", "/presets"], ["Benchmark", "/benchmark"], ["Home page", "/"]].map(([l, to]) => ({ group: "Go to", label: l, run: () => navigate(to) })),
      { group: "Settings", label: prefersReducedMotion() ? "Turn motion on" : "Turn motion off", run: () => setMotion(prefersReducedMotion()) },
    ];
  }, [navigate]);

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = commands.filter((c) => words.every((w) => `${c.group} ${c.label}`.toLowerCase().includes(w)));
  const choose = (c?: Command) => { if (c) { setOpen(false); c.run(); } };

  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [index]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex justify-center bg-black/60 p-4 pt-[14vh] backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} onClick={() => setOpen(false)}>
          <motion.div
            role="dialog" aria-modal="true" aria-label="Command palette"
            className="h-fit w-full max-w-xl overflow-hidden rounded-3xl border border-ink-600 bg-ink-900 shadow-2xl"
            initial={{ y: -14, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: -8 }} transition={{ type: "spring", stiffness: 420, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              autoFocus value={query} placeholder="What do you want to do?" aria-label="Search commands"
              className="w-full bg-transparent px-6 py-5 text-lg text-bone placeholder:text-slate-500 focus:outline-none"
              onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(hits.length - 1, i + 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
                if (e.key === "Enter") choose(hits[index]);
              }}
            />
            <ul ref={list} role="listbox" className="max-h-[46vh] overflow-y-auto border-t border-ink-700 p-2">
              {hits.map((c, i) => (
                <li key={c.group + c.label} role="option" aria-selected={i === index} className={`flex cursor-pointer justify-between gap-4 rounded-2xl px-4 py-2.5 ${i === index ? "bg-ink-700 text-bone" : "text-slate-300"}`} onMouseMove={() => setIndex(i)} onClick={() => choose(c)}>
                  {c.label}<span className="text-sm text-slate-500">{c.group}</span>
                </li>
              ))}
              {hits.length === 0 && <li className="px-4 py-6 text-slate-400">Nothing matches “{query}”. Try “run” or “add”.</li>}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
