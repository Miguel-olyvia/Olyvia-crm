import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { cx } from "../ui";

/** Dados transportados por cada nó de etapa no React Flow. */
export interface StageNodeData extends Record<string, unknown> {
  no: number;
  title: string;
  responsible: string;
  fieldCount: number;
  sectionCount: number;
  hasError: boolean;
  isFirst: boolean;
  isLast: boolean;
}

export type StageNode = Node<StageNodeData, "ducStage">;

/**
 * Cartão de etapa ao estilo n8n: número, título, responsável, contagens vivas,
 * acento de cor à esquerda, handles de entrada/saída, realce em hover/seleção.
 */
function StageNodeImpl({ data, selected }: NodeProps<StageNode>) {
  return (
    <div
      className={cx(
        "duc-node group relative w-[240px] cursor-pointer select-none rounded-2xl border bg-white shadow-card transition-all duration-150",
        "hover:-translate-y-0.5 hover:shadow-elevated",
        selected
          ? "border-brand ring-2 ring-brand/30"
          : data.hasError
            ? "border-red-300"
            : "border-slate-200/80"
      )}
    >
      {/* Handle de entrada (topo) — a primeira etapa não recebe. */}
      {!data.isFirst && (
        <Handle type="target" position={Position.Top} className="!-top-1.5" />
      )}

      {/* Acento de cor à esquerda. */}
      <span
        aria-hidden
        className={cx(
          "absolute inset-y-3 left-0 w-1 rounded-full",
          data.hasError ? "bg-red-400" : "bg-gradient-to-b from-brand-light to-brand"
        )}
      />

      <div className="flex items-start gap-3 px-4 py-3.5 pl-5">
        <span
          className={cx(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-bold shadow-sm transition-colors",
            data.hasError
              ? "bg-red-50 text-red-600 ring-1 ring-red-100"
              : "bg-brand-50 text-brand-800 ring-1 ring-brand-100 group-hover:bg-brand group-hover:text-white"
          )}
        >
          {data.no}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight text-slate-800">
            {data.title || "Sem título"}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-400">
            {data.responsible || "Sem responsável"}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 ring-1 ring-inset ring-slate-200">
              {data.fieldCount} {data.fieldCount === 1 ? "campo" : "campos"}
            </span>
            {data.sectionCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-1.5 py-0.5 text-[11px] font-medium text-teal-700 ring-1 ring-inset ring-teal-100">
                {data.sectionCount} {data.sectionCount === 1 ? "tabela" : "tabelas"}
              </span>
            )}
            {data.hasError && (
              <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-600 ring-1 ring-inset ring-red-100">
                Erro
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Handle de saída (base) — a última etapa não emite. */}
      {!data.isLast && (
        <Handle type="source" position={Position.Bottom} className="!-bottom-1.5" />
      )}
    </div>
  );
}

export const StageNodeComponent = memo(StageNodeImpl);
