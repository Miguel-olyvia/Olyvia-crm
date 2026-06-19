import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Pencil, Trash2, GripVertical, Copy, AlertTriangle,
  ArrowRight, Zap, UserCheck, Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { WorkflowAutomationRules } from "@/components/workflows/WorkflowAutomationRules";
import { ProposalFlowchart } from "./ProposalFlowchart";
import { ProposalStageActionsConfig } from "./ProposalStageActionsConfig";

export interface ProposalWorkflowStage {
  id: string;
  organization_id: string | null;
  name: string;
  label: string;
  color: string;
  stage_order: number;
  is_final: boolean;
  is_won: boolean;
  is_lost: boolean;
  is_active: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  onStagesUpdated?: () => void;
}

const DEFAULT_COLORS = [
  "#3b82f6", "#eab308", "#22c55e", "#8b5cf6",
  "#ef4444", "#f97316", "#06b6d4", "#ec4899",
];

function SortableStageRow({
  stage, isTemplate, proposalCount, onEdit, onDelete, onDuplicate,
}: {
  stage: ProposalWorkflowStage; isTemplate: boolean; proposalCount: number;
  onEdit: (s: ProposalWorkflowStage) => void; onDelete: (s: ProposalWorkflowStage) => void;
  onDuplicate: (s: ProposalWorkflowStage) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stage.id, disabled: isTemplate,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <TableRow ref={setNodeRef} style={style} className={cn(isTemplate && "opacity-60", isDragging && "bg-accent/50 shadow-lg z-50 relative")}>
      <TableCell className="w-12">
        <div className="flex items-center gap-1">
          {!isTemplate && (
            <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-accent text-muted-foreground">
              <GripVertical className="w-4 h-4" />
            </button>
          )}
          <span className="font-mono text-sm text-muted-foreground">{stage.stage_order}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
          <span className="font-medium">{stage.label}</span>
          <span className="text-muted-foreground text-xs">({stage.name})</span>
          {isTemplate && <Badge variant="secondary" className="text-xs">Template</Badge>}
        </div>
      </TableCell>
      <TableCell><div className="w-8 h-6 rounded border" style={{ backgroundColor: stage.color }} /></TableCell>
      <TableCell>
        <div className="flex gap-1 flex-wrap">
          {stage.is_final && !stage.is_won && !stage.is_lost && <Badge variant="outline" className="text-xs">Final</Badge>}
          {stage.is_won && <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs gap-1"><UserCheck className="w-3 h-3" />Ganho</Badge>}
          {stage.is_lost && <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-xs">Perdido</Badge>}
        </div>
      </TableCell>
      <TableCell>
        {proposalCount > 0 && <Badge variant="secondary" className="text-xs gap-1"><Users className="w-3 h-3" />{proposalCount}</Badge>}
      </TableCell>
      <TableCell className="text-right">
        {!isTemplate && (
          <div className="flex justify-end gap-0.5">
            <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(stage)}><Pencil className="w-3.5 h-3.5" /></Button></TooltipTrigger><TooltipContent>Editar</TooltipContent></Tooltip></TooltipProvider>
            <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDuplicate(stage)}><Copy className="w-3.5 h-3.5" /></Button></TooltipTrigger><TooltipContent>Duplicar</TooltipContent></Tooltip></TooltipProvider>
            <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDelete(stage)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button></TooltipTrigger><TooltipContent>Eliminar</TooltipContent></Tooltip></TooltipProvider>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

export function ProposalWorkflowConfig({ open, onOpenChange, companyId, onStagesUpdated }: Props) {
  const { toast } = useToast();
  const [stages, setStages] = useState<ProposalWorkflowStage[]>([]);
  const [templateStages, setTemplateStages] = useState<ProposalWorkflowStage[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingStage, setEditingStage] = useState<ProposalWorkflowStage | null>(null);
  const [isUsingTemplate, setIsUsingTemplate] = useState(false);
  const [activeTab, setActiveTab] = useState("stages");
  const [deletingStage, setDeletingStage] = useState<ProposalWorkflowStage | null>(null);
  const [migrationTargetId, setMigrationTargetId] = useState("");
  const [proposalCountByStage, setProposalCountByStage] = useState<Record<string, number>>({});
  const [newStage, setNewStage] = useState({ name: "", label: "", color: "#3b82f6", is_final: false, is_won: false, is_lost: false });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));

  useEffect(() => { if (open && companyId) { loadStages(); loadTemplateStages(); loadProposalCounts(); } }, [open, companyId]);

  const loadStages = async () => {
    if (!companyId) return;
    setLoading(true);
    const { data, error } = await supabase.from("proposal_workflow_stages" as any).select("*").eq("organization_id", companyId).eq("is_active", true).order("stage_order");
    if (!error) { setStages((data || []) as any[]); setIsUsingTemplate(((data || []) as any[]).length === 0); }
    setLoading(false);
  };

  const loadTemplateStages = async () => {
    const { data } = await supabase.from("proposal_workflow_stages" as any).select("*").is("organization_id", null).eq("is_active", true).order("stage_order");
    setTemplateStages((data || []) as any[]);
  };

  const loadProposalCounts = async () => {
    if (!companyId) return;
    const { data } = await supabase.from("proposals").select("stage_id").eq("organization_id", companyId);
    if (data) {
      const counts: Record<string, number> = {};
      data.forEach((p: any) => { if (p.stage_id) counts[p.stage_id] = (counts[p.stage_id] || 0) + 1; });
      setProposalCountByStage(counts);
    }
  };

  const handleAddStage = async () => {
    if (!companyId || !newStage.name || !newStage.label) { toast({ title: "Preencha nome e label", variant: "destructive" }); return; }
    const nextOrder = stages.length > 0 ? Math.max(...stages.map(s => s.stage_order)) + 1 : 1;
    const { error } = await (supabase.from("proposal_workflow_stages" as any) as any).insert({
      organization_id: companyId,
      name: newStage.name.toLowerCase().replace(/\s+/g, '_'), label: newStage.label,
      color: newStage.color, stage_order: nextOrder,
      is_final: newStage.is_final, is_won: newStage.is_won, is_lost: newStage.is_lost,
    });
    if (error) { toast({ title: "Erro ao adicionar fase", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Fase adicionada" }); setNewStage({ name: "", label: "", color: "#3b82f6", is_final: false, is_won: false, is_lost: false }); setShowAddDialog(false); loadStages(); loadProposalCounts(); onStagesUpdated?.(); }
  };

  const handleUpdateStage = async () => {
    if (!editingStage) return;
    const { error } = await (supabase.from("proposal_workflow_stages" as any) as any).update({ label: editingStage.label, color: editingStage.color, is_final: editingStage.is_final, is_won: editingStage.is_won, is_lost: editingStage.is_lost }).eq("id", editingStage.id);
    if (error) { toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Fase atualizada" }); setEditingStage(null); loadStages(); onStagesUpdated?.(); }
  };

  const handleDeleteStage = async () => {
    if (!deletingStage) return;
    const count = proposalCountByStage[deletingStage.id] || 0;
    if (count > 0 && migrationTargetId) {
      const { error: migrateError } = await supabase.from("proposals").update({ stage_id: migrationTargetId } as any).eq("stage_id", deletingStage.id).eq("organization_id", companyId!);
      if (migrateError) { toast({ title: "Erro ao migrar propostas", description: migrateError.message, variant: "destructive" }); return; }
    }
    const { error } = await (supabase.from("proposal_workflow_stages" as any) as any).update({ is_active: false }).eq("id", deletingStage.id);
    if (error) { toast({ title: "Erro ao eliminar", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Fase removida" }); setDeletingStage(null); setMigrationTargetId(""); loadStages(); loadProposalCounts(); onStagesUpdated?.(); }
  };

  const handleDuplicateStage = async (stage: ProposalWorkflowStage) => {
    if (!companyId) return;
    const nextOrder = stages.length > 0 ? Math.max(...stages.map(s => s.stage_order)) + 1 : 1;
    const { error } = await (supabase.from("proposal_workflow_stages" as any) as any).insert({
      organization_id: companyId,
      name: stage.name + "_copy", label: stage.label + " (cópia)", color: stage.color,
      stage_order: nextOrder, is_final: stage.is_final, is_won: false, is_lost: false,
    });
    if (error) { toast({ title: "Erro ao duplicar", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Fase duplicada" }); loadStages(); onStagesUpdated?.(); }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = stages.findIndex(s => s.id === active.id);
    const newIndex = stages.findIndex(s => s.id === over.id);
    const reordered = arrayMove(stages, oldIndex, newIndex);
    setStages(reordered);
    for (let i = 0; i < reordered.length; i++) {
      await (supabase.from("proposal_workflow_stages" as any) as any).update({ stage_order: i + 1 }).eq("id", reordered[i].id);
    }
    onStagesUpdated?.();
  };

  const copyTemplateToCompany = async () => {
    if (!companyId || templateStages.length === 0) return;
    for (const stage of templateStages) {
      await (supabase.from("proposal_workflow_stages" as any) as any).insert({
        name: stage.name, label: stage.label, color: stage.color, stage_order: stage.stage_order,
        is_final: stage.is_final, is_won: stage.is_won, is_lost: stage.is_lost,
        organization_id: companyId,
      });
    }
    toast({ title: "Template copiado", description: "Pode agora personalizar as fases." });
    loadStages(); loadProposalCounts(); onStagesUpdated?.();
  };

  const displayStages = stages.length > 0 ? stages : templateStages;
  const deletableProposalCount = deletingStage ? (proposalCountByStage[deletingStage.id] || 0) : 0;
  const migrationTargets = stages.filter(s => s.id !== deletingStage?.id);
  const workflowStagesForRules = displayStages.map(s => ({ id: s.id, name: s.name, label: s.label, color: s.color, is_final: s.is_final, is_won: s.is_won, is_lost: s.is_lost }));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configuração de Workflow de Propostas</DialogTitle>
            <DialogDescription>
              Configure as fases do workflow de propostas e as automações associadas.
              {isUsingTemplate && templateStages.length > 0 && <span className="text-primary font-medium"> A usar template global.</span>}
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="stages">Fases</TabsTrigger>
              <TabsTrigger value="flow" className="gap-1.5"><ArrowRight className="w-3.5 h-3.5" />Fluxo</TabsTrigger>
              <TabsTrigger value="actions" className="gap-1.5"><Zap className="w-3.5 h-3.5" />Acções</TabsTrigger>
              <TabsTrigger value="automations" className="gap-1.5"><Zap className="w-3.5 h-3.5" />Automações</TabsTrigger>
            </TabsList>

            <TabsContent value="stages" className="space-y-4 mt-4">
              {isUsingTemplate && templateStages.length > 0 && (
                <Card className="border-primary/50 bg-primary/5">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">A usar Template Global</p>
                        <p className="text-sm text-muted-foreground">Copie para personalizar as fases.</p>
                      </div>
                      <Button onClick={copyTemplateToCompany}><Plus className="w-4 h-4 mr-2" />Personalizar</Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {displayStages.length === 0 && !loading ? (
                <Card className="border-dashed"><CardContent className="py-8 text-center"><p className="text-muted-foreground">Nenhuma fase de workflow configurada.</p></CardContent></Card>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Ordem</TableHead>
                        <TableHead>Fase</TableHead>
                        <TableHead className="w-16">Cor</TableHead>
                        <TableHead className="w-28">Tipo</TableHead>
                        <TableHead className="w-24">Propostas</TableHead>
                        <TableHead className="text-right w-28">Acções</TableHead>
                      </TableRow>
                    </TableHeader>
                    <SortableContext items={displayStages.map(s => s.id)} strategy={verticalListSortingStrategy}>
                      <TableBody>
                        {displayStages.map(stage => (
                          <SortableStageRow key={stage.id} stage={stage} isTemplate={isUsingTemplate}
                            proposalCount={proposalCountByStage[stage.id] || 0} onEdit={setEditingStage}
                            onDelete={(s) => { setDeletingStage(s); setMigrationTargetId(""); }}
                            onDuplicate={handleDuplicateStage} />
                        ))}
                      </TableBody>
                    </SortableContext>
                  </Table>
                </DndContext>
              )}

              {!isUsingTemplate && displayStages.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                  <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                  <span>Fluxo: {displayStages.sort((a, b) => a.stage_order - b.stage_order).map((s, i) => (
                    <span key={s.id}><span className="font-medium" style={{ color: s.color }}>{s.label}</span>{i < displayStages.length - 1 && " → "}</span>
                  ))}</span>
                </div>
              )}

              {!isUsingTemplate && <Button onClick={() => setShowAddDialog(true)} className="mt-2"><Plus className="w-4 h-4 mr-2" />Adicionar Fase</Button>}
            </TabsContent>

            <TabsContent value="flow" className="mt-4"><ProposalFlowchart stages={displayStages} companyId={companyId} /></TabsContent>
            <TabsContent value="actions" className="mt-4"><ProposalStageActionsConfig stages={displayStages} companyId={companyId} /></TabsContent>
            <TabsContent value="automations" className="mt-4">
              <WorkflowAutomationRules companyId={companyId || undefined} sourceEntity="proposal" workflowStages={workflowStagesForRules} />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Add Stage Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar Fase</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nome (key)</Label><Input placeholder="ex: in_review" value={newStage.name} onChange={e => setNewStage({ ...newStage, name: e.target.value })} /></div>
            <div><Label>Label</Label><Input placeholder="ex: Em Revisão" value={newStage.label} onChange={e => setNewStage({ ...newStage, label: e.target.value })} /></div>
            <div>
              <Label>Cor</Label>
              <div className="flex gap-2 mt-2">
                {DEFAULT_COLORS.map(color => (
                  <button key={color} className={`w-8 h-8 rounded-full border-2 transition-all ${newStage.color === color ? 'border-foreground scale-110' : 'border-transparent'}`} style={{ backgroundColor: color }} onClick={() => setNewStage({ ...newStage, color })} />
                ))}
                <Input type="color" value={newStage.color} onChange={e => setNewStage({ ...newStage, color: e.target.value })} className="w-8 h-8 p-0 border-0" />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2"><Switch checked={newStage.is_final} onCheckedChange={v => setNewStage({ ...newStage, is_final: v })} /><Label>Final</Label></div>
              <div className="flex items-center gap-2"><Switch checked={newStage.is_won} onCheckedChange={v => setNewStage({ ...newStage, is_won: v, is_lost: v ? false : newStage.is_lost })} /><Label>Ganho</Label></div>
              <div className="flex items-center gap-2"><Switch checked={newStage.is_lost} onCheckedChange={v => setNewStage({ ...newStage, is_lost: v, is_won: v ? false : newStage.is_won })} /><Label>Perdido</Label></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancelar</Button>
            <Button onClick={handleAddStage}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Stage Dialog */}
      <Dialog open={!!editingStage} onOpenChange={() => setEditingStage(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Fase</DialogTitle></DialogHeader>
          {editingStage && (
            <div className="space-y-4">
              <div><Label>Nome (key)</Label><Input value={editingStage.name} disabled className="bg-muted" /></div>
              <div><Label>Label</Label><Input value={editingStage.label} onChange={e => setEditingStage({ ...editingStage, label: e.target.value })} /></div>
              <div>
                <Label>Cor</Label>
                <div className="flex gap-2 mt-2">
                  {DEFAULT_COLORS.map(color => (
                    <button key={color} className={`w-8 h-8 rounded-full border-2 transition-all ${editingStage.color === color ? 'border-foreground scale-110' : 'border-transparent'}`} style={{ backgroundColor: color }} onClick={() => setEditingStage({ ...editingStage, color })} />
                  ))}
                  <Input type="color" value={editingStage.color} onChange={e => setEditingStage({ ...editingStage, color: e.target.value })} className="w-8 h-8 p-0 border-0" />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2"><Switch checked={editingStage.is_final} onCheckedChange={v => setEditingStage({ ...editingStage, is_final: v })} /><Label>Final</Label></div>
                <div className="flex items-center gap-2"><Switch checked={editingStage.is_won} onCheckedChange={v => setEditingStage({ ...editingStage, is_won: v, is_lost: v ? false : editingStage.is_lost })} /><Label>Ganho</Label></div>
                <div className="flex items-center gap-2"><Switch checked={editingStage.is_lost} onCheckedChange={v => setEditingStage({ ...editingStage, is_lost: v, is_won: v ? false : editingStage.is_won })} /><Label>Perdido</Label></div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingStage(null)}>Cancelar</Button>
            <Button onClick={handleUpdateStage}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete with Migration Dialog */}
      <AlertDialog open={!!deletingStage} onOpenChange={(v) => { if (!v) { setDeletingStage(null); setMigrationTargetId(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Eliminar Fase "{deletingStage?.label}"
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {deletableProposalCount > 0 ? (
                  <>
                    <p>Esta fase contém <strong>{deletableProposalCount} proposta{deletableProposalCount > 1 ? 's' : ''}</strong>. Seleccione a fase de destino para migrar as propostas antes de eliminar.</p>
                    <div className="space-y-2">
                      <Label>Migrar propostas para:</Label>
                      <Select value={migrationTargetId} onValueChange={setMigrationTargetId}>
                        <SelectTrigger><SelectValue placeholder="Selecionar fase..." /></SelectTrigger>
                        <SelectContent>
                          {migrationTargets.map(s => (
                            <SelectItem key={s.id} value={s.id}>
                              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />{s.label}</div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : (
                  <p>Tem a certeza que deseja eliminar esta fase? Esta ação não pode ser desfeita.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteStage} disabled={deletableProposalCount > 0 && !migrationTargetId} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
