import { type Node } from "@xyflow/react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { X } from "lucide-react";
import { useDynamicNodes } from "./DynamicNodeContext";
import { BEHAVIOR_LABELS, BEHAVIOR_COLORS } from "./types";

interface Props {
  node: Node;
  onUpdate: (id: string, data: any) => void;
  onClose: () => void;
}

export function DynamicPropertiesPanel({ node, onUpdate, onClose }: Props) {
  const { getNodeType } = useDynamicNodes();
  const d = node.data as any;
  const nt = getNodeType(d.nodeTypeId);
  if (!nt) return null;

  const color = nt.color || BEHAVIOR_COLORS[nt.behaviorType];
  const fieldValues = d.fieldValues || {};

  const updateFieldValue = (fieldId: string, value: string) => {
    const newValues = { ...fieldValues, [fieldId]: value };
    onUpdate(node.id, { ...d, fieldValues: newValues });
  };

  const update = (patch: Record<string, any>) => onUpdate(node.id, { ...d, ...patch });

  return (
    <div className="w-[280px] shrink-0 overflow-y-auto h-full" style={{ background: "#141428", borderLeft: "1px solid #2d3a5a" }}>
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm" style={{ background: color }}>
              {nt.emoji}
            </div>
            <span className="text-sm font-semibold text-slate-200">{nt.name}</span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="text-[10px] text-slate-500 uppercase tracking-wider">{BEHAVIOR_LABELS[nt.behaviorType]}</div>

        {/* Title */}
        <div>
          <Label className="text-xs text-slate-400">Título</Label>
          <Input
            value={d.title || ""}
            onChange={e => update({ title: e.target.value })}
            placeholder={nt.name}
            className="mt-1 bg-[#1a1a3a] border-[#2d3a5a] text-slate-200 text-sm"
          />
        </div>

        {/* Dynamic fields from node type definition */}
        {nt.fields.sort((a, b) => a.order - b.order).map(field => (
          <div key={field.id}>
            <Label className="text-xs text-slate-400">
              {field.name}
              {field.required && <span className="text-red-400 ml-0.5">*</span>}
            </Label>

            {field.type === "text" && (
              <Input
                value={fieldValues[field.id] || field.defaultValue || ""}
                onChange={e => updateFieldValue(field.id, e.target.value)}
                placeholder={`Ex: ${field.name}`}
                className="mt-1 bg-[#1a1a3a] border-[#2d3a5a] text-slate-200 text-sm"
              />
            )}

            {field.type === "number" && (
              <Input
                type="number"
                value={fieldValues[field.id] || field.defaultValue || ""}
                onChange={e => updateFieldValue(field.id, e.target.value)}
                placeholder="0"
                className="mt-1 bg-[#1a1a3a] border-[#2d3a5a] text-slate-200 text-sm"
              />
            )}

            {field.type === "dropdown" && (
              <Select
                value={fieldValues[field.id] || field.defaultValue || ""}
                onValueChange={v => updateFieldValue(field.id, v)}
              >
                <SelectTrigger className="mt-1 bg-[#1a1a3a] border-[#2d3a5a] text-slate-200 text-sm">
                  <SelectValue placeholder={`Seleccionar ${field.name}`} />
                </SelectTrigger>
                <SelectContent>
                  {(field.options || []).map(opt => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {field.type === "toggle" && (
              <div className="mt-1 flex items-center gap-2">
                <Switch
                  checked={fieldValues[field.id] === "true" || fieldValues[field.id] === true}
                  onCheckedChange={v => updateFieldValue(field.id, String(v))}
                  className="data-[state=checked]:bg-violet-600"
                />
                <span className="text-xs text-slate-400">
                  {fieldValues[field.id] === "true" ? "Sim" : "Não"}
                </span>
              </div>
            )}

            {field.type === "date" && (
              <Input
                type="date"
                value={fieldValues[field.id] || field.defaultValue || ""}
                onChange={e => updateFieldValue(field.id, e.target.value)}
                className="mt-1 bg-[#1a1a3a] border-[#2d3a5a] text-slate-200 text-sm"
              />
            )}

            {field.type === "textarea" && (
              <Textarea
                value={fieldValues[field.id] || field.defaultValue || ""}
                onChange={e => updateFieldValue(field.id, e.target.value)}
                placeholder={`${field.name}...`}
                className="mt-1 bg-[#1a1a3a] border-[#2d3a5a] text-slate-200 text-sm min-h-[60px]"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
