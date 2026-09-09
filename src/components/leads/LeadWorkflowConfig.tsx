import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Pencil, Trash2, GripVertical, Copy, AlertTriangle,
  ArrowRight, ArrowUp, ArrowDown, UserCheck, Users, Zap, HelpCircle,
  Target, GitBranch, Settings, TrendingUp, CheckCircle2,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { WorkflowAutomationRules } from "@/components/workflows/WorkflowAutomationRules";
import { WorkflowFlowchart } from "./WorkflowFlowchart";
import { LeadStageActionsConfig } from "./LeadStageActionsConfig";
import { StageRulesEditor } from "./workflow/StageRulesEditor";
import { QualificationRulesTab } from "./workflow/QualificationRulesTab";
import { DryRunPanel, type DryRunStagePayload } from "./workflow/DryRunPanel";
import { StageRulesSimulator } from "./workflow/StageRulesSimulator";
import type { RuleGroup } from "./workflow/conditionCatalog";
import { isEmptyRule } from "./workflow/conditionCatalog";
import { useLeadPipelineRules } from "@/hooks/useLeadPipelineRules";
import { LEAD_FUNNEL_PRESETS, findPresetStageRule, type FunnelPreset } from "./leadFunnelPresets";
import { captureFlowError } from "@/lib/observability/captureFlowError";

export interface WorkflowStage {
  id: string;
  organization_id: string | null;
  name: string;
  label: string;
  color: string;
  stage_order: number;
  is_final: boolean;
  is_conversion: boolean;
  is_rejection: boolean;
  is_active: boolean;
  created_at: string;
  created_by: string;
  default_status: string | null;
  matching_statuses?: string[] | null;
  reached_when?: RuleGroup | null;
  auto_advance?: boolean;
  qualification_hint?: "none" | "mql" | "sql";
  counts_as_qualified?: boolean;
  counts_as_negotiation?: boolean;
  counts_as_converted?: boolean;
  counts_as_lost?: boolean;
}

export const LEAD_STATUS_OPTIONS = [
  { value: "new", label: "Nova" },
  { value: "contacted", label: "Contactada" },
  { value: "no_answer", label: "Sem Resposta" },
  { value: "callback_scheduled", label: "Callback Agendado" },
  { value: "visit_scheduled", label: "Visita Agendada" },
  { value: "qualified", label: "Qualificada" },
  { value: "converted", label: "Convertida" },
  { value: "rejected", label: "Rejeitada" },
  { value: "lost", label: "Perdida" },
  { value: "incomplete", label: "Incompleta" },
];

interface LeadWorkflowConfigProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  onStagesUpdated?: () => void;
}

const DEFAULT_COLORS = [
  "#3b82f6", "#eab308", "#22c55e", "#8b5cf6",
  "#ef4444", "#f97316", "#06b6d4", "#ec4899",
];

