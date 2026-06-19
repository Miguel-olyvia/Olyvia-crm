import { type Node, type Edge } from "@xyflow/react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X, Bold, Italic } from "lucide-react";

const BPMN_NODE_TYPES = ["bpmnProcess", "bpmnDecision", "bpmnStartEnd", "bpmnSubProcess", "bpmnEvent", "bpmnText", "swimLane"];

export function isBpmnNode(node: Node): boolean {
  return BPMN_NODE_TYPES.includes(node.type || "");
}

interface BpmnPanelProps {
  node: Node;
  onUpdate: (id: string, data: any) => void;
  onClose: () => void;
}

export function BpmnPropertiesPanel({ node, onUpdate, onClose }: BpmnPanelProps) {
  const d = node.data as any;
  const nodeType = node.type || "";
  const update = (patch: Record<string, any>) => onUpdate(node.id, { ...d, ...patch });

  const typeLabels: Record<string, string> = {
    bpmnProcess: "Processo",
    bpmnDecision: "Decisão",
    bpmnStartEnd: "Início/Fim",
    bpmnSubProcess: "Sub-Processo",
    bpmnEvent: "Evento",
    bpmnText: "Texto Livre",
    swimLane: "Swim Lane",
  };

  return (
    <div className="w-[280px] shrink-0 overflow-y-auto h-full" style={{ background: "#141428", borderLeft: "1px solid #2d3a5a" }}>
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-200">{typeLabels[nodeType] || "Forma"}</span>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X className="w-4 h-4" /></button>
        </div>

        {/* Label */}
        <div>
          <Label className="text-xs text-slate-400">Texto</Label>
          <Input
            value={d.label || ""}
            onChange={e => update({ label: e.target.value })}
            className="mt-1 bg-[#1a1a3a] border-[#2d3a5a] text-slate-200 text-sm"
          />
        </div>

        {/* Background color */}
        {nodeType !== "bpmnText" && (
          <div>
            <Label className="text-xs text-slate-400">Cor de Fundo</Label>
            <div className="flex gap-2 mt-1 items-center">
              <input
                type="color"
                value={d.bgColor || "#f97316"}
                onChange={e => update({ bgColor: e.target.value })}
                className="w-8 h-8 rounded cursor-pointer border-0"
              />
              <Input
                value={d.bgColor || "#f97316"}
                onChange={e => update({ bgColor: e.target.value })}
                className="bg-[#1a1a3a] border-[#2d3a5a] text-slate-200 text-sm flex-1"
              />
            </div>
          </div>
        )}

        {/* Text color */}
        <div>
          <Label className="text-xs text-slate-400">Cor do Texto</Label>
          <div className="flex gap-2 mt-1 items-center">
            <input
              type="color"
              value={d.textColor || "#ffffff"}
              onChange={e => update({ textColor: e.target.value })}
              className="w-8 h-8 rounded cursor-pointer border-0"
            />
            <Input
              value={d.textColor || "#ffffff"}
              onChange={e => update({ textColor: e.target.value })}
              className="bg-[#1a1a3a] border-[#2d3a5a] text-slate-200 text-sm flex-1"
            />
          </div>
        </div>

        {/* Font size */}
        <div>
          <Label className="text-xs text-slate-400">Tamanho do Texto</Label>
          <Select value={String(d.fontSize || 13)} onValueChange={v => update({ fontSize: parseInt(v) })}>
            <SelectTrigger className="mt-1 bg-[#1a1a3a] border-[#2d3a5a] text-slate-200 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">Pequeno (10)</SelectItem>
              <SelectItem value="12">Médio (12)</SelectItem>
              <SelectItem value="13">Normal (13)</SelectItem>
              <SelectItem value="16">Grande (16)</SelectItem>
              <SelectItem value="20">Extra Grande (20)</SelectItem>
              <SelectItem value="24">Título (24)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Bold / Italic */}
        <div className="flex gap-2">
          <Button
            variant={d.bold ? "default" : "outline"}
            size="sm"
            onClick={() => update({ bold: !d.bold })}
            className={d.bold ? "bg-violet-600 hover:bg-violet-700 text-white" : "border-[#2d3a5a] text-slate-400 hover:text-slate-200 hover:bg-white/5"}
          >
            <Bold className="w-3.5 h-3.5" />
          </Button>
          {(nodeType === "bpmnText") && (
            <Button
              variant={d.italic ? "default" : "outline"}
              size="sm"
              onClick={() => update({ italic: !d.italic })}
              className={d.italic ? "bg-violet-600 hover:bg-violet-700 text-white" : "border-[#2d3a5a] text-slate-400 hover:text-slate-200 hover:bg-white/5"}
            >
              <Italic className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

        {/* Decision-specific: Yes/No labels */}
        {nodeType === "bpmnDecision" && (
          <>
            <div>
              <Label className="text-xs text-slate-400">Label "Sim"</Label>
              <Input
                value={d.yesLabel || "Sim"}
                onChange={e => update({ yesLabel: e.target.value })}
                className="mt-1 bg-[#1a1a3a] border-[#2d3a5a] text-slate-200 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-slate-400">Label "Não"</Label>
              <Input
                value={d.noLabel || "Não"}
                onChange={e => update({ noLabel: e.target.value })}
                className="mt-1 bg-[#1a1a3a] border-[#2d3a5a] text-slate-200 text-sm"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════ Edge Properties Panel ═══════════════ */

interface EdgePanelProps {
  edge: Edge;
  onUpdate: (id: string, data: Record<string, any>) => void;
  onClose: () => void;
}

export function EdgePropertiesPanel({ edge, onUpdate, onClose }: EdgePanelProps) {
  const d = (edge.data || {}) as any;
  const update = (patch: Record<string, any>) => onUpdate(edge.id, { ...d, ...patch });

  return (
    <div className="w-[280px] shrink-0 overflow-y-auto h-full" style={{ background: "#141428", borderLeft: "1px solid #2d3a5a" }}>
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-200">Conector</span>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X className="w-4 h-4" /></button>
        </div>

        {/* Edge label */}
        <div>
          <Label className="text-xs text-slate-400">Label</Label>
          <Input
            value={d.edgeLabel || ""}
            onChange={e => update({ edgeLabel: e.target.value })}
            placeholder="Ex: Sim, Não, Se aprovado"
            className="mt-1 bg-[#1a1a3a] border-[#2d3a5a] text-slate-200 text-sm"
          />
        </div>

        {/* Edge type */}
        <div>
          <Label className="text-xs text-slate-400">Tipo de Linha</Label>
          <Select value={d.edgeType || "bezier"} onValueChange={v => update({ edgeType: v })}>
            <SelectTrigger className="mt-1 bg-[#1a1a3a] border-[#2d3a5a] text-slate-200 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bezier">Curva (Bezier)</SelectItem>
              <SelectItem value="straight">Recta</SelectItem>
              <SelectItem value="step">Ângulo Recto (L)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Arrow direction */}
        <div>
          <Label className="text-xs text-slate-400">Seta</Label>
          <Select value={d.arrowDir || "end"} onValueChange={v => update({ arrowDir: v })}>
            <SelectTrigger className="mt-1 bg-[#1a1a3a] border-[#2d3a5a] text-slate-200 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="end">No fim →</SelectItem>
              <SelectItem value="start">No início ←</SelectItem>
              <SelectItem value="both">Ambos ↔</SelectItem>
              <SelectItem value="none">Sem seta</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Edge color */}
        <div>
          <Label className="text-xs text-slate-400">Cor</Label>
          <div className="flex gap-2 mt-1 items-center">
            <input
              type="color"
              value={d.edgeColor || "#94a3b8"}
              onChange={e => update({ edgeColor: e.target.value })}
              className="w-8 h-8 rounded cursor-pointer border-0"
            />
            <Input
              value={d.edgeColor || "#94a3b8"}
              onChange={e => update({ edgeColor: e.target.value })}
              className="bg-[#1a1a3a] border-[#2d3a5a] text-slate-200 text-sm flex-1"
            />
          </div>
        </div>

        {/* Edge thickness */}
        <div>
          <Label className="text-xs text-slate-400">Espessura</Label>
          <Select value={String(d.edgeWidth || 2)} onValueChange={v => update({ edgeWidth: parseInt(v) })}>
            <SelectTrigger className="mt-1 bg-[#1a1a3a] border-[#2d3a5a] text-slate-200 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Fina (1)</SelectItem>
              <SelectItem value="2">Normal (2)</SelectItem>
              <SelectItem value="3">Média (3)</SelectItem>
              <SelectItem value="4">Grossa (4)</SelectItem>
              <SelectItem value="5">Extra (5)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
