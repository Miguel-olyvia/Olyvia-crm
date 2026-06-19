import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FileText, Trash2, Save, Plus } from "lucide-react";
import { useDynamicNodes } from "./DynamicNodeContext";
import type { FlowTemplate } from "./types";

interface Props {
  open: boolean;
  onClose: () => void;
  onLoadTemplate: (nodes: any[], edges: any[]) => void;
  currentNodes?: any[];
  currentEdges?: any[];
}

export function TemplatesModal({ open, onClose, onLoadTemplate, currentNodes, currentEdges }: Props) {
  const { templates, addTemplate, deleteTemplate } = useDynamicNodes();
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDesc, setSaveDesc] = useState("");

  const handleSave = () => {
    if (!saveName.trim() || !currentNodes) return;
    const t: FlowTemplate = {
      id: `tpl_${Date.now()}`,
      name: saveName.trim(),
      description: saveDesc.trim(),
      nodes: currentNodes,
      edges: currentEdges || [],
      createdAt: new Date().toISOString(),
    };
    addTemplate(t);
    setSaveName("");
    setSaveDesc("");
    setShowSave(false);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[500px] max-h-[80vh] overflow-y-auto bg-[#1e2a4a] border-[#2d3a5a] text-slate-200">
        <DialogHeader>
          <DialogTitle className="text-slate-200 flex items-center gap-2">
            <FileText className="w-4 h-4" /> Templates de Flow
          </DialogTitle>
        </DialogHeader>

        {/* Save current flow as template */}
        {currentNodes && (
          <div className="border-b border-[#2d3a5a] pb-3 mb-3">
            {showSave ? (
              <div className="space-y-2">
                <Input
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  placeholder="Nome do template"
                  className="bg-[#1a1a3a] border-[#2d3a5a] text-slate-200 text-sm"
                />
                <Input
                  value={saveDesc}
                  onChange={e => setSaveDesc(e.target.value)}
                  placeholder="Descrição (opcional)"
                  className="bg-[#1a1a3a] border-[#2d3a5a] text-slate-200 text-sm"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSave} disabled={!saveName.trim()} className="bg-violet-600 hover:bg-violet-700 text-white text-xs">
                    <Save className="w-3 h-3 mr-1" /> Guardar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowSave(false)} className="border-[#2d3a5a] text-slate-400 text-xs">
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setShowSave(true)} className="border-[#2d3a5a] text-slate-400 hover:text-slate-200 hover:bg-white/5 w-full text-xs">
                <Save className="w-3 h-3 mr-1" /> 💾 Guardar Flow Actual como Template
              </Button>
            )}
          </div>
        )}

        {/* Template list */}
        <div className="space-y-2">
          {templates.length === 0 && (
            <div className="text-center py-6 text-sm text-slate-500">Nenhum template disponível</div>
          )}
          {templates.map(t => (
            <div key={t.id} className="flex items-center gap-3 px-3 py-3 rounded-lg" style={{ background: "#1a1a3a", border: "1px solid #2d3a5a" }}>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-200">{t.name}</div>
                {t.description && <div className="text-[11px] text-slate-500">{t.description}</div>}
                <div className="text-[10px] text-slate-600 mt-0.5">
                  {t.nodes.length} nós · {t.edges.length} conexões
                  {t.isDefault && " · Factory"}
                </div>
              </div>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  onClick={() => { onLoadTemplate(t.nodes, t.edges); onClose(); }}
                  className="bg-violet-600 hover:bg-violet-700 text-white text-xs h-7"
                >
                  📋 Usar
                </Button>
                {!t.isDefault && (
                  <button onClick={() => deleteTemplate(t.id)} className="text-slate-400 hover:text-red-400 p-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
