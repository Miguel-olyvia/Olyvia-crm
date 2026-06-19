import { useState, useCallback, type CSSProperties } from "react";
import { Handle, Position, type NodeProps, NodeResizer } from "@xyflow/react";

/* ─── Handle styles ─── */
const hsBase: CSSProperties = { width: 12, height: 12, borderRadius: "50%", cursor: "crosshair" };
const hsSource: CSSProperties = { ...hsBase, background: "#94a3b8", border: "2px solid #cbd5e1", opacity: 0.65, zIndex: 20 };
const hsTarget: CSSProperties = { ...hsBase, background: "transparent", border: "none", width: 24, height: 24, opacity: 0, zIndex: 5 };

function FourHandles() {
  return (
    <>
      {/* Invisible larger target handles for easy drop */}
      <Handle type="target" position={Position.Top} id="t-top" style={{ ...hsTarget, top: -12 }} />
      <Handle type="target" position={Position.Bottom} id="t-bottom" style={{ ...hsTarget, bottom: -12 }} />
      <Handle type="target" position={Position.Left} id="t-left" style={{ ...hsTarget, left: -12 }} />
      <Handle type="target" position={Position.Right} id="t-right" style={{ ...hsTarget, right: -12 }} />
      {/* Visible source handles above targets so reverse connections are easy to start */}
      <Handle type="source" position={Position.Top} id="s-top" style={{ ...hsSource, top: -6 }} />
      <Handle type="source" position={Position.Bottom} id="s-bottom" style={{ ...hsSource, bottom: -6 }} />
      <Handle type="source" position={Position.Left} id="s-left" style={{ ...hsSource, left: -6 }} />
      <Handle type="source" position={Position.Right} id="s-right" style={{ ...hsSource, right: -6 }} />
    </>
  );
}

function EditableLabel({ value, onChange, style }: { value: string; onChange: (v: string) => void; style?: CSSProperties }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") setEditing(false); }}
        className="bg-transparent text-center outline-none border-b border-white/30 w-full"
        style={{ fontSize: "inherit", fontWeight: "inherit", color: "inherit", ...style }}
        onClick={e => e.stopPropagation()}
      />
    );
  }

  return (
    <span
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
      className="cursor-text select-none"
      style={style}
      title="Duplo clique para editar"
    >
      {value || "..."}
    </span>
  );
}

/* ═══════════════ BPMN Process (Rectangle) ═══════════════ */
export function BpmnProcessNode({ data, selected }: NodeProps) {
  const d = data as any;
  const bgColor = d.bgColor || "#f97316";
  const textColor = d.textColor || "#ffffff";
  const fontSize = d.fontSize || 13;
  const bold = d.bold ? "bold" : "normal";

  return (
    <>
      <NodeResizer isVisible={selected} minWidth={120} minHeight={50} lineClassName="!border-blue-400" handleClassName="!w-2 !h-2 !bg-blue-400 !border-blue-600" />
      <div
        className="w-full h-full flex items-center justify-center px-3 py-2"
        style={{ background: bgColor, borderRadius: 6, border: selected ? "2px solid #3b82f6" : "2px solid transparent" }}
      >
        <FourHandles />
        <EditableLabel
          value={d.label || "Processo"}
          onChange={v => d.onLabelChange?.(v)}
          style={{ color: textColor, fontSize, fontWeight: bold }}
        />
      </div>
    </>
  );
}

