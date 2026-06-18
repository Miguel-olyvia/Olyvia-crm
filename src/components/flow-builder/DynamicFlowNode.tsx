import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useDynamicNodes } from "./DynamicNodeContext";
import { BEHAVIOR_LABELS, BEHAVIOR_COLORS } from "./types";
import { X } from "lucide-react";

export function DynamicFlowNode({ id, data, selected }: NodeProps) {
  const { getNodeType } = useDynamicNodes();
  const d = data as any;
  const nt = getNodeType(d.nodeTypeId);

  const color = nt?.color || BEHAVIOR_COLORS[nt?.behaviorType || "action"] || "#2563eb";
  const emoji = nt?.emoji || "⚡";
  const name = d.title || nt?.name || "Nó";
  const behaviorLabel = BEHAVIOR_LABELS[nt?.behaviorType || "action"];
  const isCondition = nt?.behaviorType === "condition";

  // Build subtitle from field values
  const fieldValues = d.fieldValues || {};
  const subtitle = nt?.fields
    .sort((a, b) => a.order - b.order)
    .slice(0, 2)
    .map(f => fieldValues[f.id] ? `${f.name}: ${fieldValues[f.id]}` : null)
    .filter(Boolean)
    .join(" · ") || d.subtitle || "Clique para configurar";

  return (
    <div
      className="relative group min-w-[180px] max-w-[220px] rounded-lg transition-all"
      style={{
        background: "#1e2a4a",
        border: selected ? "2px solid #7c3aed" : "2px solid #2d3a5a",
        boxShadow: selected ? "0 0 20px rgba(124,58,237,0.4)" : "0 2px 8px rgba(0,0,0,0.3)",
        overflow: "visible",
      }}
    >
      {/* Delete button */}
      <button
        className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity rounded-full w-5 h-5 flex items-center justify-center"
        style={{ background: "rgba(220,38,38,0.8)" }}
        onClick={e => { e.stopPropagation(); d.onDelete?.(id); }}
      >
        <X className="w-3 h-3 text-white" />
      </button>

      {/* Target handle (top) */}
      <Handle
        type="target"
        position={Position.Top}
        id="t-top"
        className="!w-3 !h-3 !rounded-full !border hover:!scale-[2] !transition-transform !cursor-crosshair"
        style={{ background: "#7c3aed", borderColor: "#a78bfa", top: -6, zIndex: 10 }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="t-left"
        className="!w-3 !h-3 !rounded-full !border hover:!scale-[2] !transition-transform !cursor-crosshair"
        style={{ background: "#7c3aed", borderColor: "#a78bfa", left: -6, zIndex: 10 }}
      />
      <Handle
        type="target"
        position={Position.Right}
        id="t-right"
        className="!w-3 !h-3 !rounded-full !border hover:!scale-[2] !transition-transform !cursor-crosshair"
        style={{ background: "#7c3aed", borderColor: "#a78bfa", right: -6, zIndex: 10 }}
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="t-bottom"
        className="!w-3 !h-3 !rounded-full !border hover:!scale-[2] !transition-transform !cursor-crosshair"
        style={{ background: "#7c3aed", borderColor: "#a78bfa", bottom: -6, zIndex: 10 }}
      />

      {/* Header */}
      <div className="px-3 py-1.5 flex items-center gap-2 rounded-t-[6px]" style={{ background: color }}>
        <span className="text-sm">{emoji}</span>
        <div>
          <div className="text-[9px] font-bold uppercase tracking-wider text-white/70">{behaviorLabel}</div>
          <div className="text-xs font-semibold text-white truncate">{name}</div>
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        <div className="text-[11px] text-slate-400 truncate">{subtitle}</div>
      </div>

      {/* Source handles */}
      {isCondition ? (
        <>
          <Handle
            type="source"
            position={Position.Left}
            id="yes"
            className="!w-3 !h-3 !rounded-full !border hover:!scale-[2] !transition-transform !cursor-crosshair"
            style={{ background: "#22c55e", borderColor: "#4ade80", left: -6, top: "50%", transform: "translateY(-50%)", zIndex: 10 }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="no"
            className="!w-3 !h-3 !rounded-full !border hover:!scale-[2] !transition-transform !cursor-crosshair"
            style={{ background: "#ef4444", borderColor: "#f87171", right: -6, top: "50%", transform: "translateY(-50%)", zIndex: 10 }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="s-bottom"
            className="!w-3 !h-3 !rounded-full !border hover:!scale-[2] !transition-transform !cursor-crosshair"
            style={{ background: "#7c3aed", borderColor: "#a78bfa", bottom: -6, zIndex: 10 }}
          />
          <span className="absolute text-[8px] font-bold text-emerald-400" style={{ left: -20, top: "50%", transform: "translateY(-50%) translateX(-100%)" }}>Sim</span>
          <span className="absolute text-[8px] font-bold text-red-400" style={{ right: -20, top: "50%", transform: "translateY(-50%) translateX(100%)" }}>Não</span>
        </>
      ) : (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="s-bottom"
            className="!w-3 !h-3 !rounded-full !border hover:!scale-[2] !transition-transform !cursor-crosshair"
            style={{ background: "#7c3aed", borderColor: "#a78bfa", bottom: -6, zIndex: 10 }}
          />
          <Handle
            type="source"
            position={Position.Left}
            id="s-left"
            className="!w-3 !h-3 !rounded-full !border hover:!scale-[2] !transition-transform !cursor-crosshair"
            style={{ background: "#7c3aed", borderColor: "#a78bfa", left: -6, zIndex: 10 }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="s-right"
            className="!w-3 !h-3 !rounded-full !border hover:!scale-[2] !transition-transform !cursor-crosshair"
            style={{ background: "#7c3aed", borderColor: "#a78bfa", right: -6, zIndex: 10 }}
          />
        </>
      )}
    </div>
  );
}
