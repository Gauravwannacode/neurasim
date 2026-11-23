import { useEffect, useRef } from "react";
import Plotly from "plotly.js-dist-min";
import type { Config, Data, Layout } from "plotly.js";

/**
 * Slot 0 is reserved for inputs; populations take slots 1-6 in this fixed order,
 * checked for colour-vision deficiency on the panel background.
 */
export const GROUP_PALETTE = ["#c98500", "#8f7bf0", "#1f9f87", "#e0563c", "#3987e5", "#d55181", "#7f9a1f"];

export const baseLayout = (overrides: Partial<Layout> = {}): Partial<Layout> => ({
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor: "rgba(0,0,0,0)",
  font: { family: "Instrument Sans, system-ui, sans-serif", size: 11, color: "#a39ba8" },
  margin: { l: 52, r: 14, t: 8, b: 40 },
  showlegend: true,
  legend: { orientation: "h", y: 1.12, x: 0, bgcolor: "rgba(0,0,0,0)", font: { size: 10 } },
  hovermode: "closest",
  ...overrides,
  xaxis: { gridcolor: "#1d1926", zerolinecolor: "#383243", linecolor: "#383243", ...(overrides.xaxis ?? {}) },
  yaxis: { gridcolor: "#1d1926", zerolinecolor: "#383243", linecolor: "#383243", ...(overrides.yaxis ?? {}) },
});

const config: Partial<Config> = {
  displaylogo: false,
  responsive: true,
  modeBarButtonsToRemove: ["select2d", "lasso2d", "autoScale2d"],
};

/**
 * Thin Plotly wrapper. Re-renders with Plotly.react (diffing) at most once per
 * animation frame, which keeps WebGL traces smooth while data streams in.
 */
export default function Plot({ data, layout, className }: { data: Data[]; layout: Partial<Layout>; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      if (ref.current) Plotly.react(ref.current, data, { ...layout, datarevision: Date.now() }, config);
    });
  }, [data, layout]);

  useEffect(() => {
    const el = ref.current;
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (el) Plotly.purge(el);
    };
  }, []);

  return <div ref={ref} className={className ?? "h-full w-full"} />;
}
