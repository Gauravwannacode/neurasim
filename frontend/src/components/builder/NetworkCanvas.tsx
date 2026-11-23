import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useNetworkStore } from "../../lib/store";
import { DEFAULT_WEIGHT, MODEL_COLORS, makeSynapse, type Network } from "../../lib/network";
import { nodeTypes } from "./nodes";
import { EdgeMarkers, edgeTypes, type SynapseFlowEdge } from "./SynapseEdge";

interface Props {
  /** Optional live overlays from the latest simulation run. */
  rates?: Record<string, number>;
  learnedWeights?: Record<string, number>;
}

function toNodes(net: Network, rates: Record<string, number> | undefined, previous: Node[]): Node[] {
  const prev = new Map(previous.map((n) => [n.id, n]));
  const keep = (id: string) => {
    const p = prev.get(id);
    return p ? { measured: p.measured, selected: p.selected } : {};
  };
  return [
    ...net.inputs.map((i) => ({
      id: i.id,
      type: "spikeInput", // not "input": React Flow styles that built-in type
      position: i.position,
      data: { label: i.label, count: i.count, kind: i.kind, rateHz: i.rate_hz },
      ...keep(i.id),
    })),
    ...net.populations.map((p) => ({
      id: p.id,
      type: "population",
      position: p.position,
      data: { label: p.label, count: p.count, model: p.model, vth: p.params.v_th, rateHz: rates?.[p.id] },
      ...keep(p.id),
    })),
  ];
}

export default function NetworkCanvas({ rates, learnedWeights }: Props) {
  const network = useNetworkStore((s) => s.network);
  const revision = useNetworkStore((s) => s.revision);
  const selection = useNetworkStore((s) => s.selection);
  const { select, moveNode, removeNode, removeSynapse, addSynapse } = useNetworkStore.getState();
  const { fitView } = useReactFlow();
  const nodeCount = network.populations.length + network.inputs.length;

  // Nodes are kept locally so React Flow can track drag positions and measured sizes;
  // they are rebuilt from the store whenever the network changes.
  const [nodes, setNodes] = useState<Node[]>(() => toNodes(network, rates, []));
  useEffect(() => setNodes((prev) => toNodes(network, rates, prev)), [network, rates]);
  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.25, duration: 300, maxZoom: 1.2 }), 100);
    return () => clearTimeout(t);
  }, [revision, nodeCount, fitView]);

  const edges: SynapseFlowEdge[] = useMemo(
    () =>
      network.synapses.map((s) => ({
        id: s.id,
        type: "synapse",
        source: s.source,
        target: s.target,
        selected: selection?.kind === "synapse" && selection.id === s.id,
        data: {
          weight: s.weight,
          delay: s.delay_ms,
          p: s.p_connect,
          stdp: s.plasticity === "stdp",
          learnedWeight: learnedWeights?.[s.id],
        },
      })),
    [network.synapses, selection, learnedWeights],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
      for (const c of changes) {
        if (c.type === "position" && c.position && !c.dragging) moveNode(c.id, c.position);
        if (c.type === "remove") removeNode(c.id);
        if (c.type === "select" && c.selected) {
          const isInput = network.inputs.some((i) => i.id === c.id);
          select({ kind: isInput ? "input" : "population", id: c.id });
        }
      }
    },
    [network.inputs, moveNode, removeNode, select],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const c of changes) {
        if (c.type === "remove") removeSynapse(c.id);
        if (c.type === "select" && c.selected) select({ kind: "synapse", id: c.id });
      }
    },
    [removeSynapse, select],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      const target = network.populations.find((p) => p.id === conn.target);
      if (!target || !conn.source) return;
      addSynapse(makeSynapse(conn.source, target.id, DEFAULT_WEIGHT[target.model]));
    },
    [network.populations, addSynapse],
  );

  const isValidConnection = useCallback(
    (c: Connection | SynapseFlowEdge) => network.populations.some((p) => p.id === c.target),
    [network.populations],
  );

  return (
    <div className="relative h-full w-full">
      <EdgeMarkers />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onPaneClick={() => select(null)}
        deleteKeyCode={["Backspace", "Delete"]}
        colorMode="dark"
        fitView
        minZoom={0.2}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#2b2637" />
        <Controls position="bottom-left" />
        <MiniMap
          pannable
          zoomable
          className="!hidden !bg-ink-900 lg:!block"
          nodeColor={(n) => (n.type === "spikeInput" ? "#f6b73c" : MODEL_COLORS[(n.data as { model: keyof typeof MODEL_COLORS }).model])}
        />
      </ReactFlow>
    </div>
  );
}
