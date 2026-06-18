import { useState, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, GripVertical, Eye } from "lucide-react";
import type { CustomNodeType, CustomField, CustomFieldType, NodeBehaviorType, NodeCategory } from "./types";
import { BEHAVIOR_LABELS, BEHAVIOR_COLORS } from "./types";
import { useDynamicNodes } from "./DynamicNodeContext";

const COMMON_EMOJIS = ["⚡", "📧", "🔔", "📄", "🔀", "⏱️", "📊", "✅", "🛑", "📅", "💬", "🌐", "📱", "💰", "🎯", "🔧", "📝", "👤", "🏷️", "📦", "🔗", "⚙️", "🚀", "💡", "🔒", "📣", "🤖", "📈", "🗂️", "✉️"];

const FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Texto",
  number: "Número",
  dropdown: "Dropdown",
  toggle: "Toggle (Sim/Não)",
  date: "Data",
  textarea: "Textarea",
};

interface Props {
  open: boolean;
  onClose: () => void;
  editingNodeType?: CustomNodeType | null;
}

export function CreateNodeTypeModal({ open, onClose, editingNodeType }: Props) {
  const { categories, addCategory, addNodeType, updateNodeType } = useDynamicNodes();

  const empty: CustomNodeType = {
    id: `nt_${Date.now()}`,
    name: "",
    emoji: "⚡",
    color: "#7c3aed",
    categoryId: categories[0]?.id || "",
    behaviorType: "action",
    fields: [],
  };

  const [nt, setNt] = useState<CustomNodeType>(editingNodeType || empty);
  const [newCatName, setNewCatName] = useState("");
  const [showNewCat, setShowNewCat] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Reset when opening
  const resetAndClose = () => {
    setNt(empty);
    setShowNewCat(false);
    setNewCatName("");
    onClose();
  };

  // When editingNodeType changes
  useEffect(() => {
    if (editingNodeType) setNt({ ...editingNodeType });
    else setNt(empty);
  }, [editingNodeType]);

  const addField = () => {
    const f: CustomField = {
      id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: "",
      type: "text",
      required: false,
      order: nt.fields.length,
    };
    setNt(p => ({ ...p, fields: [...p.fields, f] }));
  };

  const updateField = (id: string, patch: Partial<CustomField>) => {
    setNt(p => ({ ...p, fields: p.fields.map(f => f.id === id ? { ...f, ...patch } : f) }));
  };

  const removeField = (id: string) => {
    setNt(p => ({ ...p, fields: p.fields.filter(f => f.id !== id).map((f, i) => ({ ...f, order: i })) }));
  };

  const moveField = (id: string, dir: -1 | 1) => {
    setNt(p => {
      const fields = [...p.fields];
      const idx = fields.findIndex(f => f.id === id);
      if (idx < 0) return p;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= fields.length) return p;
      [fields[idx], fields[newIdx]] = [fields[newIdx], fields[idx]];
      return { ...p, fields: fields.map((f, i) => ({ ...f, order: i })) };
    });
  };

  const handleSave = () => {
    if (!nt.name.trim()) return;
    if (editingNodeType) {
      updateNodeType(editingNodeType.id, nt);
    } else {
      addNodeType({ ...nt, id: `nt_${Date.now()}` });
    }
    resetAndClose();
  };

  const handleAddCategory = () => {
    if (!newCatName.trim()) return;
    const cat: NodeCategory = {
      id: `cat_${Date.now()}`,
      name: newCatName.trim(),
      order: categories.length,
    };
    addCategory(cat);
    setNt(p => ({ ...p, categoryId: cat.id }));
    setNewCatName("");
    setShowNewCat(false);
  };

  const previewColor = nt.color || BEHAVIOR_COLORS[nt.behaviorType];

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) resetAndClose(); }}>
      <DialogContent className="max-w-[700px] max-h-[90vh] overflow-y-auto bg-[#1e2a4a] border-[#2d3a5a] text-slate-200">
        <DialogHeader>
          <DialogTitle className="text-slate-200">
            {editingNodeType ? "Editar Tipo de Nó" : "Criar Tipo de Nó"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-[1fr_200px] gap-6">
          {/* Left: Form */}
          <div className="space-y-4">
            {/* Emoji + Name */}
            <div className="flex gap-3">
              <div className="relative">
                <Label className="text-xs text-slate-400">Ícone</Label>
                <button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="mt-1 w-12 h-10 rounded-lg flex items-center justify-center text-xl border border-[#2d3a5a] bg-[#1a1a3a] hover:bg-[#2d3a5a] transition-colors"
                >
                  {nt.emoji}
                </button>
                {showEmojiPicker && (
                  <div className="absolute z-50 top-full mt-1 bg-[#1a1a3a] border border-[#2d3a5a] rounded-lg p-2 grid grid-cols-6 gap-1 w-[200px] shadow-xl">
                    {COMMON_EMOJIS.map(e => (
                      <button
                        key={e}
                        onClick={() => { setNt(p => ({ ...p, emoji: e })); setShowEmojiPicker(false); }}
                        className="w-8 h-8 flex items-center justify-center text-lg rounded hover:bg-white/10 transition-colors"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-1">
                <Label className="text-xs text-slate-400">Nome</Label>
                <Input
                  value={nt.name}
                  onChange={e => setNt(p => ({ ...p, name: e.target.value }))}
                  placeholder="Ex: Verificar Agenda"
                  className="mt-1 bg-[#1a1a3a] border-[#2d3a5a] text-slate-200 text-sm"
                />
              </div>
            </div>

            {/* Color */}
            <div>
              <Label className="text-xs text-slate-400">Cor do Header</Label>
              <div className="flex gap-2 mt-1 items-center">
                <input
                  type="color"
                  value={nt.color}
                  onChange={e => setNt(p => ({ ...p, color: e.target.value }))}
                  className="w-8 h-8 rounded cursor-pointer border-0"
                />
                <Input
                  value={nt.color}
                  onChange={e => setNt(p => ({ ...p, color: e.target.value }))}
                  className="bg-[#1a1a3a] border-[#2d3a5a] text-slate-200 text-sm flex-1"
                />
              </div>
            </div>

            {/* Category */}
            <div>
              <Label className="text-xs text-slate-400">Categoria</Label>
              <div className="flex gap-2 mt-1">
                <Select value={nt.categoryId} onValueChange={v => setNt(p => ({ ...p, categoryId: v }))}>
                  <SelectTrigger className="bg-[#1a1a3a] border-[#2d3a5a] text-slate-200 text-sm flex-1">
                    <SelectValue placeholder="Seleccionar categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => setShowNewCat(!showNewCat)} className="border-[#2d3a5a] text-slate-400 hover:text-slate-200 hover:bg-white/5 shrink-0">
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
              {showNewCat && (
                <div className="flex gap-2 mt-2">
                  <Input
                    value={newCatName}
                    onChange={e => setNewCatName(e.target.value)}
                    placeholder="Ex: 📅 Agenda"
                    className="bg-[#1a1a3a] border-[#2d3a5a] text-slate-200 text-sm flex-1"
                    onKeyDown={e => { if (e.key === "Enter") handleAddCategory(); }}
                  />
                  <Button size="sm" onClick={handleAddCategory} className="bg-violet-600 hover:bg-violet-700 text-white">Criar</Button>
                </div>
              )}
            </div>

            {/* Behavior Type */}
            <div>
              <Label className="text-xs text-slate-400">Tipo de Nó</Label>
              <Select value={nt.behaviorType} onValueChange={(v: NodeBehaviorType) => setNt(p => ({ ...p, behaviorType: v }))}>
                <SelectTrigger className="mt-1 bg-[#1a1a3a] border-[#2d3a5a] text-slate-200 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(BEHAVIOR_LABELS) as [NodeBehaviorType, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div>
              <Label className="text-xs text-slate-400">Descrição (opcional)</Label>
              <Input
                value={nt.description || ""}
                onChange={e => setNt(p => ({ ...p, description: e.target.value }))}
                placeholder="Breve descrição..."
                className="mt-1 bg-[#1a1a3a] border-[#2d3a5a] text-slate-200 text-sm"
              />
            </div>

            {/* Fields */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs text-slate-400">Campos Personalizados</Label>
                <Button variant="outline" size="sm" onClick={addField} className="border-[#2d3a5a] text-slate-400 hover:text-slate-200 hover:bg-white/5 text-xs h-7">
                  <Plus className="w-3 h-3 mr-1" /> Adicionar Campo
                </Button>
              </div>

              <div className="space-y-2">
                {nt.fields.sort((a, b) => a.order - b.order).map((field, idx) => (
                  <div key={field.id} className="rounded-lg p-3 space-y-2" style={{ background: "#141428", border: "1px solid #2d3a5a" }}>
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col gap-0.5">
                        <button
                          onClick={() => moveField(field.id, -1)}
                          disabled={idx === 0}
                          className="text-slate-500 hover:text-slate-300 disabled:opacity-30 text-[10px]"
                        >▲</button>
                        <button
                          onClick={() => moveField(field.id, 1)}
                          disabled={idx === nt.fields.length - 1}
                          className="text-slate-500 hover:text-slate-300 disabled:opacity-30 text-[10px]"
                        >▼</button>
                      </div>
                      <Input
                        value={field.name}
                        onChange={e => updateField(field.id, { name: e.target.value })}
                        placeholder="Nome do campo"
                        className="bg-[#1a1a3a] border-[#2d3a5a] text-slate-200 text-sm flex-1 h-8"
                      />
                      <Select value={field.type} onValueChange={(v: CustomFieldType) => updateField(field.id, { type: v })}>
                        <SelectTrigger className="bg-[#1a1a3a] border-[#2d3a5a] text-slate-200 text-xs w-[130px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.entries(FIELD_TYPE_LABELS) as [CustomFieldType, string][]).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <button onClick={() => removeField(field.id)} className="text-slate-500 hover:text-red-400 shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {field.type === "dropdown" && (
                      <Input
                        value={(field.options || []).join(", ")}
                        onChange={e => updateField(field.id, { options: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                        placeholder="Opções separadas por vírgula"
                        className="bg-[#1a1a3a] border-[#2d3a5a] text-slate-200 text-xs h-7"
                      />
                    )}

                    <div className="flex items-center gap-4 text-xs">
                      <label className="flex items-center gap-1.5 text-slate-400 cursor-pointer">
                        <Switch
                          checked={field.required}
                          onCheckedChange={v => updateField(field.id, { required: v })}
                          className="h-4 w-7 data-[state=checked]:bg-violet-600"
                        />
                        Obrigatório
                      </label>
                      <Input
                        value={field.defaultValue || ""}
                        onChange={e => updateField(field.id, { defaultValue: e.target.value })}
                        placeholder="Valor default"
                        className="bg-[#1a1a3a] border-[#2d3a5a] text-slate-200 text-xs h-7 flex-1"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Live Preview */}
          <div>
            <div className="flex items-center gap-1.5 mb-2 text-xs text-slate-400">
              <Eye className="w-3.5 h-3.5" /> Preview
            </div>
            <div className="rounded-lg overflow-hidden" style={{ background: "#1e2a4a", border: "2px solid #2d3a5a", minWidth: 180, maxWidth: 200 }}>
              {/* Header */}
              <div className="px-3 py-1.5 flex items-center gap-2" style={{ background: previewColor }}>
                <span className="text-sm">{nt.emoji}</span>
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-white/70">
                    {BEHAVIOR_LABELS[nt.behaviorType]}
                  </div>
                  <div className="text-xs font-semibold text-white truncate">{nt.name || "Nome..."}</div>
                </div>
              </div>
              {/* Body */}
              <div className="px-3 py-2 space-y-1.5">
                {nt.fields.length === 0 && (
                  <div className="text-[10px] text-slate-500">Sem campos</div>
                )}
                {nt.fields.sort((a, b) => a.order - b.order).slice(0, 4).map(f => (
                  <div key={f.id} className="text-[10px]">
                    <span className="text-slate-500">{f.name || "Campo"}:</span>{" "}
                    <span className="text-slate-300">{f.defaultValue || "—"}</span>
                  </div>
                ))}
                {nt.fields.length > 4 && (
                  <div className="text-[9px] text-slate-600">+{nt.fields.length - 4} campos</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-[#2d3a5a]">
          <Button variant="outline" onClick={resetAndClose} className="border-[#2d3a5a] text-slate-400 hover:text-slate-200 hover:bg-white/5">
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!nt.name.trim()} className="bg-violet-600 hover:bg-violet-700 text-white">
            {editingNodeType ? "Guardar Alterações" : "Criar Tipo de Nó"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
