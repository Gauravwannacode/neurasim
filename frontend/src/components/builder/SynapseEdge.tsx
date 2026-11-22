import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from "@xyflow/react";

export type SynapseEdgeData = {
  weight: number;
  delay: number;
  p: number;
  stdp: boolean;
  /** Mean weight from the latest run (STDP), to show learning on the canvas. */
  learnedWeight?: number;
};
export type SynapseFlowEdge = Edge<SynapseEdgeData, "synapse">;

function selfLoopPath(sx: number, sy: number, tx: number, ty: number): [string, number, number] {
  const lift = 110;
  const path = `M ${sx} ${sy} C ${sx + 80} ${sy - lift}, ${tx - 80} ${ty - lift}, ${tx} ${ty}`;
  return [path, (sx + tx) / 2, Math.min(sy, ty) - lift * 0.75];
}

export const SynapseEdge = memo(function SynapseEdge(props: EdgeProps<SynapseFlowEdge>) {
  const { id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected } = props;
  const [path, labelX, labelY] =
    source === target
      ? selfLoopPath(sourceX, sourceY, targetX, targetY)
      : getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const inhibitory = (data?.weight ?? 0) < 0;
  const color = inhibitory ? "#fb7185" : "#38bdf8";
  const width = Math.min(6, 1.2 + Math.abs(data?.weight ?? 1) * 0.35);

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={inhibitory ? "url(#inhibitory-dot)" : "url(#excitatory-arrow)"}
        style={{
          stroke: color,
          strokeWidth: selected ? width + 1.5 : width,
          strokeDasharray: data?.stdp ? "6 4" : undefined,
          opacity: selected ? 1 : 0.75,
          animation: data?.stdp ? "dash 1s linear infinite" : undefined,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className={`nodrag nopan pointer-events-auto absolute rounded-md border px-1.5 py-0.5 font-mono text-[10px] ${
            selected ? "border-white/60 bg-ink-700" : "border-ink-600 bg-ink-900/90"
          }`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, color }}
        >
          w={data?.weight}
          {data?.learnedWeight !== undefined && <span className="text-emerald-300"> → {data.learnedWeight.toFixed(2)}</span>}
          <span className="text-slate-400"> · {data?.delay}ms · p={data?.p}</span>
          {data?.stdp && <span className="text-fuchsia-300"> · STDP</span>}
        </div>
      </EdgeLabelRenderer>
    </>
  );
});

export const edgeTypes = { synapse: SynapseEdge };

/** SVG marker definitions (arrow for excitation, dot for inhibition, as in neuroscience diagrams). */
export function EdgeMarkers() {
  return (
    <svg style={{ position: "absolute", width: 0, height: 0 }}>
      <defs>
        <marker id="excitatory-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#38bdf8" />
        </marker>
        <marker id="inhibitory-dot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6">
          <circle cx="5" cy="5" r="4" fill="#fb7185" />
        </marker>
      </defs>
    </svg>
  );
}
