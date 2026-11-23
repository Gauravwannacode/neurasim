import { Suspense, lazy, useRef, type ComponentType } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform } from "motion/react";
import SpikeText from "../components/fx/SpikeText";
import { FilesArt, LearnArt, LiveArt, SeedArt, SpaceArt, WireArt } from "../components/fx/ToolArt";
import NeuronScope from "../components/fx/NeuronScope";
import { BRAINBOW, CountUp, Magnetic, MiniRaster, ScrollWords, Spotlight, type Preview } from "../components/fx/fx";
import { prefersReducedMotion, setMotion } from "../lib/motion";
import previews from "../data/presetPreviews.json";
import bench from "../data/benchmarkSummary.json";

const NeuralField = lazy(() => import("../components/three/NeuralField"));

const CIRCUITS: { id: string; title: string; line: string; color: string }[] = [
  { id: "winner-take-all", title: "Winner takes all", line: "Three groups compete through shared inhibition. The loudest silences the rest: an argmax, computed with spikes.", color: "#8f7bf0" },
  { id: "central-pattern-generator", title: "A walking rhythm", line: "Two halves inhibit each other until each one tires. Out comes a steady left-right beat that nothing is driving.", color: "#22c3a6" },
  { id: "echo-state-network", title: "A pool of echoes", line: "Four hundred randomly wired neurons turn a short sequence into a rich, fading memory of what just happened.", color: "#5ea3f0" },
  { id: "stdp-learning", title: "Learning by timing", line: "Same average rate, different timing. Synapses that fire just before the output grow, and the others fade.", color: "#ff6a4d" },
  { id: "v1-column", title: "A column of visual cortex", line: "A burst from the thalamus lands in layer 4, climbs to layers 2/3, then drops to layer 5 a few milliseconds later.", color: "#ec5fa6" },
];

function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 flex justify-center px-4 pt-4">
      <nav className="flex items-center gap-1 rounded-full border border-white/10 bg-ink-950/90 p-1.5 pl-4" aria-label="Site">
        <a href="#top" className="mr-2 flex items-center gap-2 font-semibold text-bone">
          <img src="/favicon.svg" alt="" className="h-5 w-5" /> NeuraSim
        </a>
        {[["#neuron", "Neuron"], ["#circuits", "Circuits"], ["#tools", "Tools"], ["#energy", "Energy"]].map(([href, label]) => (
          <a key={href} href={href} className="hidden rounded-full px-3 py-1.5 text-sm text-slate-300 transition hover:bg-white/10 hover:text-bone md:block">{label}</a>
        ))}
        <button className="hidden whitespace-nowrap rounded-full px-3 py-1.5 text-sm text-slate-300 sm:block transition hover:bg-white/10 hover:text-bone" aria-pressed={!prefersReducedMotion()} onClick={() => setMotion(prefersReducedMotion())}>
          Motion {prefersReducedMotion() ? "off" : "on"}
        </button>
        <Link to="/builder" className="btn-primary ml-1">Open simulator</Link>
      </nav>
    </header>
  );
}

function Hero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 140]);
  const opacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);
  return (
    <section id="top" ref={ref} className="relative h-[100svh] min-h-[620px] overflow-hidden">
      <Suspense fallback={null}>
        <NeuralField className="absolute inset-0" />
      </Suspense>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_75%_at_12%_30%,rgba(8,7,12,0.86),transparent_75%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink-950 to-transparent" />
      <motion.div style={{ y, opacity }} className="relative mx-auto flex h-full max-w-7xl flex-col px-5 pt-[17svh] md:px-10">
        <SpikeText lines={["Think in", "spikes."]} className="text-[clamp(3.6rem,12.2vw,11.5rem)] text-bone" />
        <p className="mt-6 max-w-md text-lg leading-relaxed text-slate-200 md:text-xl">
          Build networks of spiking neurons, run them, and watch every spike as it happens.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Magnetic><Link to="/builder" className="btn-primary px-6 py-3 text-base">Build a network</Link></Magnetic>
          <Link to="/presets" className="btn border border-white/20 bg-ink-950/50 px-6 py-3 text-base text-bone hover:bg-white/10">Run a famous circuit</Link>
        </div>
        <p className="mt-auto pb-8 text-sm text-slate-300">
          {prefersReducedMotion() ? (
            <>Motion is off because your system asks for less of it. <button className="text-bone underline underline-offset-4" onClick={() => setMotion(true)}>Turn it on here</button></>
          ) : (
            "Move over the letters, or touch the sheet below. Every point is a neuron."
          )}
        </p>
      </motion.div>
    </section>
  );
}

