import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { GripVertical, Briefcase, FileText, Receipt, FileSignature, Users } from "lucide-react";
import type { PipelineModule } from "@/hooks/usePipelineConfig";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, verticalListSortingStrategy, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { useState } from "react";

const ICON_MAP: Record<string, React.ElementType> = {
  Briefcase, FileText, Receipt, FileSignature, Users,
};

interface Props {
  modules: PipelineModule[];
  onToggle: (id: string) => void;
  onReorder: (modules: PipelineModule[]) => void;
  onUpdateLabel: (id: string, label: string, sublabel?: string) => void;
}

function SortableModuleRow({ module, onToggle, onUpdateLabel }: {
  module: PipelineModule;
  onToggle: (id: string) => void;
  onUpdateLabel: (id: string, label: string, sublabel?: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: module.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const Icon = ICON_MAP[module.icon] || Briefcase;
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(module.label);
  const [editSublabel, setEditSublabel] = useState(module.sublabel);

  const handleSave = () => {
    if (editLabel.trim()) {
      onUpdateLabel(module.id, editLabel.trim(), editSublabel.trim());
    }
    setEditing(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 p-2.5 rounded-lg border bg-background transition-all",
        isDragging && "opacity-50 ring-2 ring-primary/40",
        !module.enabled && "opacity-60"
      )}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: module.color + '20', color: module.color }}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex gap-2">
            <Input
              value={editLabel}
              onChange={e => setEditLabel(e.target.value)}
              className="h-7 text-sm"
              onBlur={handleSave}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              autoFocus
            />
            <Input
              value={editSublabel}
              onChange={e => setEditSublabel(e.target.value)}
              className="h-7 text-sm w-24"
              placeholder="Sublabel"
              onBlur={handleSave}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
          </div>
        ) : (
          <div className="flex items-center gap-2 cursor-pointer" onDoubleClick={() => setEditing(true)}>
            <span className="text-sm font-medium">{module.label}</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{module.sublabel}</Badge>
          </div>
        )}
      </div>
      <Switch checked={module.enabled} onCheckedChange={() => onToggle(module.id)} />
    </div>
  );
}

export function PipelineModuleToggle({ modules, onToggle, onReorder, onUpdateLabel }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = modules.findIndex(m => m.id === active.id);
    const newIndex = modules.findIndex(m => m.id === over.id);
    onReorder(arrayMove(modules, oldIndex, newIndex));
  };

  return (
    <div className="space-y-3">
      <div>
        <h4 className="font-medium text-sm">Módulos do Pipeline</h4>
        <p className="text-xs text-muted-foreground">
          Ative/desative módulos e reordene arrastando. Duplo-clique para renomear.
        </p>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={modules.map(m => m.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {modules.map(m => (
              <SortableModuleRow
                key={m.id}
                module={m}
                onToggle={onToggle}
                onUpdateLabel={onUpdateLabel}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