// ─── Sortable Row ───────────────────────────────────────────
function SortableStageRow({
  stage,
  isTemplate,
  leadCount,
  isFirst,
  isLast,
  onEdit,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
}: {
  stage: WorkflowStage;
  isTemplate: boolean;
  leadCount: number;
  isFirst: boolean;
  isLast: boolean;
  onEdit: (s: WorkflowStage) => void;
  onDelete: (s: WorkflowStage) => void;
  onDuplicate: (s: WorkflowStage) => void;
  onMoveUp: (s: WorkflowStage) => void;
  onMoveDown: (s: WorkflowStage) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id, disabled: isTemplate });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn(
        isTemplate && "opacity-60",
        isDragging && "bg-accent/50 shadow-lg z-50 relative"
      )}
    >
      <TableCell className="w-12">
        <div className="flex items-center gap-1">
          {!isTemplate && (
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-accent text-muted-foreground"
            >
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
          {stage.default_status && (
            <Badge variant="outline" className="text-xs">
              → {LEAD_STATUS_OPTIONS.find(o => o.value === stage.default_status)?.label || stage.default_status}
            </Badge>
          )}
        </div>
      </TableCell>

      <TableCell>
        <div className="w-8 h-6 rounded border" style={{ backgroundColor: stage.color }} />
      </TableCell>

      <TableCell>
        <div className="flex gap-1 flex-wrap">
          {stage.is_final && !stage.is_conversion && !stage.is_rejection && (
            <Badge variant="outline" className="text-xs">Final</Badge>
          )}
          {stage.is_conversion && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs gap-1">
                    <UserCheck className="w-3 h-3" />
                    Win
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Conversão: Lead → Cliente</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {stage.is_rejection && (
            <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-xs">
              Lost
            </Badge>
          )}
        </div>
      </TableCell>

      <TableCell>
        {leadCount > 0 && (
          <Badge variant="secondary" className="text-xs gap-1">
            <Users className="w-3 h-3" />
            {leadCount}
          </Badge>
        )}
      </TableCell>

      <TableCell className="text-right">
        {!isTemplate && (
          <div className="flex justify-end gap-0.5">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onMoveUp(stage)}
                    disabled={isFirst}
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Mover para cima</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onMoveDown(stage)}
                    disabled={isLast}
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Mover para baixo</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(stage)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Editar</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDuplicate(stage)}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Duplicar</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDelete(stage)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Eliminar</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

// ─── Main Component ─────────────────────────────────────────
export function LeadWorkflowConfig({ open, onOpenChange, companyId, onStagesUpdated }: LeadWorkflowConfigProps) {
  const { toast } = useToast();
  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [templateStages, setTemplateStages] = useState<WorkflowStage[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingStage, setEditingStage] = useState<WorkflowStage | null>(null);
  const [isUsingTemplate, setIsUsingTemplate] = useState(false);
  const [activeTab, setActiveTab] = useState("stages");
  const [editStageTab, setEditStageTab] = useState("general");
  const [showHelp, setShowHelp] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [showRecomputeConfirm, setShowRecomputeConfirm] = useState(false);
  const [unresolvedLeads, setUnresolvedLeads] = useState<{
    count: number;
    leads: Array<{ id: string; name: string }>;
  } | null>(null);

  const [deletingStage, setDeletingStage] = useState<WorkflowStage | null>(null);
  const [migrationTargetId, setMigrationTargetId] = useState<string>("");
  const [leadCountByStage, setLeadCountByStage] = useState<Record<string, number>>({});

  // Sector presets ("Presets de setor", Regras tab) — pendingPreset holds a
  // preset the user picked while at least one existing stage already has
  // non-default rules, so we can confirm before overwriting them.
  const [pendingPreset, setPendingPreset] = useState<FunnelPreset | null>(null);

  const [newStage, setNewStage] = useState({
    name: "",
    label: "",
    color: "#3b82f6",
    is_final: false,
    is_conversion: false,
    is_rejection: false,
    default_status: "" as string,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  // Org-scoped lead_workflow_stages + lead_qualification_rules fetch is
  // shared (react-query cached + cache-busted) via useLeadPipelineRules, so
  // a save from QualificationRulesTab (or anywhere else using this hook)
  // immediately refetches the stages shown here, and vice-versa.
  const {
    stages: pipelineStages,
    isLoading: stagesLoading,
    invalidate: invalidatePipelineRules,
  } = useLeadPipelineRules(companyId);

  useEffect(() => {
    if (!open) return;
    setStages(pipelineStages);
    setIsUsingTemplate(pipelineStages.length === 0);
  }, [open, pipelineStages]);

  useEffect(() => {
    setLoading(stagesLoading);
  }, [stagesLoading]);

  useEffect(() => {
    if (open && companyId) {
      invalidatePipelineRules();
      loadTemplateStages();
      loadLeadCounts();
    }
  }, [open, companyId]);

  // Kept as a thin wrapper (instead of inlining invalidatePipelineRules at
  // every call site) so existing call sites below don't need to change.
  const loadStages = async () => {
    if (!companyId) return;
    await invalidatePipelineRules();
  };

  const loadTemplateStages = async () => {
    const { data } = await (supabase
      .from("lead_workflow_stages") as any)
      .select("*")
      .is("organization_id", null)
      .eq("is_active", true)
      .order("stage_order");
    setTemplateStages(data || []);
  };

  const loadLeadCounts = async () => {
    if (!companyId) return;
    const { data } = await (supabase as any)
      .from("anew_leads")
      .select("workflow_stage_id")
      .eq("organization_id", companyId)
      .neq("status", "converted");

    if (data) {
      const counts: Record<string, number> = {};
      data.forEach((l: any) => {
        if (l.workflow_stage_id) counts[l.workflow_stage_id] = (counts[l.workflow_stage_id] || 0) + 1;
      });
      setLeadCountByStage(counts);
    }
  };

  // ─── CRUD ──────────────────────────────────────────────────
  // All stage writes funnel through rpc_save_lead_workflow_stages, which
  // takes the full desired stage list for the org in one call, reconciles
  // creates/updates/soft-deletes against current DB state, and writes
  // exactly one audited entity_audit_log row per save action.
  interface StagePayload {
    id: string | null;
    name: string;
    label: string;
    color: string;
    is_final: boolean;
    is_conversion: boolean;
    is_rejection: boolean;
    default_status: string | null;
    matching_statuses: string[];
    reached_when: RuleGroup | null;
    auto_advance: boolean;
    qualification_hint: "none" | "mql" | "sql";
    counts_as_qualified: boolean;
    counts_as_negotiation: boolean;
    counts_as_converted: boolean;
    counts_as_lost: boolean;
  }

  const toStagePayload = (s: WorkflowStage): StagePayload => ({
    id: s.id,
    name: s.name,
    label: s.label,
    color: s.color,
    is_final: s.is_final,
    is_conversion: s.is_conversion,
    is_rejection: s.is_rejection,
    default_status: s.default_status ?? null,
    matching_statuses: s.matching_statuses ?? [s.name],
    reached_when: s.reached_when ?? null,
    auto_advance: s.auto_advance ?? false,
    qualification_hint: s.qualification_hint ?? "none",
    counts_as_qualified: s.counts_as_qualified ?? false,
    counts_as_negotiation: s.counts_as_negotiation ?? false,
    counts_as_converted: s.counts_as_converted ?? false,
    counts_as_lost: s.counts_as_lost ?? false,
  });

  const saveStages = async (payload: StagePayload[]) => {
    const { data, error } = await (supabase as any).rpc("rpc_save_lead_workflow_stages", {
      p_organization_id: companyId,
      p_stages: payload,
    });
    return { data, error };
  };

  const handleAddStage = async () => {
    if (!companyId || !newStage.name || !newStage.label) {
      toast({ title: "Preencha nome e label", variant: "destructive" });
      return;
    }

    const payload: StagePayload[] = [
      ...stages.map(toStagePayload),
      {
        id: null,
        name: newStage.name.toLowerCase().replace(/\s+/g, '_'),
        label: newStage.label,
        color: newStage.color,
        is_final: newStage.is_final,
        is_conversion: newStage.is_conversion,
        is_rejection: newStage.is_rejection,
        default_status: newStage.default_status || null,
        matching_statuses: [newStage.name.toLowerCase().replace(/\s+/g, '_')],
        reached_when: null,
        auto_advance: false,
        qualification_hint: "none",
        counts_as_qualified: false,
        counts_as_negotiation: false,
        counts_as_converted: newStage.is_conversion,
        counts_as_lost: newStage.is_rejection,
      },
    ];

    const { error } = await saveStages(payload);
    if (error) {
      toast({ title: "Erro ao adicionar estágio", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Estágio adicionado" });
      setNewStage({ name: "", label: "", color: "#3b82f6", is_final: false, is_conversion: false, is_rejection: false, default_status: "" });
      setShowAddDialog(false);
      loadStages();
      loadLeadCounts();
      onStagesUpdated?.();
    }
  };

  const handleUpdateStage = async () => {
    if (!editingStage) return;

    const payload: StagePayload[] = stages.map(s =>
      s.id === editingStage.id ? toStagePayload(editingStage) : toStagePayload(s)
    );

    const { error } = await saveStages(payload);
    if (error) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Estágio atualizado" });
      setEditingStage(null);
      loadStages();
      onStagesUpdated?.();
    }
  };

  const handleDeleteStage = async () => {
    if (!deletingStage) return;
    const count = leadCountByStage[deletingStage.id] || 0;

    if (count > 0 && migrationTargetId) {
      const { error: migrateError } = await (supabase as any)
        .from("anew_leads")
        .update({ workflow_stage_id: migrationTargetId })
        .eq("workflow_stage_id", deletingStage.id)
        .eq("organization_id", companyId);
      if (migrateError) {
        captureFlowError(migrateError, "lead-lifecycle");
        toast({ title: "Erro ao migrar leads", description: migrateError.message, variant: "destructive" });
        return;
      }
    }

    // Omit the deleted stage from the payload -> RPC soft-deletes it.
    const payload: StagePayload[] = stages
      .filter(s => s.id !== deletingStage.id)
      .map(toStagePayload);

    const { error } = await saveStages(payload);
    if (error) {
      toast({ title: "Erro ao eliminar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Estágio removido" });
      setDeletingStage(null);
      setMigrationTargetId("");
      loadStages();
      loadLeadCounts();
      onStagesUpdated?.();
    }
  };

  const handleDuplicateStage = async (stage: WorkflowStage) => {
    if (!companyId) return;

    const payload: StagePayload[] = [
      ...stages.map(toStagePayload),
      {
        id: null,
        name: stage.name + "_copy",
        label: stage.label + " (cópia)",
        color: stage.color,
        is_final: stage.is_final,
        is_conversion: false,
        is_rejection: false,
        default_status: null,
        matching_statuses: [stage.name + "_copy"],
        reached_when: stage.reached_when ?? null,
        auto_advance: stage.auto_advance ?? false,
        qualification_hint: stage.qualification_hint ?? "none",
        counts_as_qualified: stage.counts_as_qualified ?? false,
        counts_as_negotiation: stage.counts_as_negotiation ?? false,
        counts_as_converted: false,
        counts_as_lost: false,
      },
    ];

    const { error } = await saveStages(payload);
    if (error) {
      toast({ title: "Erro ao duplicar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Estágio duplicado" });
      loadStages();
      onStagesUpdated?.();
    }
  };

  const handleRecompute = async () => {
    if (!companyId) return;
    setShowRecomputeConfirm(false);
    setUnresolvedLeads(null);
    setRecomputing(true);
    const { data, error } = await (supabase as any).rpc("recompute_leads_v2_buckets", {
      p_org: companyId,
    });

    if (error) {
      setRecomputing(false);
      captureFlowError(error, "lead-lifecycle");
      toast({ title: "Erro ao recalcular leads", description: error.message, variant: "destructive" });
      return;
    }
    const updatedCount = data?.[0]?.updated_count ?? 0;
    const unresolvedCount = data?.[0]?.unresolved_count ?? 0;
    const unresolvedLeadIds: string[] = data?.[0]?.unresolved_lead_ids ?? [];

    toast({ title: `${updatedCount} lead${updatedCount === 1 ? "" : "s"} recalculada${updatedCount === 1 ? "" : "s"}` });

    if (unresolvedCount > 0) {
      toast({
        title: `${unresolvedCount} lead${unresolvedCount === 1 ? "" : "s"} sem estágio resolvido`,
        description: "Nenhuma regra de nenhum estágio correspondeu a estas leads. Reveja as regras de estágio.",
        variant: "destructive",
      });

      // unresolvedLeadIds is already capped to 50 by the RPC — resolve a
      // display name for each so the banner below is actionable, not just a count.
      if (unresolvedLeadIds.length > 0) {
        const { data: leadRows } = await (supabase as any)
          .from("anew_leads")
          .select("id, field_values")
          .eq("organization_id", companyId)
          .in("id", unresolvedLeadIds);

        setUnresolvedLeads({
          count: unresolvedCount,
          leads: (leadRows ?? []).map((l: any) => ({
            id: l.id,
            name: l.field_values?.nome || l.field_values?.name || "Lead sem nome",
          })),
        });
      } else {
        setUnresolvedLeads({ count: unresolvedCount, leads: [] });
      }
    } else {
      setUnresolvedLeads(null);
    }

    setRecomputing(false);
    loadLeadCounts();
    onStagesUpdated?.();
  };

  // ─── Sector presets ("Presets de setor") ──────────────────
  // A stage counts as "customized" once anything a preset would touch
  // deviates from the app's own neutral defaults (see toStagePayload).
  const stageHasCustomRules = (stage: WorkflowStage): boolean => {
    const defaultMatching = stage.matching_statuses == null
      || (stage.matching_statuses.length === 1 && stage.matching_statuses[0] === stage.name);
    return !defaultMatching
      || !isEmptyRule(stage.reached_when ?? null)
      || !!stage.auto_advance
      || (stage.qualification_hint ?? "none") !== "none"
      || !!stage.counts_as_qualified
      || !!stage.counts_as_negotiation
      || !!stage.counts_as_converted
      || !!stage.counts_as_lost;
  };

  const applyPresetToStages = (preset: FunnelPreset) => {
    const nextStages = stages.map(stage => {
      const rule = findPresetStageRule(preset, stage.name, stage.stage_order);
      if (!rule) return stage;
      return {
        ...stage,
        matching_statuses: rule.matchingStatuses.length > 0 ? rule.matchingStatuses : [stage.name],
        reached_when: rule.reachedWhen,
        auto_advance: rule.autoAdvance,
        qualification_hint: rule.qualificationHint,
        counts_as_qualified: rule.countsAsQualified,
        counts_as_negotiation: rule.countsAsNegotiation,
        counts_as_converted: rule.countsAsConverted,
        counts_as_lost: rule.countsAsLost,
      };
    });

    setStages(nextStages);
    setEditingStage(current => {
      if (!current) return current;
      return nextStages.find(s => s.id === current.id) ?? current;
    });
    setPendingPreset(null);
    toast({
      title: `Preset "${preset.label}" aplicado`,
      description: "Regras por gravar — reveja e clique em Guardar & Recalcular para confirmar.",
    });
  };

  const handleSelectPreset = (presetId: string) => {
    const preset = LEAD_FUNNEL_PRESETS.find(p => p.id === presetId);
    if (!preset) return;

    const hasCustomizedStage = stages.some(stageHasCustomRules);
    if (hasCustomizedStage) {
      setPendingPreset(preset);
      return;
    }
    applyPresetToStages(preset);
  };

  // ─── Reordering (drag-and-drop + up/down buttons) ──────────
  const persistReorder = async (reordered: WorkflowStage[]) => {
    // Reflect the new position in stage_order immediately so the "Ordem"
    // badge doesn't lag behind the row swap until the next fetch - the RPC
    // itself derives the persisted order from payload array position, this
    // only keeps the locally-displayed number in sync with it.
    const withUpdatedOrder = reordered.map((s, i) => ({ ...s, stage_order: i + 1 }));
    setStages(withUpdatedOrder);

    const payload: StagePayload[] = withUpdatedOrder.map(toStagePayload);
    const { error } = await saveStages(payload);
    if (error) {
      toast({ title: "Erro ao reordenar", description: error.message, variant: "destructive" });
      loadStages();
      return;
    }
    onStagesUpdated?.();
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = stages.findIndex(s => s.id === active.id);
    const newIndex = stages.findIndex(s => s.id === over.id);
    await persistReorder(arrayMove(stages, oldIndex, newIndex));
  };

  const handleMoveStage = async (stageId: string, direction: "up" | "down") => {
    const index = stages.findIndex(s => s.id === stageId);
    if (index === -1) return;

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= stages.length) return;

    await persistReorder(arrayMove(stages, index, targetIndex));
  };

  const copyTemplateToCompany = async () => {
    if (!companyId || templateStages.length === 0) return;

    const payload: StagePayload[] = templateStages
      .sort((a, b) => a.stage_order - b.stage_order)
      .map(stage => ({
        id: null,
        name: stage.name,
        label: stage.label,
        color: stage.color,
        is_final: stage.is_final,
        is_conversion: stage.is_conversion,
        is_rejection: stage.is_rejection,
        default_status: stage.default_status ?? null,
      }));

    const { error } = await saveStages(payload);
    if (error) {
      toast({ title: "Erro ao copiar template", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Template copiado", description: "Pode agora personalizar os estágios." });
    loadStages();
    loadLeadCounts();
    onStagesUpdated?.();
  };

  // Good-enough estimate for the confirmation dialog — reuses the lead
  // counts already fetched/displayed per-stage above instead of an extra query.
  const totalLeadCountEstimate = Object.values(leadCountByStage).reduce((sum, n) => sum + n, 0);

  const displayStages = stages.length > 0 ? stages : templateStages;
  const deletableLeadCount = deletingStage ? (leadCountByStage[deletingStage.id] || 0) : 0;
  const migrationTargets = stages.filter(s => s.id !== deletingStage?.id);

  const workflowStagesForRules = displayStages.map(s => ({
    id: s.id,
    name: s.name,
    label: s.label,
    color: s.color,
    is_final: s.is_final,
    is_won: s.is_conversion,
    is_lost: s.is_rejection,
  }));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>Configuração de Workflow</DialogTitle>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={() => setShowHelp(true)}>
                      <HelpCircle className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Como funciona o Workflow?</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <DialogDescription>
              Configure os estágios do funil de leads e as automações associadas.
              {isUsingTemplate && templateStages.length > 0 && (
                <span className="text-primary font-medium"> A usar template global.</span>
              )}
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="stages">Estágios</TabsTrigger>
              <TabsTrigger value="flow" className="gap-1.5">
                <ArrowRight className="w-3.5 h-3.5" />
                Fluxo
              </TabsTrigger>
              <TabsTrigger value="actions" className="gap-1.5">
                <Zap className="w-3.5 h-3.5" />
                Ações
              </TabsTrigger>
              <TabsTrigger value="qualification" className="gap-1.5">
                <Target className="w-3.5 h-3.5" />
                Qualificação
              </TabsTrigger>
              <TabsTrigger value="automations" className="gap-1.5">
                <Zap className="w-3.5 h-3.5" />
                Automações
              </TabsTrigger>
            </TabsList>

            {/* ─── Stages Tab ────────────────────────────────── */}
            <TabsContent value="stages" className="space-y-4 mt-4">
              {isUsingTemplate && templateStages.length > 0 && (
                <Card className="border-primary/50 bg-primary/5">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">A usar Template Global</p>
                        <p className="text-sm text-muted-foreground">
                          Copie para a sua empresa para personalizar os estágios.
                        </p>
                      </div>
                      <Button onClick={copyTemplateToCompany}>
                        <Plus className="w-4 h-4 mr-2" />
                        Personalizar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {displayStages.length === 0 && !loading ? (
                <Card className="border-dashed">
                  <CardContent className="py-8 text-center">
                    <p className="text-muted-foreground">Nenhum estágio de workflow configurado.</p>
                  </CardContent>
                </Card>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Ordem</TableHead>
                        <TableHead>Estágio</TableHead>
                        <TableHead className="w-16">Cor</TableHead>
                        <TableHead className="w-28">Tipo</TableHead>
                        <TableHead className="w-20">Leads</TableHead>
                        <TableHead className="text-right w-28">Acções</TableHead>
                      </TableRow>
                    </TableHeader>
                    <SortableContext items={displayStages.map(s => s.id)} strategy={verticalListSortingStrategy}>
                      <TableBody>
                        {displayStages.map((stage, index) => (
                          <SortableStageRow
                            key={stage.id}
                            stage={stage}
                            isTemplate={isUsingTemplate}
                            leadCount={leadCountByStage[stage.id] || 0}
                            isFirst={index === 0}
                            isLast={index === displayStages.length - 1}
                            onEdit={setEditingStage}
                            onDelete={(s) => {
                              setDeletingStage(s);
                              setMigrationTargetId("");
                            }}
                            onDuplicate={handleDuplicateStage}
                            onMoveUp={(s) => handleMoveStage(s.id, "up")}
                            onMoveDown={(s) => handleMoveStage(s.id, "down")}
                          />
                        ))}
                      </TableBody>
                    </SortableContext>
                  </Table>
                </DndContext>
              )}

              {!isUsingTemplate && displayStages.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                  <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Fluxo de conversão:{" "}
                    {displayStages
                      .sort((a, b) => a.stage_order - b.stage_order)
                      .map((s, i) => (
                        <span key={s.id}>
                          <span className="font-medium" style={{ color: s.color }}>{s.label}</span>
                          {i < displayStages.length - 1 && " → "}
                        </span>
                      ))}
                  </span>
                </div>
              )}

              {!isUsingTemplate && (
                <Button onClick={() => setShowAddDialog(true)} className="mt-2">
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Estágio
                </Button>
              )}

              {!isUsingTemplate && displayStages.length > 0 && (
                <div className="space-y-3 pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Regras de resolução de etapa</p>
                      <p className="text-xs text-muted-foreground">
                        Simule o impacto das regras configuradas acima antes de recalcular as leads existentes.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => setShowRecomputeConfirm(true)}
                      disabled={recomputing}
                    >
                      {recomputing ? "A recalcular..." : "Recalcular buckets das leads"}
                    </Button>
                  </div>

                  {recomputing && (
                    <div className="space-y-1.5">
                      <Progress indeterminate className="h-2" />
                      <p className="text-xs text-muted-foreground">
                        A recalcular estágios de todas as leads da organização...
                      </p>
                    </div>
                  )}

                  {unresolvedLeads && unresolvedLeads.count > 0 && (
                    <Card className="border-destructive/40 bg-destructive/5">
                      <CardContent className="py-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-destructive flex items-center gap-1.5">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            {unresolvedLeads.count} lead{unresolvedLeads.count === 1 ? "" : "s"} não
                            correspond{unresolvedLeads.count === 1 ? "e" : "em"} a nenhuma etapa configurada
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => setUnresolvedLeads(null)}
                          >
                            Dispensar
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Estas leads ficaram sem estágio porque nenhuma regra de entrada correspondeu a elas.
                          Reveja as condições de entrada dos estágios acima.
                        </p>
                        {unresolvedLeads.leads.length > 0 && (
                          <ScrollArea className="max-h-32">
                            <ul className="space-y-1">
                              {unresolvedLeads.leads.map(lead => (
                                <li key={lead.id} className="text-xs">
                                  <Badge variant="outline" className="font-normal">{lead.name}</Badge>
                                </li>
                              ))}
                            </ul>
                          </ScrollArea>
                        )}
                        {unresolvedLeads.count > unresolvedLeads.leads.length && (
                          <p className="text-xs text-muted-foreground">
                            Mostrando {unresolvedLeads.leads.length} de {unresolvedLeads.count}.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  <DryRunPanel
                    companyId={companyId}
                    stages={displayStages.map(s => ({
                      id: s.id,
                      label: s.label,
                      stage_order: s.stage_order,
                      reached_when: s.reached_when ?? null,
                      matching_statuses: s.matching_statuses ?? [s.name],
                      counts_as_qualified: s.counts_as_qualified ?? false,
                      counts_as_negotiation: s.counts_as_negotiation ?? false,
                      counts_as_converted: s.counts_as_converted ?? false,
                      counts_as_lost: s.counts_as_lost ?? false,
                    }))}
                  />
                </div>
              )}
            </TabsContent>

            {/* ─── Flow Tab ────────────────────────────────── */}
            <TabsContent value="flow" className="mt-4">
              <WorkflowFlowchart stages={displayStages} companyId={companyId} />
            </TabsContent>

            {/* ─── Actions Tab ───────────────────────────────── */}
            <TabsContent value="actions" className="mt-4">
              <LeadStageActionsConfig stages={displayStages} companyId={companyId} />
            </TabsContent>

            {/* ─── Qualification Tab ─────────────────────────── */}
            <TabsContent value="qualification" className="mt-4">
              <QualificationRulesTab companyId={companyId} />
            </TabsContent>

            {/* ─── Automations Tab ───────────────────────────── */}
            <TabsContent value="automations" className="mt-4">
              <WorkflowAutomationRules
                companyId={companyId || undefined}
                sourceEntity="lead"
                workflowStages={workflowStagesForRules}
              />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* ─── Add Stage Dialog ───────────────────────────────── */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Estágio</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome (key)</Label>
              <Input
                placeholder="ex: proposal_sent"
                value={newStage.name}
                onChange={e => setNewStage({ ...newStage, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Label</Label>
              <Input
                placeholder="ex: Proposta Enviada"
                value={newStage.label}
                onChange={e => setNewStage({ ...newStage, label: e.target.value })}
              />
            </div>
            <div>
              <Label>Cor</Label>
              <div className="flex gap-2 mt-2">
                {DEFAULT_COLORS.map(color => (
                  <button
                    key={color}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      newStage.color === color ? 'border-foreground scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewStage({ ...newStage, color })}
                  />
                ))}
                <Input
                  type="color"
                  value={newStage.color}
                  onChange={e => setNewStage({ ...newStage, color: e.target.value })}
                  className="w-8 h-8 p-0 border-0"
                />
              </div>
            </div>
            <div>
              <Label>Status automático da Lead</Label>
              <Select value={newStage.default_status} onValueChange={v => setNewStage({ ...newStage, default_status: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Nenhum (sem alteração)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {LEAD_STATUS_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Status que a lead recebe ao entrar neste estágio</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch checked={newStage.is_final} onCheckedChange={v => setNewStage({ ...newStage, is_final: v })} />
                <Label>Final</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={newStage.is_conversion} onCheckedChange={v => setNewStage({ ...newStage, is_conversion: v, is_rejection: v ? false : newStage.is_rejection })} />
                <Label>Win (Conversão)</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={newStage.is_rejection} onCheckedChange={v => setNewStage({ ...newStage, is_rejection: v, is_conversion: v ? false : newStage.is_conversion })} />
                <Label>Lost</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancelar</Button>
            <Button onClick={handleAddStage}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Stage Dialog ──────────────────────────────── */}
      <Dialog open={!!editingStage} onOpenChange={() => setEditingStage(null)}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Estágio</DialogTitle>
          </DialogHeader>
          {editingStage && (
            <Tabs value={editStageTab} onValueChange={setEditStageTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="general">Geral</TabsTrigger>
                <TabsTrigger value="rules">Regras</TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-4 mt-4">
                <div>
                  <Label>Nome (key)</Label>
                  <Input value={editingStage.name} disabled className="bg-muted" />
                </div>
                <div>
                  <Label>Label</Label>
                  <Input
                    value={editingStage.label}
                    onChange={e => setEditingStage({ ...editingStage, label: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Cor</Label>
                  <div className="flex gap-2 mt-2">
                    {DEFAULT_COLORS.map(color => (
                      <button
                        key={color}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${
                          editingStage.color === color ? 'border-foreground scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setEditingStage({ ...editingStage, color })}
                      />
                    ))}
                    <Input
                      type="color"
                      value={editingStage.color}
                      onChange={e => setEditingStage({ ...editingStage, color: e.target.value })}
                      className="w-8 h-8 p-0 border-0"
                    />
                  </div>
                </div>
                <div>
                  <Label>Status automático da Lead</Label>
                  <Select value={(editingStage as any).default_status || "none"} onValueChange={v => setEditingStage({ ...editingStage, default_status: v === "none" ? null : v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Nenhum (sem alteração)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {LEAD_STATUS_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">Status que a lead recebe ao entrar neste estágio</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch checked={editingStage.is_final} onCheckedChange={v => setEditingStage({ ...editingStage, is_final: v })} />
                    <Label>Final</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={editingStage.is_conversion} onCheckedChange={v => setEditingStage({ ...editingStage, is_conversion: v, is_rejection: v ? false : editingStage.is_rejection })} />
                    <Label>Win (Conversão)</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={editingStage.is_rejection} onCheckedChange={v => setEditingStage({ ...editingStage, is_rejection: v, is_conversion: v ? false : editingStage.is_conversion })} />
                    <Label>Lost</Label>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="rules" className="space-y-4 mt-4">
                <div className="flex items-center gap-2 pb-3 border-b">
                  <Label className="text-sm shrink-0">Presets de setor</Label>
                  <Select value="" onValueChange={handleSelectPreset}>
                    <SelectTrigger className="w-56">
                      <SelectValue placeholder="Aplicar preset a todo o funil..." />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_FUNNEL_PRESETS.map(preset => (
                        <SelectItem key={preset.id} value={preset.id}>{preset.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-4 h-4 text-muted-foreground shrink-0" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        Preenche as regras de TODOS os estágios do funil (não só este) com valores
                        típicos do setor escolhido. Nada é gravado até clicar em "Guardar & Recalcular".
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                <div>
                  <Label className="text-sm">Status literais associados</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    A lead atinge esta etapa se o campo status for um dos selecionados (usado quando não há condições avançadas em baixo).
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {LEAD_STATUS_OPTIONS.map(opt => {
                      const selected = (editingStage.matching_statuses ?? [editingStage.name]).includes(opt.value);
                      return (
                        <Badge
                          key={opt.value}
                          variant={selected ? "default" : "outline"}
                          className="cursor-pointer text-xs"
                          onClick={() => {
                            const current = editingStage.matching_statuses ?? [editingStage.name];
                            const next = selected ? current.filter(v => v !== opt.value) : [...current, opt.value];
                            setEditingStage({ ...editingStage, matching_statuses: next });
                          }}
                        >
                          {opt.label}
                        </Badge>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <Label className="text-sm">Condições avançadas (motor)</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    A lead atinge esta etapa quando <strong>todas</strong> as condições em <strong>Todas</strong> forem
                    verdadeiras <strong>E</strong> pelo menos uma das condições em <strong>Qualquer</strong> for verdadeira.
                    Deixe vazio para usar apenas os status.
                  </p>
                  <div className="mt-2">
                    <StageRulesEditor
                      value={editingStage.reached_when ?? null}
                      onChange={v => setEditingStage({ ...editingStage, reached_when: v })}
                      organizationId={companyId}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-md border p-3 space-y-2">
                    <Label className="text-sm">Esta etapa contabiliza como</Label>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-normal">Qualificada</Label>
                      <Switch
                        checked={editingStage.counts_as_qualified ?? false}
                        onCheckedChange={v => setEditingStage({
                          ...editingStage,
                          counts_as_qualified: v,
                          counts_as_negotiation: v ? false : editingStage.counts_as_negotiation,
                          counts_as_converted: v ? false : editingStage.counts_as_converted,
                          counts_as_lost: v ? false : editingStage.counts_as_lost,
                        })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-normal">Em Negociação</Label>
                      <Switch
                        checked={editingStage.counts_as_negotiation ?? false}
                        onCheckedChange={v => setEditingStage({
                          ...editingStage,
                          counts_as_negotiation: v,
                          counts_as_qualified: v ? false : editingStage.counts_as_qualified,
                          counts_as_converted: v ? false : editingStage.counts_as_converted,
                          counts_as_lost: v ? false : editingStage.counts_as_lost,
                        })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-normal">Convertida</Label>
                      <Switch
                        checked={editingStage.counts_as_converted ?? false}
                        onCheckedChange={v => setEditingStage({
                          ...editingStage,
                          counts_as_converted: v,
                          counts_as_qualified: v ? false : editingStage.counts_as_qualified,
                          counts_as_negotiation: v ? false : editingStage.counts_as_negotiation,
                          counts_as_lost: v ? false : editingStage.counts_as_lost,
                        })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-normal">Perdida</Label>
                      <Switch
                        checked={editingStage.counts_as_lost ?? false}
                        onCheckedChange={v => setEditingStage({
                          ...editingStage,
                          counts_as_lost: v,
                          counts_as_qualified: v ? false : editingStage.counts_as_qualified,
                          counts_as_negotiation: v ? false : editingStage.counts_as_negotiation,
                          counts_as_converted: v ? false : editingStage.counts_as_converted,
                        })}
                      />
                    </div>
                  </div>

                  <div className="rounded-md border p-3 space-y-3">
                    <Label className="text-sm">Sugestão de qualificação</Label>
                    <div className="flex flex-wrap gap-1">
                      {(["none", "mql", "sql"] as const).map(opt => (
                        <Badge
                          key={opt}
                          variant={(editingStage.qualification_hint ?? "none") === opt ? "default" : "outline"}
                          className="cursor-pointer text-xs"
                          onClick={() => setEditingStage({ ...editingStage, qualification_hint: opt })}
                        >
                          {opt === "none" ? "Nenhuma" : opt.toUpperCase()}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t">
                      <div>
                        <Label className="text-sm font-normal">Auto-avançar</Label>
                        <p className="text-xs text-muted-foreground">
                          Permite ao motor mover leads automaticamente para esta etapa.
                        </p>
                      </div>
                      <Switch
                        checked={editingStage.auto_advance ?? false}
                        onCheckedChange={v => setEditingStage({ ...editingStage, auto_advance: v })}
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t">
                  <Label className="text-sm">Impacto destas regras (ainda não gravadas)</Label>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                    Simula estas regras contra as leads reais da organização sem gravar nada.
                  </p>
                  <StageRulesSimulator
                    key={editingStage.id}
                    companyId={companyId}
                    stage={{
                      id: editingStage.id,
                      matching_statuses: editingStage.matching_statuses ?? [editingStage.name],
                      reached_when: editingStage.reached_when ?? null,
                      auto_advance: editingStage.auto_advance ?? false,
                      qualification_hint: editingStage.qualification_hint ?? "none",
                      counts_as_converted: editingStage.counts_as_converted ?? false,
                      counts_as_lost: editingStage.counts_as_lost ?? false,
                      counts_as_qualified: editingStage.counts_as_qualified ?? false,
                      counts_as_negotiation: editingStage.counts_as_negotiation ?? false,
                    }}
                  />
                </div>
              </TabsContent>
            </Tabs>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingStage(null)}>Cancelar</Button>
            <Button onClick={handleUpdateStage}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete with Migration Dialog ───────────────────── */}
      <AlertDialog open={!!deletingStage} onOpenChange={(v) => { if (!v) { setDeletingStage(null); setMigrationTargetId(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Eliminar Estágio "{deletingStage?.label}"
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {deletableLeadCount > 0 ? (
                  <>
                    <p>
                      Este estágio contém <strong>{deletableLeadCount} lead{deletableLeadCount > 1 ? 's' : ''}</strong>.
                      Seleccione o estágio de destino para migrar as leads antes de eliminar.
                    </p>
                    <div className="space-y-2">
                      <Label>Migrar leads para:</Label>
                      <Select value={migrationTargetId} onValueChange={setMigrationTargetId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecionar estágio..." />
                        </SelectTrigger>
                        <SelectContent>
                          {migrationTargets.map(s => (
                            <SelectItem key={s.id} value={s.id}>
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                                {s.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : (
                  <p>Este estágio não contém leads. Pode eliminá-lo com segurança.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteStage}
              disabled={deletableLeadCount > 0 && !migrationTargetId}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletableLeadCount > 0 ? `Migrar e Eliminar` : `Eliminar`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Sector Preset Overwrite Confirmation ──────────────── */}
      <AlertDialog open={!!pendingPreset} onOpenChange={(v) => { if (!v) setPendingPreset(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Substituir regras existentes?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Pelo menos um estágio deste funil já tem regras personalizadas (condições de entrada,
              auto-avanço, bucket ou qualificação). Aplicar o preset <strong>"{pendingPreset?.label}"</strong> vai
              substituir essas regras em todos os estágios correspondentes. Nada é gravado até clicar em
              "Guardar & Recalcular" — pode rever ou cancelar antes disso.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingPreset && applyPresetToStages(pendingPreset)}>
              Substituir regras
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Recompute Confirmation ─────────────────────────── */}
      <AlertDialog open={showRecomputeConfirm} onOpenChange={setShowRecomputeConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-primary" />
              Recalcular estágios de todas as leads?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {totalLeadCountEstimate > 0 ? (
                <>
                  Aproximadamente <strong>{totalLeadCountEstimate} lead{totalLeadCountEstimate === 1 ? "" : "s"}</strong> serão
                  reavaliada{totalLeadCountEstimate === 1 ? "" : "s"} contra as regras de entrada configuradas acima
                  e podem mudar de estágio. Esta ação não pode ser desfeita automaticamente — continuar?
                </>
              ) : (
                "As leads da organização serão reavaliadas contra as regras de entrada configuradas acima e podem mudar de estágio. Esta ação não pode ser desfeita automaticamente — continuar?"
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRecompute}>
              Guardar & Recalcular
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Help Dialog */}
      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-primary" />
              Como funciona o Workflow de Leads?
            </DialogTitle>
            <DialogDescription>
              Guia completo para compreender e configurar o seu funil de vendas
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[65vh] pr-4">
            <div className="space-y-6 text-sm">
              <div className="space-y-3">
                <h3 className="font-semibold text-base flex items-center gap-2">
                  🎯 O Percurso Real: Da Lead ao Cliente
                </h3>
                <p className="text-muted-foreground text-xs mb-2">
                  Este é o caminho que cada potencial cliente percorre no seu sistema. O workflow automatiza este processo.
                </p>
                
                <div className="relative space-y-0">
                  <div className="flex items-stretch gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-10 h-10 rounded-full bg-blue-500/15 border-2 border-blue-500 flex items-center justify-center text-blue-600 font-bold text-sm shrink-0">1</div>
                      <div className="w-0.5 flex-1 bg-gradient-to-b from-blue-500 to-yellow-500 mt-1" />
                    </div>
                    <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 flex-1 mb-2">
                      <p className="font-semibold text-blue-700 dark:text-blue-400 text-sm">📥 Entra uma Lead Nova</p>
                      <p className="text-muted-foreground text-xs mt-1">
                        Uma pessoa preenche um formulário, liga para a empresa, ou é captada por uma campanha publicitária. 
                        O sistema cria automaticamente o registo com status <strong>"Nova"</strong>.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-stretch gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-10 h-10 rounded-full bg-yellow-500/15 border-2 border-yellow-500 flex items-center justify-center text-yellow-600 font-bold text-sm shrink-0">2</div>
                      <div className="w-0.5 flex-1 bg-gradient-to-b from-yellow-500 to-purple-500 mt-1" />
                    </div>
                    <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3 flex-1 mb-2">
                      <p className="font-semibold text-yellow-700 dark:text-yellow-400 text-sm">📞 Contacto Realizado</p>
                      <p className="text-muted-foreground text-xs mt-1">
                        A sua equipa liga ou envia email à lead. Regista o resultado do contacto. 
                        O status muda para <strong>"Contactada"</strong>.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-stretch gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-10 h-10 rounded-full bg-purple-500/15 border-2 border-purple-500 flex items-center justify-center text-purple-600 font-bold text-sm shrink-0">3</div>
                      <div className="w-0.5 flex-1 bg-gradient-to-b from-purple-500 to-orange-500 mt-1" />
                    </div>
                    <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-3 flex-1 mb-2">
                      <p className="font-semibold text-purple-700 dark:text-purple-400 text-sm">✅ Lead Qualificada</p>
                      <p className="text-muted-foreground text-xs mt-1">
                        A lead tem interesse real e capacidade de compra. Fica marcada como <strong>"Qualificada"</strong>, ainda sem orçamento ou proposta associados.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-stretch gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-10 h-10 rounded-full bg-orange-500/15 border-2 border-orange-500 flex items-center justify-center text-orange-600 font-bold text-sm shrink-0">4</div>
                      <div className="w-0.5 flex-1 bg-gradient-to-b from-orange-500 to-emerald-500 mt-1" />
                    </div>
                    <div className="bg-orange-500/5 border border-orange-500/20 rounded-lg p-3 flex-1 mb-2">
                      <p className="font-semibold text-orange-700 dark:text-orange-400 text-sm">📄 Proposta Enviada</p>
                      <p className="text-muted-foreground text-xs mt-1">
                        Envia um orçamento ou proposta comercial à lead. O sistema associa o orçamento/proposta e o status muda automaticamente para <strong>"Em Negociação"</strong>.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-stretch gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-10 h-10 rounded-full bg-emerald-500/15 border-2 border-emerald-500 flex items-center justify-center text-emerald-600 font-bold text-sm shrink-0">5</div>
                    </div>
                    <div className="flex-1 grid grid-cols-2 gap-2 mb-2">
                      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                        <p className="font-semibold text-emerald-700 dark:text-emerald-400 text-sm">🎉 Ganho!</p>
                        <p className="text-muted-foreground text-xs mt-1">
                          O negócio é fechado! O sistema converte automaticamente a <strong>Lead em Cliente</strong>.
                        </p>
                        <div className="mt-2 flex items-center gap-1">
                          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]">Win</Badge>
                          <Badge variant="outline" className="text-[10px]">→ Cliente</Badge>
                        </div>
                      </div>
                      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                        <p className="font-semibold text-red-700 dark:text-red-400 text-sm">❌ Perdido</p>
                        <p className="text-muted-foreground text-xs mt-1">
                          A lead não avançou. Fica registada para análise futura.
                        </p>
                        <div className="mt-2 flex items-center gap-1">
                          <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-[10px]">Lost</Badge>
                          <Badge variant="outline" className="text-[10px]">Arquivada</Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mt-3">
                  <p className="font-semibold text-sm mb-2">🔄 Conversão Automática do Sistema</p>
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="bg-blue-500/20 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded font-medium">Lead</span>
                      <span className="text-[10px] text-muted-foreground">(Qualificada / Em Negociação)</span>
                      <ArrowRight className="w-3 h-3" />
                      <span className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded font-medium">Cliente</span>
                      <span>— Quando o negócio é ganho</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <Target className="w-4 h-4 text-primary" />
                  O que é um Workflow?
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  Um <strong>workflow</strong> é o caminho que cada potencial cliente (lead) percorre desde o primeiro contacto até se tornar cliente. A lead evolui pelos estados "Qualificada" e "Em Negociação" sem passar por nenhuma etapa intermédia de "Contacto" — é a mesma entidade do início ao fim.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <Settings className="w-4 h-4 text-primary" />
                  Os 4 Separadores de Configuração
                </h3>
                <div className="space-y-3">
                  <div className="bg-muted/30 rounded-md p-3 border">
                    <p className="font-medium mb-1">📋 Estágios</p>
                    <p className="text-muted-foreground">
                      Defina as etapas do seu funil. Adicione, edite, reordene (arraste), duplique ou elimine estágios.
                    </p>
                  </div>
                  <div className="bg-muted/30 rounded-md p-3 border">
                    <p className="font-medium mb-1">🔀 Fluxo</p>
                    <p className="text-muted-foreground">
                      Desenhe visualmente os caminhos possíveis entre estágios.
                    </p>
                  </div>
                  <div className="bg-muted/30 rounded-md p-3 border">
                    <p className="font-medium mb-1">⚡ Ações</p>
                    <p className="text-muted-foreground">
                      Configure o que acontece automaticamente quando uma lead entra num estágio.
                    </p>
                  </div>
                  <div className="bg-muted/30 rounded-md p-3 border">
                    <p className="font-medium mb-1">🤖 Automações</p>
                    <p className="text-muted-foreground">
                      Regras avançadas que movem leads automaticamente entre estágios com base em condições.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  Dicas
                </h3>
                <div className="space-y-2 text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                    <p><strong>Comece simples:</strong> 4-6 estágios são suficientes para a maioria dos negócios.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                    <p><strong>Use nomes claros:</strong> Toda a equipa deve perceber o que cada estágio significa.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                    <p><strong>Defina o fluxo:</strong> Restrinja as transições para evitar que leads saltem etapas.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                    <p><strong>Automatize tarefas repetitivas:</strong> Use as Ações para criar follow-ups automáticos.</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-base">💼 Exemplos por Tipo de Negócio</h3>
                <div className="grid gap-2">
                  <div className="bg-accent/30 rounded-md p-3 border">
                    <p className="font-medium text-xs uppercase tracking-wider text-muted-foreground mb-1">Café / Restaurante</p>
                    <p className="text-muted-foreground text-xs">Novo → Contactado → Orçamento Enviado → Evento Confirmado → Realizado</p>
                  </div>
                  <div className="bg-accent/30 rounded-md p-3 border">
                    <p className="font-medium text-xs uppercase tracking-wider text-muted-foreground mb-1">Agência de Marketing</p>
                    <p className="text-muted-foreground text-xs">Novo → Reunião Agendada → Briefing Recebido → Proposta Enviada → Contrato Assinado</p>
                  </div>
                  <div className="bg-accent/30 rounded-md p-3 border">
                    <p className="font-medium text-xs uppercase tracking-wider text-muted-foreground mb-1">Empresa de Software</p>
                    <p className="text-muted-foreground text-xs">Novo → Demo Agendada → Trial Ativo → Negociação → Subscrição Ativa</p>
                  </div>
                  <div className="bg-accent/30 rounded-md p-3 border">
                    <p className="font-medium text-xs uppercase tracking-wider text-muted-foreground mb-1">Imobiliária</p>
                    <p className="text-muted-foreground text-xs">Novo → Visita Agendada → Visitado → Proposta → Escritura</p>
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}