function CircuitCard({ c, i }: { c: (typeof CIRCUITS)[number]; i: number }) {
  const preview = (previews as Preview[]).find((p) => p.id === c.id)!;
  let pop = 0;
  return (
    <div className="md:sticky" style={{ top: `${84 + i * 16}px` }}>
      <Spotlight glow={c.color} className="mb-6 grid min-h-[420px] overflow-hidden rounded-[32px] border border-ink-700 bg-ink-900 shadow-[0_-24px_60px_-20px_rgba(0,0,0,0.9)] md:grid-cols-[5fr_7fr]">
        <div className="flex flex-col p-7 md:p-10">
          <h3 className="display text-4xl md:text-5xl" style={{ color: c.color }}>{c.title}</h3>
          <p className="mt-5 text-lg leading-relaxed text-slate-200">{c.line}</p>
          <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-400">
            {preview.groups.map((g) => (
              <li key={g.label} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: g.kind === "input" ? "#f6b73c" : BRAINBOW[pop++ % BRAINBOW.length] }} />
                {g.label}
              </li>
            ))}
          </ul>
          <Link to={`/presets?run=${c.id}`} className="btn mt-7 w-fit border border-white/20 px-5 py-2.5 text-bone hover:bg-white/10 md:mt-auto">Run this circuit</Link>
        </div>
        <div className="min-h-[220px] bg-ink-950/60 p-5 md:p-8">
          <MiniRaster preview={preview} className="h-full min-h-[200px] w-full" seconds={7} />
        </div>
      </Spotlight>
    </div>
  );
}

const TOOLS: { title: string; body: string; color: string; span: string; art: ComponentType }[] = [
  { title: "Wire it by hand", body: "Drag populations onto a canvas and draw the synapses. Weights, delays and learning rules are one click away.", color: "#8f7bf0", span: "md:col-span-4", art: WireArt },
  { title: "Watch it live", body: "Spikes stream in while the run is still going.", color: "#ff6a4d", span: "md:col-span-2", art: LiveArt },
  { title: "See it in 3D", body: "Replay any run in space and scrub through time.", color: "#22c3a6", span: "md:col-span-2", art: SpaceArt },
  { title: "Let it learn", body: "Switch on spike-timing plasticity and follow every weight as it drifts, competes and settles.", color: "#ec5fa6", span: "md:col-span-4", art: LearnArt },
  { title: "Take it with you", body: "Networks as JSON, spikes as CSV, and a full PDF report.", color: "#5ea3f0", span: "md:col-span-3", art: FilesArt },
  { title: "Run it again", body: "Same seed, same spikes. Neuron models are tested against theory.", color: "#f6b73c", span: "md:col-span-3", art: SeedArt },
];

const BARS = [
  { label: "ANN, every multiplication", value: bench.annDense, color: "#817989" },
  { label: "ANN, skipping zeros", value: bench.annSkip, color: "#817989" },
  { label: "SNN, synapses only", value: bench.snnSynapses, color: "#ff6a4d" },
  { label: "SNN, with neuron updates", value: bench.snnFull, color: "#ff6a4d" },
];