/* ═══════════════ BPMN Decision (Diamond) ═══════════════ */
export function BpmnDecisionNode({ data, selected }: NodeProps) {
  const d = data as any;
  const bgColor = d.bgColor || "#1e293b";
  const textColor = d.textColor || "#ffffff";
  const fontSize = d.fontSize || 11;
  const yesLabel = d.yesLabel || "Sim";
  const noLabel = d.noLabel || "Não";

  return (
    <>
      <NodeResizer isVisible={selected} minWidth={100} minHeight={100} lineClassName="!border-blue-400" handleClassName="!w-2 !h-2 !bg-blue-400 !border-blue-600" />
      <div className="w-full h-full flex items-center justify-center relative">
        <div
          className="absolute inset-0"
          style={{
            background: bgColor,
            transform: "rotate(45deg)",
            borderRadius: 4,
            border: selected ? "2px solid #3b82f6" : "2px solid transparent",
            margin: "10%",
          }}
        />
        <span
          className="relative z-10 text-center px-2 select-none"
          style={{ color: textColor, fontSize, fontWeight: d.bold ? "bold" : "normal" }}
          onDoubleClick={e => { e.stopPropagation(); d.onLabelChange?.(prompt("Texto:", d.label) || d.label); }}
          title="Duplo clique para editar"
        >
          {d.label || "Decisão?"}
        </span>
        {/* Decision handles */}
        <Handle type="target" position={Position.Top} id="t-top" style={{ ...hsTarget, top: -10 }} />
        <Handle type="target" position={Position.Left} id="t-left" style={{ ...hsTarget, left: -10 }} />
        <Handle type="target" position={Position.Bottom} id="t-bottom" style={{ ...hsTarget, bottom: -10 }} />
        <Handle type="target" position={Position.Right} id="t-right" style={{ ...hsTarget, right: -10 }} />
        <Handle type="source" position={Position.Top} id="s-top" style={{ ...hsSource, top: -4 }} />
        <Handle type="source" position={Position.Left} id="s-left" style={{ ...hsSource, left: -4 }} />
        <Handle type="source" position={Position.Bottom} id="yes" style={{ ...hsSource, bottom: -4, background: "#22c55e", borderColor: "#4ade80", zIndex: 20 }} />
        <Handle type="source" position={Position.Right} id="no" style={{ ...hsSource, right: -4, background: "#ef4444", borderColor: "#f87171", zIndex: 20 }} />
        {/* Yes/No labels */}
        <span className="absolute text-[9px] font-bold text-emerald-400" style={{ bottom: -16, left: "50%", transform: "translateX(-50%)" }}>{yesLabel}</span>
        <span className="absolute text-[9px] font-bold text-red-400" style={{ right: -20, top: "50%", transform: "translateY(-50%)" }}>{noLabel}</span>
      </div>
    </>
  );
}

/* ═══════════════ BPMN Start/End (Oval) ═══════════════ */
export function BpmnStartEndNode({ data, selected }: NodeProps) {
  const d = data as any;
  const isStart = d.subType === "start";
  const bgColor = d.bgColor || (isStart ? "#3b82f6" : "#22c55e");
  const textColor = d.textColor || "#ffffff";
  const fontSize = d.fontSize || 12;

  return (
    <>
      <NodeResizer isVisible={selected} minWidth={100} minHeight={50} lineClassName="!border-blue-400" handleClassName="!w-2 !h-2 !bg-blue-400 !border-blue-600" />
      <div
        className="w-full h-full flex items-center justify-center px-4 py-2"
        style={{ background: bgColor, borderRadius: 9999, border: selected ? "2px solid #3b82f6" : "2px solid transparent" }}
      >
        <FourHandles />
        <EditableLabel
          value={d.label || (isStart ? "Início" : "Fim")}
          onChange={v => d.onLabelChange?.(v)}
          style={{ color: textColor, fontSize, fontWeight: d.bold ? "bold" : "normal" }}
        />
      </div>
    </>
  );
}

/* ═══════════════ BPMN Sub-Process (Rounded Rect) ═══════════════ */
export function BpmnSubProcessNode({ data, selected }: NodeProps) {
  const d = data as any;
  const bgColor = d.bgColor || "#fb923c";
  const textColor = d.textColor || "#ffffff";
  const fontSize = d.fontSize || 12;

  return (
    <>
      <NodeResizer isVisible={selected} minWidth={140} minHeight={60} lineClassName="!border-blue-400" handleClassName="!w-2 !h-2 !bg-blue-400 !border-blue-600" />
      <div
        className="w-full h-full flex items-center justify-center px-3 py-2"
        style={{
          background: bgColor,
          borderRadius: 16,
          border: selected ? "3px double #3b82f6" : "3px double rgba(255,255,255,0.3)",
        }}
      >
        <FourHandles />
        <EditableLabel
          value={d.label || "Sub-Processo"}
          onChange={v => d.onLabelChange?.(v)}
          style={{ color: textColor, fontSize, fontWeight: d.bold ? "bold" : "normal" }}
        />
      </div>
    </>
  );
}

