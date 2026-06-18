import { type DragEvent } from "react";
import {
  Square, Diamond, Circle, Type, Columns, Hexagon, RectangleHorizontal, Minus,
} from "lucide-react";

interface BpmnItemDef {
  type: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  defaultWidth?: number;
  defaultHeight?: number;
}

const BPMN_ITEMS: BpmnItemDef[] = [
  { type: "bpmnProcess", label: "Processo", description: "Rectângulo — tarefa", icon: <Square className="w-4 h-4" />, color: "#f97316", defaultWidth: 160, defaultHeight: 60 },
  { type: "bpmnDecision", label: "Decisão", description: "Losango — Sim/Não", icon: <Diamond className="w-4 h-4" />, color: "#1e293b", defaultWidth: 120, defaultHeight: 120 },
  { type: "bpmnStartEnd:start", label: "Início", description: "Oval — ponto de início", icon: <Circle className="w-4 h-4" />, color: "#3b82f6", defaultWidth: 120, defaultHeight: 50 },
  { type: "bpmnStartEnd:end", label: "Fim", description: "Oval — ponto final", icon: <Circle className="w-4 h-4" />, color: "#22c55e", defaultWidth: 120, defaultHeight: 50 },
  { type: "bpmnSubProcess", label: "Sub-Processo", description: "Rect arredondado", icon: <RectangleHorizontal className="w-4 h-4" />, color: "#fb923c", defaultWidth: 160, defaultHeight: 60 },
  { type: "bpmnEvent", label: "Evento", description: "Círculo — evento", icon: <Hexagon className="w-4 h-4" />, color: "#8b5cf6", defaultWidth: 70, defaultHeight: 70 },
  { type: "bpmnText", label: "Texto Livre", description: "Anotação / label", icon: <Type className="w-4 h-4" />, color: "#94a3b8", defaultWidth: 150, defaultHeight: 40 },
  { type: "swimLane", label: "Swim Lane", description: "Secção / departamento (aninhável)", icon: <Columns className="w-4 h-4" />, color: "#64748b", defaultWidth: 400, defaultHeight: 300 },
];

export function BpmnPalette() {
  const onDragStart = (e: DragEvent, item: BpmnItemDef) => {
    e.dataTransfer.setData("application/bpmnNodeType", item.type);
    e.dataTransfer.setData("application/bpmnWidth", String(item.defaultWidth || 160));
    e.dataTransfer.setData("application/bpmnHeight", String(item.defaultHeight || 60));
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="mt-2">
      <div className="flex items-center gap-1.5 mb-2 text-[11px] font-bold tracking-wider text-slate-500">
        <Square className="w-3.5 h-3.5 text-orange-400" />
        📐 FORMAS BPMN
      </div>
      <div className="space-y-1.5">
        {BPMN_ITEMS.map(item => (
          <div
            key={item.type}
            draggable
            onDragStart={e => onDragStart(e, item)}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-grab active:cursor-grabbing transition-colors hover:bg-white/5"
            style={{ background: "#1a1a3a", border: "1px solid #2d3a5a" }}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: item.color + "33" }}
            >
              <span style={{ color: item.color }}>{item.icon}</span>
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-200 truncate">{item.label}</div>
              <div className="text-[10px] text-slate-500 truncate">{item.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
