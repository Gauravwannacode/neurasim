/** Small original motion components shared by the site and the app. */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { animate, motion, useInView, useMotionValue, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import { prefersReducedMotion } from "../../lib/motion";

/** Card lit by a soft light that follows the cursor. */
export function Spotlight({ children, className, glow, style }: { children: ReactNode; className?: string; glow?: string; style?: CSSProperties }) {
  return (
    <div
      className={`spotlight ${className ?? ""}`}
      style={{ ...style, "--glow": glow } as CSSProperties}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
    >
      {children}
    </div>
  );
}

/** Wrapper that leans towards the pointer. */
export function Magnetic({ children }: { children: ReactNode }) {
  const x = useSpring(useMotionValue(0), { stiffness: 220, damping: 16 });
  const y = useSpring(useMotionValue(0), { stiffness: 220, damping: 16 });
  return (
    <motion.div
      className="inline-block"
      style={{ x, y }}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse" || prefersReducedMotion()) return;
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - r.left - r.width / 2) * 0.28);
        y.set((e.clientY - r.top - r.height / 2) * 0.28);
      }}
      onPointerLeave={() => { x.set(0); y.set(0); }}
    >
      {children}
    </motion.div>
  );
}

function Word({ children, progress, range }: { children: string; progress: MotionValue<number>; range: [number, number] }) {
  const opacity = useTransform(progress, range, [0.14, 1]);
  return <motion.span style={{ opacity }}>{children} </motion.span>;
}

/** Paragraph whose words light up as it is scrolled through. */
export function ScrollWords({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.45"] });
  const words = text.split(" ");
  return (
    <p ref={ref} className={className}>
      {words.map((w, i) => (
        <Word key={i} progress={scrollYProgress} range={[i / words.length, (i + 1) / words.length]}>{w}</Word>
      ))}
    </p>
  );
}

export function CountUp({ to, digits = 0 }: { to: number; digits?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true, margin: "-10%" });
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!seen) return;
    if (prefersReducedMotion()) return setValue(to);
    const a = animate(0, to, { duration: 1.4, ease: [0.16, 1, 0.3, 1], onUpdate: setValue });
    return () => a.stop();
  }, [seen, to]);
  return <span ref={ref} className="tabular-nums">{value.toFixed(digits)}</span>;
}

export interface Preview {
  id: string;
  duration: number;
  rows: number;
  groups: { label: string; kind: string; offset: number; n: number; pts: number[][] }[];
}

export const BRAINBOW = ["#8f7bf0", "#22c3a6", "#ff6a4d", "#5ea3f0", "#ec5fa6", "#a9c43a"];
const INPUT_COLOR = "#f6b73c";

/** Canvas replay of a recorded simulation: a playhead sweeps and spikes flash as it passes. */
export function MiniRaster({ preview, className, seconds = 6 }: { preview: Preview; className?: string; seconds?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const still = prefersReducedMotion();
    let pop = 0;
    const groups = preview.groups.map((g) => ({ ...g, color: g.kind === "input" ? INPUT_COLOR : BRAINBOW[pop++ % BRAINBOW.length] }));
    let raf = 0;
    let visible = false;
    let t0 = performance.now();

    // Every mark is drawn once into an offscreen layer; each frame only blits it and adds the flashes.
    const layer = document.createElement("canvas");
    const render = (w: number, h: number, dpr: number) => {
      layer.width = canvas.width;
      layer.height = canvas.height;
      const l = layer.getContext("2d")!;
      l.setTransform(dpr, 0, 0, dpr, 0, 0);
      const rowH = h / preview.rows;
      const size = Math.max(1.2, Math.min(3, rowH * 0.55));
      for (const g of groups) {
        l.fillStyle = g.color;
        for (const [t, id] of g.pts) l.fillRect((t / preview.duration) * w - size / 2, h - (id + 0.5) * rowH - size / 2, size, size);
      }
    };
    const draw = (now: number) => {
      const dpr = Math.min(2, window.devicePixelRatio);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        render(w, h, dpr);
      }
      const head = still ? 2 : (((now - t0) / 1000 / seconds) % 1) * 1.1;
      const px = Math.min(canvas.width, Math.round(head * canvas.width));
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 0.16;
      ctx.drawImage(layer, 0, 0);
      ctx.globalAlpha = 0.72;
      if (px > 0) ctx.drawImage(layer, 0, 0, px, canvas.height, 0, 0, px, canvas.height);
      ctx.globalAlpha = 1;
      if (still) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const rowH = h / preview.rows;
      const until = head * preview.duration;
      for (const g of groups) {
        ctx.fillStyle = g.color;
        for (const [t, id] of g.pts) {
          if (t > until) break;
          const age = (until - t) / (preview.duration * 0.05);
          if (age > 1) continue;
          const size = 2 + (1 - age) * 3.5;
          ctx.fillRect((t / preview.duration) * w - size / 2, h - (id + 0.5) * rowH - size / 2, size, size);
        }
      }
    };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (visible) draw(now);
    };
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !visible) t0 = performance.now();
      visible = e.isIntersecting;
      if (visible && still) draw(0);
    });
    io.observe(canvas);
    if (!still) raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, [preview, seconds]);

  return <canvas ref={ref} className={className} role="img" aria-label="Spike raster of a real simulation run" />;
}
