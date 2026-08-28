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
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { cx } from "../ui";
import { Check, X } from "../icons";
import type { DucStage } from "../../lib/ducSchema";
import type { TrackingEntry } from "../../lib/types";

type StageStatus = "done" | "skipped" | "current" | "pending";

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
        // Nó maior e clicável (realce leve em hover)
        "w-[260px] cursor-pointer rounded-2xl border bg-white px-5 py-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lg",
        status === "done"
          ? "border-emerald-200 hover:border-emerald-300"
          : status === "skipped"
            ? "border-slate-200 opacity-70 hover:opacity-100"
            : status === "current"
              ? "border-brand ring-2 ring-brand/25 hover:ring-brand/40"
              : "border-slate-200 hover:border-slate-300"
      )}
    >
      {!data.isFirst && <Handle type="target" position={Position.Top} className="!opacity-0" />}
      <div className="flex items-center gap-3">
        <span
          className={cx(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
            status === "done"
              ? "bg-emerald-500 text-white"
              : status === "skipped"
                ? "bg-slate-300 text-slate-600"
                : status === "current"
                  ? "bg-brand text-white"
                  : "bg-slate-100 text-slate-500"
          )}
        >
          {status === "done" ? (
            <Check width={18} height={18} />
          ) : status === "skipped" ? (
            <X width={18} height={18} />
          ) : (
            data.no
          )}
        </span>
        <div className="min-w-0">
          <p
            className={cx(
              "truncate text-base font-semibold text-slate-800",
              status === "skipped" && "line-through text-slate-400"
            )}
          >
            {data.title}
          </p>
          <p className="truncate text-xs text-slate-400">
            {status === "skipped" ? "Não precisa" : data.responsible || "—"}
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
const NODE_DY = 150;

/**
 * Vista de fluxo read-only das etapas de um DUC. Cada nó reflete o estado atual
 * (fechada / atual / pendente); as ligações fechadas ficam verdes e animadas.
 */
export function StageFlowView({
  stages,
  tracking,
  currentStage,
  onSelectStage,
}: {
  stages: DucStage[];
  tracking: TrackingEntry[];
  currentStage: number;
  /** Opcional: clicar num nó leva a essa etapa (nº da etapa). */
  onSelectStage?: (stageNo: number) => void;
}) {
  const stateOf = (no: number) => tracking.find((t) => t.stage === no)?.state;
  const isDone = (no: number) => stateOf(no) === "done";
  // Uma etapa "tratada" (fechada ou dispensada) colore a ligação seguinte.
  const isResolved = (no: number) => {
    const s = stateOf(no);
    return s === "done" || s === "skipped";
  };

  // Clique num nó → seleciona a etapa correspondente (id === String(stage.no))
  const handleNodeClick: NodeMouseHandler = (_event, node) => {
    onSelectStage?.(Number(node.id));
  };

  const nodes = useMemo<ProgressNode[]>(
    () =>
      stages.map((s, i) => {
        const st = stateOf(s.no);
        const status: StageStatus =
          st === "done"
            ? "done"
            : st === "skipped"
              ? "skipped"
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
        const resolved = isResolved(s.no);
        return {
          id: `e-${s.no}`,
          source: String(s.no),
          target: String(stages[i + 1].no),
          type: "smoothstep",
          animated: isDone(s.no),
          style: { stroke: resolved ? "#10b981" : "#cbd5e1", strokeWidth: 1.5 },
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stages, tracking]
  );

  return (
    <div className="h-[70vh] min-h-[520px] w-full overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50/40">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        nodesDraggable={false}
        onNodeClick={handleNodeClick}
        panOnScroll
        deleteKeyCode={null}
      >
        <Background gap={22} size={1.5} color="#e2e8f0" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
