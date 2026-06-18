import { type DragEvent, useState, useRef } from "react";
import { Plus, Settings, Upload, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDynamicNodes } from "./DynamicNodeContext";
import { CreateNodeTypeModal } from "./CreateNodeTypeModal";
import { ManageNodeTypesModal } from "./ManageNodeTypesModal";
import { TemplatesModal } from "./TemplatesModal";
import { BpmnPalette } from "./BpmnPalette";
import type { CustomNodeType } from "./types";
import { BEHAVIOR_COLORS } from "./types";
import { parseImportedFlowJson } from "./flowImportExport";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface DynamicPaletteProps {
  onLoadTemplate: (nodes: any[], edges: any[]) => void;
  onImportFlow?: (nodes: any[], edges: any[], name?: string) => void;
  currentNodes?: any[];
  currentEdges?: any[];
  flowName?: string;
}

export function DynamicPalette({ onLoadTemplate, onImportFlow, currentNodes, currentEdges, flowName }: DynamicPaletteProps) {
  const { categories, nodeTypes, deleteNodeType, duplicateNodeType, exportAll, importAll } = useDynamicNodes();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingNt, setEditingNt] = useState<CustomNodeType | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onDragStart = (e: DragEvent, nodeTypeId: string) => {
    e.dataTransfer.setData("application/dynamicNodeType", nodeTypeId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleExport = () => {
    const baseConfig = JSON.parse(exportAll());
    const payload = currentNodes
      ? {
          ...baseConfig,
          type: "flow-builder-bundle",
          version: 1,
          exportedAt: new Date().toISOString(),
          flow: {
            name: flowName || "Flow",
            nodes: currentNodes,
            edges: currentEdges || [],
          },
        }
      : baseConfig;
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "flow-builder-config.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(currentNodes ? "Flow exportado!" : "Configuração exportada!");
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      const importedFlow = parseImportedFlowJson(content);

      if (importedFlow) {
        onImportFlow?.(importedFlow.nodes, importedFlow.edges, importedFlow.name);
        toast.success(`Flow importado${importedFlow.name ? `: ${importedFlow.name}` : ""}!`);
        return;
      }

      const result = importAll(content);
      if (result.ok) {
        const parts = [
          result.imported.categories > 0 ? `${result.imported.categories} categorias` : null,
          result.imported.nodeTypes > 0 ? `${result.imported.nodeTypes} tipos de nó` : null,
          result.imported.templates > 0 ? `${result.imported.templates} templates` : null,
        ].filter(Boolean);

        toast.success(parts.length > 0 ? `Configuração importada: ${parts.join(", ")}` : "Configuração importada!");
      } else {
        toast.error(result.reason || "Ficheiro inválido");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Sort categories by order, filter those with node types
  const sortedCats = [...categories].sort((a, b) => a.order - b.order);
  const catsWithNodes = sortedCats.filter(cat => nodeTypes.some(nt => nt.categoryId === cat.id));

  return (
    <div className="w-[230px] shrink-0 overflow-y-auto h-full" style={{ background: "#141428", borderRight: "1px solid #2d3a5a" }}>
      <div className="p-3 space-y-3">
        {/* Top buttons */}
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            onClick={() => { setEditingNt(null); setCreateOpen(true); }}
            className="bg-violet-600 hover:bg-violet-700 text-white text-xs flex-1 h-8"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Criar Tipo de Nó
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setManageOpen(true)}
            className="border-[#2d3a5a] text-slate-400 hover:text-slate-200 hover:bg-white/5 h-8 w-8 p-0"
            title="Gerir Nós"
          >
            <Settings className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Templates + Import/Export */}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTemplatesOpen(true)}
            className="border-[#2d3a5a] text-slate-400 hover:text-slate-200 hover:bg-white/5 text-[10px] h-7 flex-1"
          >
            <FileText className="w-3 h-3 mr-1" /> Templates
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="border-[#2d3a5a] text-slate-400 hover:text-slate-200 hover:bg-white/5 h-7 w-7 p-0"
            title="Exportar JSON"
          >
            <Download className="w-3 h-3" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="border-[#2d3a5a] text-slate-400 hover:text-slate-200 hover:bg-white/5 h-7 w-7 p-0"
            title="Importar JSON"
          >
            <Upload className="w-3 h-3" />
          </Button>
          <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
        </div>

        {/* Dynamic Categories */}
        {catsWithNodes.map(cat => {
          const items = nodeTypes.filter(nt => nt.categoryId === cat.id);
          return (
            <div key={cat.id}>
              <div className="flex items-center gap-1.5 mb-2 text-[11px] font-bold tracking-wider text-slate-500">
                {cat.name}
              </div>
              <div className="space-y-1.5">
                {items.map(item => (
                  <ContextMenu key={item.id}>
                    <ContextMenuTrigger>
                      <div
                        draggable
                        onDragStart={e => onDragStart(e, item.id)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-grab active:cursor-grabbing transition-colors hover:bg-white/5"
                        style={{ background: "#1a1a3a", border: "1px solid #2d3a5a" }}
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm"
                          style={{ background: (item.color || BEHAVIOR_COLORS[item.behaviorType]) + "33" }}
                        >
                          {item.emoji}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-200 truncate">{item.name}</div>
                          {item.description && (
                            <div className="text-[10px] text-slate-500 truncate">{item.description}</div>
                          )}
                        </div>
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="bg-[#1a1a3a] border-[#2d3a5a] text-slate-200">
                      <ContextMenuItem
                        onClick={() => { setEditingNt(item); setCreateOpen(true); }}
                        className="hover:!bg-white/10"
                      >
                        <Settings className="w-3.5 h-3.5 mr-2" /> Editar
                      </ContextMenuItem>
                      <ContextMenuItem
                        onClick={() => duplicateNodeType(item.id)}
                        className="hover:!bg-white/10"
                      >
                        <Plus className="w-3.5 h-3.5 mr-2" /> Duplicar
                      </ContextMenuItem>
                      <ContextMenuSeparator className="bg-[#2d3a5a]" />
                      <ContextMenuItem
                        onClick={() => setDeleteConfirm(item.id)}
                        className="hover:!bg-white/10 text-red-400"
                      >
                        <Settings className="w-3.5 h-3.5 mr-2" /> Eliminar
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                ))}
              </div>
            </div>
          );
        })}

        {/* BPMN Shapes */}
        <div className="border-t border-[#2d3a5a] pt-3">
          <BpmnPalette />
        </div>
      </div>

      {/* Modals */}
      <CreateNodeTypeModal
        open={createOpen}
        onClose={() => { setCreateOpen(false); setEditingNt(null); }}
        editingNodeType={editingNt}
      />
      <ManageNodeTypesModal open={manageOpen} onClose={() => setManageOpen(false)} onEdit={(nt) => { setManageOpen(false); setEditingNt(nt); setCreateOpen(true); }} />
      <TemplatesModal open={templatesOpen} onClose={() => setTemplatesOpen(false)} onLoadTemplate={onLoadTemplate} />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="bg-[#1e2a4a] border-[#2d3a5a] text-slate-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-200">Eliminar tipo de nó</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Tem certeza? Nós já colocados no canvas não são afectados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-[#141428] border-[#2d3a5a] text-slate-300 hover:bg-[#2d3a5a]">Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={() => { if (deleteConfirm) deleteNodeType(deleteConfirm); setDeleteConfirm(null); }}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
