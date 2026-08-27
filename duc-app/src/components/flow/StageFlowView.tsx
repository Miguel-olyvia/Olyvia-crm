import { memo, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { cx } from "../ui";
import { Check } from "../icons";
import type { DucStage } from "../../lib/ducSchema";
import type { TrackingEntry } from "../../lib/types";

type StageStatus = "done" | "current" | "pending";

interface ProgressData extends Record<string, unknown> {
  no: number;
  title: string;
  responsible: string;
  status: StageStatus;
  isFirst: boolean;
  isLast: boolean;
}
type ProgressNode = Node<ProgressData, "progress">;

/** Nó read-only: mostra a etapa e o seu estado no fluxo (só leitura). */
function ProgressNodeImpl({ data }: NodeProps<ProgressNode>) {
  const { status } = data;
  return (
    <div
      className={cx(
        "w-[220px] rounded-2xl border bg-white px-4 py-3 shadow-card transition-shadow",
        status === "done"
          ? "border-emerald-200"
          : status === "current"
            ? "border-brand ring-2 ring-brand/25"
            : "border-slate-200"
      )}
    >
      {!data.isFirst && <Handle type="target" position={Position.Top} className="!opacity-0" />}
      <div className="flex items-center gap-2.5">
        <span
          className={cx(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
            status === "done"
              ? "bg-emerald-500 text-white"
              : status === "current"
                ? "bg-brand text-white"
                : "bg-slate-100 text-slate-500"
          )}
        >
          {status === "done" ? <Check width={14} height={14} /> : data.no}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">{data.title}</p>
          <p className="truncate text-[11px] text-slate-400">
            {data.responsible || "—"}
            {status === "current" && " · em curso"}
          </p>
        </div>
      </div>
      {!data.isLast && <Handle type="source" position={Position.Bottom} className="!opacity-0" />}
    </div>
  );
}

const ProgressNodeComponent = memo(ProgressNodeImpl);
const nodeTypes: NodeTypes = { progress: ProgressNodeComponent };

const NODE_X = 40;
const NODE_Y0 = 20;
const NODE_DY = 120;

/**
 * Vista de fluxo read-only das etapas de um DUC. Cada nó reflete o estado atual
 * (fechada / atual / pendente); as ligações fechadas ficam verdes e animadas.
 */
export function StageFlowView({
  stages,
  tracking,
  currentStage,
}: {
  stages: DucStage[];
  tracking: TrackingEntry[];
  currentStage: number;
}) {
  const isDone = (no: number) => tracking.find((t) => t.stage === no)?.state === "done";

  const nodes = useMemo<ProgressNode[]>(
    () =>
      stages.map((s, i) => {
        const status: StageStatus = isDone(s.no)
          ? "done"
          : s.no === currentStage
            ? "current"
            : "pending";
        return {
          id: String(s.no),
          type: "progress",
          position: { x: NODE_X, y: NODE_Y0 + i * NODE_DY },
          data: {
            no: s.no,
            title: s.title.split(" — ")[0],
            responsible: s.responsible,
            status,
            isFirst: i === 0,
            isLast: i === stages.length - 1,
          },
          draggable: false,
          selectable: false,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stages, tracking, currentStage]
  );

  const edges = useMemo<Edge[]>(
    () =>
      stages.slice(0, -1).map((s, i) => {
        const done = isDone(s.no);
        return {
          id: `e-${s.no}`,
          source: String(s.no),
          target: String(stages[i + 1].no),
          type: "smoothstep",
          animated: done,
          style: { stroke: done ? "#10b981" : "#cbd5e1", strokeWidth: 1.5 },
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stages, tracking]
  );

  return (
    <div className="h-[62vh] min-h-[420px] w-full overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50/40">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        nodesDraggable={false}
        panOnScroll
        deleteKeyCode={null}
      >
        <Background gap={22} size={1.5} color="#e2e8f0" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
