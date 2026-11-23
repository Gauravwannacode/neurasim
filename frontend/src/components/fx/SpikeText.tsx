import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "../../lib/motion";

const COLORS = ["#ff6a4d", "#f6b73c", "#22c3a6", "#8f7bf0", "#ec5fa6", "#5ea3f0"];

/**
 * A headline whose letters are leaky integrate-and-fire neurons. The pointer
 * injects current; a letter that crosses threshold fires (widens and flashes)
 * and, one synaptic delay later, excites its neighbours.
 */
export default function SpikeText({ lines, className }: { lines: string[]; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root || prefersReducedMotion()) return;
    const els = [...root.querySelectorAll<HTMLElement>("[data-letter]")];
    const cells = els.map((el, i) => ({ el, v: 0, glow: 0, ref: 0, inbox: 0, color: COLORS[i % COLORS.length], x: 0, y: 0 }));
    const queue: { at: number; to: number }[] = [];
    let mouse: { x: number; y: number } | null = null;
    let frame = 0;
    let raf = 0;
    let visible = true;

    const measure = () => {
      for (const c of cells) {
        const r = c.el.getBoundingClientRect();
        c.x = r.x + r.width / 2;
        c.y = r.y + r.height / 2;
      }
    };
    const move = (e: PointerEvent) => (mouse = { x: e.clientX, y: e.clientY });
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const due = Math.min(4, Math.floor((now - last) / 16)); // fixed 16 ms steps on any display
      if (due < 1) return;
      last += due * 16;
      if (now - last > 100) last = now;
      if (visible) for (let k = 0; k < due; k++) step();
    };
    const step = () => {
      frame++;
      while (queue.length && queue[0].at <= frame) cells[queue.shift()!.to].inbox += 0.78;
      cells.forEach((c, i) => {
        let input = c.inbox;
        c.inbox = 0;
        if (mouse) {
          const d = Math.hypot(mouse.x - c.x, (mouse.y - c.y) * 0.8);
          input += 0.1 * Math.exp(-((d / 120) ** 2));
        }
        if (Math.random() < 0.002) input += 1.1; // spontaneous release
        c.v = c.ref > 0 ? 0 : c.v * 0.95 + input;
        c.ref--;
        if (c.v >= 1) {
          c.v = 0;
          c.ref = 40;
          c.glow = 1;
          for (const j of [i - 1, i + 1]) if (j >= 0 && j < cells.length) queue.push({ at: frame + 7, to: j });
        }
        if (c.glow > 0.004 || c.v > 0.004) {
          c.glow *= 0.935;
          const drive = Math.min(1, c.v);
          c.el.style.fontVariationSettings = `"wdth" ${112 + drive * 8 + c.glow * 30}, "wght" ${780 + c.glow * 120}`;
          c.el.style.color = c.glow > 0.02 ? `color-mix(in oklab, ${c.color} ${Math.min(100, c.glow * 190)}%, #f3eee6)` : "";
        }
      });
    };
    measure();
    document.fonts.ready.then(measure);
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(root);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
  }, []);

  return (
    <h1 ref={ref} className={`display ${className ?? ""}`} aria-label={lines.join(" ")}>
      {lines.map((line) => (
        <span key={line} aria-hidden className="block whitespace-nowrap">
          {[...line].map((ch, i) => (
            <span key={i} data-letter={ch === " " ? undefined : ""} className="inline-block will-change-transform" style={{ fontVariationSettings: '"wdth" 112, "wght" 780' }}>
              {ch === " " ? " " : ch}
            </span>
          ))}
        </span>
      ))}
    </h1>
  );
}
