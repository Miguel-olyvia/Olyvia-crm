import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Settings, Trash2, Copy, Pencil } from "lucide-react";
import { useDynamicNodes } from "./DynamicNodeContext";
import type { CustomNodeType } from "./types";
import { BEHAVIOR_LABELS, BEHAVIOR_COLORS } from "./types";

interface Props {
  open: boolean;
  onClose: () => void;
  onEdit: (nt: CustomNodeType) => void;
}

export function ManageNodeTypesModal({ open, onClose, onEdit }: Props) {
  const { categories, nodeTypes, deleteNodeType, duplicateNodeType } = useDynamicNodes();

  const sortedCats = [...categories].sort((a, b) => a.order - b.order);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[600px] max-h-[80vh] overflow-y-auto bg-[#1e2a4a] border-[#2d3a5a] text-slate-200">
        <DialogHeader>
          <DialogTitle className="text-slate-200 flex items-center gap-2">
            <Settings className="w-4 h-4" /> Gerir Tipos de Nó
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {sortedCats.map(cat => {
            const items = nodeTypes.filter(nt => nt.categoryId === cat.id);
            if (items.length === 0) return null;
            return (
              <div key={cat.id}>
                <div className="text-[11px] font-bold tracking-wider text-slate-500 mb-2">{cat.name}</div>
                <div className="space-y-1.5">
                  {items.map(item => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg"
                      style={{ background: "#1a1a3a", border: "1px solid #2d3a5a" }}
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm"
                        style={{ background: (item.color || BEHAVIOR_COLORS[item.behaviorType]) + "33" }}
                      >
                        {item.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-200 truncate">{item.name}</div>
                        <div className="text-[10px] text-slate-500">
                          {BEHAVIOR_LABELS[item.behaviorType]} · {item.fields.length} campos
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => onEdit(item)} className="text-slate-400 hover:text-slate-200 p-1">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => duplicateNodeType(item.id)} className="text-slate-400 hover:text-slate-200 p-1">
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => deleteNodeType(item.id)} className="text-slate-400 hover:text-red-400 p-1">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
