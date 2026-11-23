import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { MODEL_COLORS, MODEL_LABELS, INPUT_LABELS, type InputKind, type NeuronModel } from "../../lib/network";

export type PopulationNodeData = {
  label: string;
  count: number;
  model: NeuronModel;
  vth: number;
  rateHz?: number;
};
export type InputNodeData = { label: string; count: number; kind: InputKind; rateHz: number };
export type PopulationFlowNode = Node<PopulationNodeData, "population">;
export type InputFlowNode = Node<InputNodeData, "spikeInput">;

/** A tiny "spike train" glyph whose density hints at the population's activity. */
function SpikeGlyph({ color, density }: { color: string; density: number }) {
  const n = Math.max(3, Math.min(18, Math.round(density)));
  return (
    <svg viewBox="0 0 120 16" className="h-4 w-full" aria-hidden>
      <line x1="0" y1="15" x2="120" y2="15" stroke="currentColor" className="text-ink-600" />
      {Array.from({ length: n }, (_, i) => {
        const x = ((i * 37) % 113) + 4;
        return <line key={i} x1={x} y1="15" x2={x} y2="2" stroke={color} strokeWidth="1.5" strokeLinecap="round" />;
      })}
    </svg>
  );
}

export const PopulationNode = memo(function PopulationNode({ data, selected }: NodeProps<PopulationFlowNode>) {
  const color = MODEL_COLORS[data.model];
  return (
    <div
      className={`w-48 rounded-xl border bg-ink-900 px-3 py-2 shadow-lg transition ${
        selected ? "border-white/70 ring-2 ring-sky-400/40" : "border-ink-600"
      }`}
      style={{ boxShadow: data.rateHz ? `0 0 ${Math.min(30, data.rateHz)}px ${color}55` : undefined }}
    >
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-ink-950 !bg-slate-300" />
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        <span className="truncate text-sm font-semibold">{data.label}</span>
      </div>
      <div className="mt-0.5 text-[11px] text-slate-400">{MODEL_LABELS[data.model]}</div>
      <div className="mt-1 flex items-center justify-between font-mono text-[11px] text-slate-300">
        <span>n = {data.count}</span>
        <span>θ = {data.vth} mV</span>
      </div>
      <SpikeGlyph color={color} density={data.rateHz ? data.rateHz / 3 : data.count / 10} />
      {data.rateHz !== undefined && (
        <div className="text-right font-mono text-[10px] text-slate-400">{data.rateHz.toFixed(1)} Hz</div>
      )}
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-ink-950 !bg-sky-400" />
    </div>
  );
});

export const InputNode = memo(function InputNode({ data, selected }: NodeProps<InputFlowNode>) {
  return (
    <div
      className={`w-44 rounded-xl border border-dashed bg-ink-900 px-3 py-2 shadow-lg ${
        selected ? "border-white/70 ring-2 ring-amber-300/40" : "border-amber-400/50"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-amber-300">⟿</span>
        <span className="truncate text-sm font-semibold">{data.label}</span>
      </div>
      <div className="mt-0.5 text-[11px] text-slate-400">{INPUT_LABELS[data.kind]}</div>
      <div className="mt-1 flex justify-between font-mono text-[11px] text-slate-300">
        <span>n = {data.count}</span>
        {data.kind !== "pattern" && <span>{data.rateHz} Hz</span>}
      </div>
      <SpikeGlyph color="#f6b73c" density={data.kind === "pattern" ? 6 : data.rateHz / 3} />
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-ink-950 !bg-amber-300" />
    </div>
  );
});

export const nodeTypes = { population: PopulationNode, spikeInput: InputNode };