function Energy() {
  return (
    <section id="energy" className="mx-auto max-w-7xl scroll-mt-24 px-5 py-28 md:px-10">
      <div className="grid gap-12 lg:grid-cols-[5fr_6fr] lg:items-end">
        <div>
          <h2 className="display text-5xl text-bone md:text-7xl">Cheaper? It depends.</h2>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-slate-300">
            We trained the same small network both ways on handwritten digits. Accuracy came out at{" "}
            {(bench.snnAccuracy * 100).toFixed(1)}% with spikes and {(bench.annAccuracy * 100).toFixed(1)}% without. The energy
            winner changes with how you count, so we show every count.
          </p>
          <Link to="/benchmark" className="btn mt-8 border border-white/20 px-5 py-2.5 text-bone hover:bg-white/10">Read the benchmark</Link>
        </div>
        <div className="space-y-5" role="list" aria-label="Estimated energy per digit in nanojoules">
          {BARS.map((b) => (
            <div key={b.label} role="listitem">
              <div className="mb-2 flex items-baseline justify-between gap-4">
                <span className="text-slate-200">{b.label}</span>
                <span className="font-mono text-bone"><CountUp to={b.value} /> nJ</span>
              </div>
              <div className="h-3 overflow-hidden rounded-r bg-ink-800">
                <motion.div className="h-full rounded-r" style={{ background: b.color, originX: 0, width: `${(b.value / bench.annDense) * 100}%` }} initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true, margin: "-10%" }} transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }} />
              </div>
            </div>
          ))}
          <p className="pt-2 text-sm text-slate-400">Estimated arithmetic energy per digit. Memory access is not included.</p>
        </div>
      </div>
    </section>
  );
}

export default function Landing() {
  return (
    <div className="bg-ink-950">
      <Nav />
      <main>
        <Hero />
        <section className="mx-auto max-w-6xl px-5 py-32 md:px-10 md:py-48">
          <ScrollWords
            className="display text-[clamp(2rem,5.4vw,4.6rem)] leading-[1.08] text-bone"
            text="Most artificial networks pass numbers around, all of them, all the time. Your brain stays almost silent, and speaks only in brief electrical pulses. When one arrives is the message."
          />
        </section>

        <section id="neuron" className="mx-auto max-w-7xl scroll-mt-24 px-5 py-16 md:px-10">
          <div className="grid gap-10 lg:grid-cols-[4fr_7fr] lg:items-center">
            <div>
              <h2 className="display text-5xl text-bone md:text-6xl">Poke one.</h2>
              <p className="mt-6 text-lg leading-relaxed text-slate-300">
                This neuron is running in your browser right now. Turn up the current and its voltage climbs. Cross the threshold
                and it fires, resets and starts again. Too little, and it never speaks at all.
              </p>
            </div>
            <NeuronScope />
          </div>
        </section>

        <section id="circuits" className="mx-auto max-w-7xl scroll-mt-24 px-5 py-28 md:px-10">
          <h2 className="display max-w-4xl text-5xl text-bone md:text-7xl">Five circuits nature found first.</h2>
          <p className="mb-12 mt-6 max-w-xl text-lg text-slate-300">Each raster replays a real run. One mark is one spike, and each row is one neuron.</p>
          {CIRCUITS.map((c, i) => <CircuitCard key={c.id} c={c} i={i} />)}
        </section>

        <section id="tools" className="mx-auto max-w-7xl scroll-mt-24 px-5 py-20 md:px-10">
          <h2 className="display mb-12 max-w-3xl text-5xl text-bone md:text-7xl">A whole lab in a tab.</h2>
          <div className="grid gap-4 md:grid-cols-6">
            {TOOLS.map((t) => (
              <Spotlight key={t.title} glow={t.color} className={`flex flex-col rounded-[28px] border border-ink-700 bg-ink-900 p-7 ${t.span}`}>
                <div className="mb-7 h-44"><t.art /></div>
                <h3 className="display text-3xl" style={{ color: t.color }}>{t.title}</h3>
                <p className="mt-3 max-w-md leading-relaxed text-slate-300">{t.body}</p>
              </Spotlight>
            ))}
          </div>
        </section>

        <Energy />

        <section className="relative overflow-hidden px-5 py-36 text-center">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50rem_26rem_at_50%_110%,rgba(255,106,77,0.28),transparent_70%)]" />
          <h2 className="display relative mx-auto max-w-5xl text-[clamp(2.8rem,8vw,7rem)] text-bone">Go make something fire.</h2>
          <div className="relative mt-10"><Magnetic><Link to="/builder" className="btn-primary px-7 py-3.5 text-lg">Open the simulator</Link></Magnetic></div>
        </section>
      </main>
      <footer className="border-t border-ink-700 px-5 py-10 text-sm text-slate-400 md:px-10">
        <p className="mx-auto max-w-7xl">Standing on Maass (1997), Mahowald &amp; Douglas (1991) and Pfeiffer &amp; Pfeil (2018). Engine in NumPy, benchmark trained with Norse.</p>
      </footer>
    </div>
  );
}