/* ═══════════════ BPMN Event (Circle) ═══════════════ */
export function BpmnEventNode({ data, selected }: NodeProps) {
  const d = data as any;
  const bgColor = d.bgColor || "#8b5cf6";
  const textColor = d.textColor || "#ffffff";
  const fontSize = d.fontSize || 10;

  return (
    <>
      <NodeResizer isVisible={selected} minWidth={60} minHeight={60} lineClassName="!border-blue-400" handleClassName="!w-2 !h-2 !bg-blue-400 !border-blue-600" />
      <div
        className="w-full h-full flex items-center justify-center rounded-full"
        style={{ background: bgColor, border: selected ? "2px solid #3b82f6" : "2px solid transparent", aspectRatio: "1" }}
      >
        <FourHandles />
        <EditableLabel
          value={d.label || "Evento"}
          onChange={v => d.onLabelChange?.(v)}
          style={{ color: textColor, fontSize, fontWeight: d.bold ? "bold" : "normal" }}
        />
      </div>
    </>
  );
}

/* ═══════════════ Free Text / Annotation ═══════════════ */
export function BpmnTextNode({ data, selected }: NodeProps) {
  const d = data as any;
  const textColor = d.textColor || "#e2e8f0";
  const fontSize = d.fontSize || 14;
  const bold = d.bold ? "bold" : "normal";
  const italic = d.italic ? "italic" : "normal";

  return (
    <>
      <NodeResizer isVisible={selected} minWidth={60} minHeight={24} lineClassName="!border-blue-400" handleClassName="!w-2 !h-2 !bg-blue-400 !border-blue-600" />
      <div
        className="w-full h-full flex items-center justify-center px-2"
        style={{ border: selected ? "1px dashed #3b82f6" : "none" }}
      >
        <EditableLabel
          value={d.label || "Texto"}
          onChange={v => d.onLabelChange?.(v)}
          style={{ color: textColor, fontSize, fontWeight: bold, fontStyle: italic }}
        />
      </div>
    </>
  );
}

/* ═══════════════ Swim Lane (supports nesting) ═══════════════ */
export function SwimLaneNode({ data, selected, parentId }: NodeProps) {
  const d = data as any;
  const borderColor = d.bgColor || "#64748b";
  const textColor = d.textColor || "#94a3b8";
  const fontSize = d.fontSize || 14;
  const isNested = !!(parentId);
  const isStructuredChild = !!d.isStructuredChild;

  return (
    <>
      {!isStructuredChild && (
        <NodeResizer
          isVisible={selected}
          minWidth={isNested ? 200 : 300}
          minHeight={isNested ? 150 : 200}
          lineClassName="!border-slate-400"
          handleClassName="!w-2.5 !h-2.5 !bg-slate-400 !border-slate-500"
          onResizeEnd={() => d.onResizeEnd?.()}
        />
      )}
      <div
        className="w-full h-full relative"
        style={{
          border: isStructuredChild
            ? `1px solid ${borderColor}`
            : `2px ${isNested ? "solid" : "dashed"} ${borderColor}`,
          borderRadius: isStructuredChild ? 0 : (isNested ? 6 : 8),
          background: isNested ? "rgba(100,116,139,0.08)" : "rgba(100,116,139,0.05)",
          pointerEvents: "none",
          transition: "border-color 0.2s, background 0.2s",
        }}
      >
        <div
          className="absolute top-0 left-0 right-0 px-3 py-1.5 flex items-center gap-1.5"
          style={{
            borderBottom: `1px ${isNested ? "solid" : "dashed"} ${borderColor}`,
            background: isNested ? "rgba(100,116,139,0.15)" : "rgba(100,116,139,0.1)",
            borderRadius: isStructuredChild ? 0 : (isNested ? "4px 4px 0 0" : "6px 6px 0 0"),
            pointerEvents: "auto",
            transition: "border-color 0.2s, background 0.2s",
          }}
        >
          {isNested && <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: borderColor, flexShrink: 0 }} />}
          <EditableLabel
            value={d.label || "Secção"}
            onChange={v => d.onLabelChange?.(v)}
            style={{ color: textColor, fontSize: isNested ? fontSize - 1 : fontSize, fontWeight: "bold" }}
          />
        </div>
      </div>
    </>
  );
}

/* ═══════════════ Export node types map ═══════════════ */
export const bpmnNodeTypes = {
  bpmnProcess: BpmnProcessNode,
  bpmnDecision: BpmnDecisionNode,
  bpmnStartEnd: BpmnStartEndNode,
  bpmnSubProcess: BpmnSubProcessNode,
  bpmnEvent: BpmnEventNode,
  bpmnText: BpmnTextNode,
  swimLane: SwimLaneNode,
};
