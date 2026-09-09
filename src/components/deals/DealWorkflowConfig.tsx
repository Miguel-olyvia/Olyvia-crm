import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Zap, GitBranch, ArrowRight, FileText, Receipt, FileSignature, Users, Briefcase, GripVertical, Settings, LayoutTemplate } from "lucide-react";
import { PipelineStageActionsConfig } from "./PipelineStageActionsConfig";
import { WorkflowAutomationRules } from "@/components/workflows/WorkflowAutomationRules";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DealStagesManager, type DealWorkflowStage } from "./DealStagesManager";
import { DealFlowchart } from "./DealFlowchart";
import { PipelineTemplatePicker } from "./PipelineTemplatePicker";
import { PipelineModuleToggle } from "./PipelineModuleToggle";
import { usePipelineConfig, type PipelineModule } from "@/hooks/usePipelineConfig";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, horizontalListSortingStrategy, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { isTerminal, reorderPipelineModules } from "@/lib/pipeline/moduleOrder";
import { deriveEdgeWrites, isNoOp, type EdgeWrites } from "@/lib/pipeline/deriveEdgeWrites";
import { loadAllStageActions, applyEdgeWrites } from "@/lib/pipeline/applyEdgeWrites";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

interface ProposalStage {
  id: string; name: string; label: string; color: string; is_won: boolean; is_lost: boolean;
}
interface QuoteStage {
  id: string; name: string; label: string; color: string; is_won: boolean; is_lost: boolean;
}
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
}

const ICON_MAP: Record<string, LucideIcon> = {
  Briefcase, FileText, Receipt, FileSignature, Users,
};

interface VisualStep {
  id: string; label: string; sublabel: string; icon: LucideIcon; color: string;
}

function SortablePipelineStep({ step, isLast }: { step: VisualStep; isLast: boolean }) {
  // O passo terminal (Cliente) nao se arrasta: melhor um gesto que nem comeca
  // do que um que comeca e volta atras.
  const isTerminalStep = isTerminal({ id: step.id, enabled: true });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id, disabled: isTerminalStep });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const Icon = step.icon;
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1 min-w-0">
      <div className={cn("flex flex-col items-center gap-1 min-w-[70px] relative group rounded-lg p-1.5 transition-all", isDragging && "opacity-50 ring-2 ring-primary/40 bg-primary/5")}>
        {!isTerminalStep && (
          <div {...attributes} {...listeners} className="absolute -top-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
            <GripVertical className="w-3 h-3 text-muted-foreground" />
          </div>
        )}
        <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: step.color + '20', color: step.color }}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-xs font-medium text-center leading-tight">{step.label}</span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{step.sublabel}</Badge>
      </div>
      {!isLast && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-[-20px]" />}
    </div>
  );
}

const MODULE_TO_TAB: Record<string, string> = {
  pedido: "deal",
  proposta: "proposal",
  orcamento: "quote",
  contrato: "contract",
};

const CONTRACT_STAGES = [
  { id: "rascunho", name: "rascunho", color: "#6b7280", label: "Rascunho" },
  { id: "enviado", name: "enviado", color: "#3b82f6", label: "Enviado" },
  { id: "assinado", name: "assinado", color: "#10b981", label: "Assinado" },
  { id: "cancelado", name: "cancelado", color: "#ef4444", label: "Cancelado" },
];

// Map action_type to the module step it creates
const MODULE_LABEL: Record<string, string> = {
  pedido: "Pedido", orcamento: "Orçamento", proposta: "Proposta", contrato: "Contrato", cliente: "Cliente",
};

const ACTION_LABEL: Record<string, string> = {
  create_deal: "Pedido", create_quote: "Orçamento", create_proposal: "Proposta",
  create_contract: "Contrato", convert_to_client: "Cliente",
};

const ACTION_TO_STEP: Record<string, string> = {
  create_deal: "pedido",
  create_quote: "orcamento",
  create_proposal: "proposta",
  create_contract: "contrato",
  convert_to_client: "cliente",
};

// Map module step to the stage_actions table
const STEP_TO_TABLE: Record<string, string> = {
  pedido: "deal_stage_actions",
  proposta: "proposal_stage_actions",
  orcamento: "quote_stage_actions",
  contrato: "contract_stage_actions",
};

// Map module step to the stages table
const STEP_TO_STAGES_TABLE: Record<string, string> = {
  pedido: "deal_stages",
  proposta: "proposal_workflow_stages",
  orcamento: "quote_workflow_stages",
  contrato: "contract_stage_actions", // contracts use static stages
};

export function DealWorkflowConfig({ open, onOpenChange, companyId }: Props) {
  const pipelineConfig = usePipelineConfig(companyId);
  const [dealStages, setDealStages] = useState<DealWorkflowStage[]>([]);
  const [proposalStages, setProposalStages] = useState<ProposalStage[]>([]);
  const [quoteStages, setQuoteStages] = useState<QuoteStage[]>([]);
  const [dealSubTab, setDealSubTab] = useState("stages");
  const [mainTab, setMainTab] = useState("config");
  // Stores the derived flow: moduleId → { triggerStageName, createsModule }
  const [flowMap, setFlowMap] = useState<Record<string, { triggerStage: string; createsLabel: string }>>({});
  // Uma reordenação fica PENDENTE até ser confirmada: arrastar reescreve regras
  // de automação a sério, e um gesto acidental não pode fazer isso em silêncio.
  const [pendingReorder, setPendingReorder] = useState<{ modules: any[]; writes: EdgeWrites } | null>(null);
  const [applying, setApplying] = useState(false);

  /**
   * A ordem que o ecra MOSTRA enquanto ha uma alteracao por confirmar.
   *
   * Sem isto, arrastar um modulo tinha um corte no meio: largava-se, a peca
   * saltava de volta ao sitio de origem, e so DEPOIS aparecia a confirmacao --
   * porque `proporAlteracao` guarda a nova ordem em `pendingReorder` e nao toca
   * em `pipelineConfig.modules`. O gesto parecia ter falhado, e o dialogo
   * parecia vir do nada.
   *
   * Agora a peca fica onde foi largada e a confirmacao explica o que isso muda
   * na automacao. Cancelar limpa `pendingReorder` e a ordem volta sozinha ao que
   * esta guardado -- nao ha estado a sincronizar a mao.
   *
   * O que se ESCREVE continua a vir de `pendingReorder.writes`, derivado antes
   * de mostrar o dialogo. Isto e so o que se ve.
   */
  const modulosEmVista = pendingReorder?.modules ?? pipelineConfig.modules;
  const activeModules = useMemo(
    () => modulosEmVista.filter((m: any) => m.enabled),
    [modulosEmVista],
  );

  // Load all stage actions across modules and derive the real flow
  const loadFlowFromActions = useCallback(async () => {
    if (!companyId) return;

    const tables = Object.entries(STEP_TO_TABLE);
    const results = await Promise.all(
      tables.map(([, table]) =>
        (supabase.from(table as any) as any)
          .select("*")
          .eq("organization_id", companyId)
          .eq("is_active", true)
          .order("execution_order")
      )
    );

    // Collect all stages for name resolution
    const allStages = new Map<string, string>();
    dealStages.forEach(s => allStages.set(s.id, s.label || s.name));
    proposalStages.forEach(s => allStages.set(s.id, s.label || s.name));
    quoteStages.forEach(s => allStages.set(s.id, s.label || s.name));
    CONTRACT_STAGES.forEach(s => allStages.set(s.id, s.label || s.name));

    const newFlowMap: Record<string, { triggerStage: string; createsLabel: string }> = {};

    tables.forEach(([stepId], i) => {
      const actions = results[i]?.data || [];
      // Find the first "create_*" or "convert_to_client" action
      const createAction = actions.find((a: any) =>
        ACTION_TO_STEP[a.action_type]
      );
      if (createAction) {
        const createsStep = ACTION_TO_STEP[createAction.action_type];
        const triggerStageName = allStages.get(createAction.stage_id) || createAction.stage_id;
        const targetModule = activeModules.find(m => m.id === createsStep);
        newFlowMap[stepId] = {
          triggerStage: triggerStageName,
          createsLabel: targetModule?.label || createsStep,
        };
      }
    });

    setFlowMap(newFlowMap);
  }, [companyId, dealStages, proposalStages, quoteStages, activeModules]);

  useEffect(() => {
    if (open && dealStages.length > 0) loadFlowFromActions();
  }, [open, loadFlowFromActions, dealStages.length]);

  const pipelineSteps: VisualStep[] = useMemo(() =>
    activeModules.map(m => {
      // Use the actual trigger stage from actions if available
      const flow = flowMap[m.id];
      return {
        id: m.id,
        label: m.label,
        sublabel: flow?.triggerStage || m.sublabel,
        icon: ICON_MAP[m.icon] || Briefcase,
        color: m.color,
      };
    }),
  [activeModules, flowMap]);

  const workflowStagesForRules = useMemo(() => dealStages.map(s => ({
    id: s.id, label: s.label, name: s.name, color: s.color,
    stage_order: s.order_index, is_won: s.is_won, is_lost: s.is_lost, is_final: s.is_final, icon: '',
  })), [dealStages]);

  const pipelineOrder = useMemo(() => activeModules.map(m => m.id), [activeModules]);

  const tabOrder = useMemo(() =>
    activeModules
      .filter(m => MODULE_TO_TAB[m.id])
      .map(m => ({ value: MODULE_TO_TAB[m.id], label: m.label, icon: ICON_MAP[m.icon] || Briefcase })),
  [activeModules]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const loadStages = useCallback(async () => {
    const [dealRes, proposalRes, quoteRes] = await Promise.all([
      (supabase.from("deal_stages") as any).select("*").order("order_index"),
      supabase.from("proposal_workflow_stages").select("id, name, label, color, is_won, is_lost, stage_order").eq("is_active", true).order("stage_order"),
      (supabase.from("quote_workflow_stages" as any) as any).select("id, name, label, color, is_won, is_lost, stage_order").eq("is_active", true).order("stage_order"),
    ]);
    if (dealRes.data) setDealStages((dealRes.data as any[]).map((s: any) => ({ ...s, label: s.label || s.name })));
    if (proposalRes.data) setProposalStages(proposalRes.data);
    if (quoteRes.data) setQuoteStages((quoteRes.data as any[]).map((s: any) => ({ ...s, label: s.label || s.name })));
  }, []);

  useEffect(() => {
    if (open) loadStages();
  }, [open, loadStages]);

  /**
   * Caminho único para qualquer alteração à composição do pipeline — arrastar
   * OU ligar/desligar um módulo. As duas coisas mudam o que cada módulo cria, e
   * ambas têm de reescrever as regras: o motor não lê a configuração de módulos,
   * só as tabelas de acções, portanto um módulo desligado cuja regra ficasse
   * activa continuaria a ser executado.
   */
  const proporAlteracao = useCallback(async (novosModulos: PipelineModule[]) => {
    if (!companyId) return;
    const regras = await loadAllStageActions(companyId);
    const writes = deriveEdgeWrites(regras, novosModulos);
    if (isNoOp(writes)) {
      // Nada de automação muda — guarda-se sem incomodar ninguém.
      await pipelineConfig.saveModules(novosModulos);
      return;
    }
    setPendingReorder({ modules: novosModulos, writes });
  }, [companyId, pipelineConfig]);

  const handleToggleModule = useCallback((moduleId: string) => {
    const novos = pipelineConfig.modules.map((m) =>
      m.id === moduleId ? { ...m, enabled: !m.enabled } : m,
    );
    void proporAlteracao(novos);
  }, [pipelineConfig.modules, proporAlteracao]);

  const handleFlowDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    // O Cliente é o passo terminal e tem de ficar sempre em último: nada vem
    // depois de converter. `reorderPipelineModules` devolve o mesmo array
    // quando o gesto é ilegal, e a comparação por identidade evita escrever.
    const allModules = pipelineConfig.modules;
    const reordered = reorderPipelineModules(allModules, String(active.id), String(over.id));
    if (reordered === allModules) return;

    void proporAlteracao(reordered);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            Pipeline Comercial — Automações
          </DialogTitle>
          <DialogDescription>
            Configure estágios, fluxo e acções automáticas em cada módulo do pipeline
          </DialogDescription>
        </DialogHeader>

        {/* Visual Pipeline Flow */}
        <div className="rounded-lg border bg-muted/30 p-4 mt-2">
          <p className="text-xs font-medium text-muted-foreground mb-3">
            Fluxo Automático <span className="text-muted-foreground/60 ml-1">(arraste para reordenar)</span>
          </p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleFlowDragEnd}>
            <SortableContext items={pipelineSteps.map(s => s.id)} strategy={horizontalListSortingStrategy}>
              <div className="flex items-center justify-between gap-1 overflow-x-auto">
                {pipelineSteps.map((step, i) => (
                  <SortablePipelineStep key={step.id} step={step} isLast={i === pipelineSteps.length - 1} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        <Alert className="mt-2">
          <Zap className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Configure acções por fase em cada módulo. Quando o estado mudar, as acções são executadas automaticamente.
            {(() => {
              const descriptions: string[] = [];
              // Build descriptions from actual configured actions (flowMap)
              for (const step of pipelineSteps) {
                const flow = flowMap[step.id];
                if (flow) {
                  descriptions.push(`${step.label} — ${flow.triggerStage} cria ${flow.createsLabel}`);
                }
              }
              return descriptions.length > 0 ? (
                <span className="block mt-1">
                  {descriptions.map((d, i) => (
                    <span key={i}><strong>{d}</strong>{i < descriptions.length - 1 ? ". " : "."}</span>
                  ))}
                </span>
              ) : (
                <span className="block mt-1 text-muted-foreground">
                  Nenhuma acção automática configurada. Configure acções em cada módulo.
                </span>
              );
            })()}
          </AlertDescription>
        </Alert>

        <Tabs value={mainTab} onValueChange={setMainTab} className="mt-2">
          <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${tabOrder.length + 2}, minmax(0, 1fr))` }}>
            <TabsTrigger value="config" className="flex items-center gap-1.5">
              <LayoutTemplate className="w-3.5 h-3.5" />
              Configurar
            </TabsTrigger>
            {tabOrder.map(tab => {
              const TabIcon = tab.icon;
              return (
                <TabsTrigger key={tab.value} value={tab.value} className="flex items-center gap-1.5">
                  <TabIcon className="w-3.5 h-3.5" />
                  {tab.label}
                </TabsTrigger>
              );
            })}
            <TabsTrigger value="automation" className="flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5" />
              Regras
            </TabsTrigger>
          </TabsList>

          <TabsContent value="config" className="mt-4 space-y-6">
            <PipelineTemplatePicker
              templates={pipelineConfig.templates}
              currentTemplateId={pipelineConfig.config?.template_id || null}
              onApply={pipelineConfig.applyTemplate}
            />
            {/*
              `onReorder` aponta para `proporAlteracao`, o mesmo caminho da tira
              do fluxo -- e nao para `pipelineConfig.reorderModules`.

              Como estava, arrastar AQUI gravava a nova ordem e nao mexia numa
              unica regra: o motor nao le a configuracao de modulos, so as
              tabelas de accoes. O desenho passava a dizer uma coisa e a
              automacao continuava a fazer outra, sem aviso. Arrastar na tira,
              logo acima, ja fazia o correcto -- eram dois caminhos para o mesmo
              gesto, e so um estava certo.
            */}
            <PipelineModuleToggle
              modules={modulosEmVista}
              onToggle={handleToggleModule}
              onReorder={(novos) => { void proporAlteracao(novos); }}
              onUpdateLabel={pipelineConfig.updateModuleLabel}
            />
          </TabsContent>

          <TabsContent value="deal" className="mt-4">
            <Tabs value={dealSubTab} onValueChange={setDealSubTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="stages" className="gap-1.5">
                  <Settings className="w-3.5 h-3.5" />
                  Fases
                </TabsTrigger>
                <TabsTrigger value="flow" className="gap-1.5">
                  <ArrowRight className="w-3.5 h-3.5" />
                  Fluxo
                </TabsTrigger>
                <TabsTrigger value="actions" className="gap-1.5">
                  <Zap className="w-3.5 h-3.5" />
                  Acções
                </TabsTrigger>
              </TabsList>
              <TabsContent value="stages" className="mt-4">
                <DealStagesManager companyId={companyId} onStagesUpdated={loadStages} />
              </TabsContent>
              <TabsContent value="flow" className="mt-4">
                <DealFlowchart stages={dealStages} companyId={companyId} />
              </TabsContent>
              <TabsContent value="actions" className="mt-4">
                <PipelineStageActionsConfig stages={dealStages} companyId={companyId} module="deal" moduleLabel={activeModules.find(m => m.id === 'pedido')?.label || "Pedidos"} pipelineOrder={pipelineOrder} onActionsChanged={loadFlowFromActions} />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="proposal" className="mt-4">
            <PipelineStageActionsConfig stages={proposalStages.map(s => ({ ...s, label: s.label || s.name }))} companyId={companyId} module="proposal" moduleLabel={activeModules.find(m => m.id === 'proposta')?.label || "Propostas"} pipelineOrder={pipelineOrder} onActionsChanged={loadFlowFromActions} />
          </TabsContent>

          <TabsContent value="quote" className="mt-4">
            <PipelineStageActionsConfig stages={quoteStages} companyId={companyId} module="quote" moduleLabel={activeModules.find(m => m.id === 'orcamento')?.label || "Orçamentos"} pipelineOrder={pipelineOrder} onActionsChanged={loadFlowFromActions} />
          </TabsContent>

          <TabsContent value="contract" className="mt-4">
            <PipelineStageActionsConfig stages={CONTRACT_STAGES} companyId={companyId} module="contract" moduleLabel={activeModules.find(m => m.id === 'contrato')?.label || "Contratos"} pipelineOrder={pipelineOrder} onActionsChanged={loadFlowFromActions} />
          </TabsContent>

          <TabsContent value="automation" className="mt-4">
            <WorkflowAutomationRules sourceEntity="deal" companyId={companyId || undefined} workflowStages={workflowStagesForRules} />
          </TabsContent>
        </Tabs>
      </DialogContent>

      {/* Confirmação da reordenação. Mostra exactamente que regras mudam antes
          de escrever: um arrasto acidental não pode reescrever a automação de
          uma organização em silêncio. */}
      <Dialog open={!!pendingReorder} onOpenChange={(o) => { if (!o) setPendingReorder(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Reordenar altera a automação</DialogTitle>
            <DialogDescription>
              Esta nova ordem muda o que cada módulo cria. Confirme as alterações:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            {(pendingReorder?.writes.insert.length ?? 0) > 0 && (
              <div>
                <p className="font-medium text-foreground mb-1">Passa a criar</p>
                <ul className="space-y-1">
                  {pendingReorder!.writes.insert.map((i, k) => (
                    <li key={k} className="text-muted-foreground">
                      <strong>{MODULE_LABEL[i.module] || i.module}</strong> → {ACTION_LABEL[i.action_type] || i.action_type}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(pendingReorder?.writes.deactivate.length ?? 0) > 0 && (
              <div>
                <p className="font-medium text-foreground mb-1">Deixa de criar</p>
                <ul className="space-y-1">
                  {pendingReorder!.writes.deactivate.map((r) => (
                    <li key={r.id} className="text-muted-foreground">
                      <strong>{MODULE_LABEL[r.module] || r.module}</strong> → {ACTION_LABEL[r.action_type] || r.action_type}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground/80 mt-1">
                  As regras são desactivadas, não apagadas — voltar atrás repõe-nas.
                </p>
              </div>
            )}
            {(pendingReorder?.writes.needsTriggerStage.length ?? 0) > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                Sem fase de disparo configurada em: {pendingReorder!.writes.needsTriggerStage.map(m => MODULE_LABEL[m] || m).join(", ")}.
                Configure a acção nesse módulo depois de reordenar.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingReorder(null)} disabled={applying}>Cancelar</Button>
            <Button
              disabled={applying}
              onClick={async () => {
                if (!pendingReorder || !companyId) return;
                setApplying(true);
                try {
                  const businessUserId = await resolveCurrentBusinessUserId();
                  if (!businessUserId) throw new Error("Utilizador não resolvido");
                  const r = await applyEdgeWrites(companyId, pendingReorder.writes, businessUserId);
                  if (r.erros.length > 0) {
                    toast.error(`Falhou: ${r.erros[0]}`);
                  } else {
                    // `saveModules` e não `reorderModules`: a alteração pendente
                    // tanto pode ser uma reordenação como um módulo ligado ou
                    // desligado, e o segundo caso muda `enabled`, não a ordem.
                    await pipelineConfig.saveModules(pendingReorder.modules);
                    await loadFlowFromActions();
                    toast.success(`Automação actualizada: ${r.inseridas} nova(s), ${r.desactivadas} desactivada(s)`);
                    setPendingReorder(null);
                  }
                } catch (e: any) {
                  toast.error(e?.message || "Não foi possível actualizar a automação");
                } finally {
                  setApplying(false);
                }
              }}
            >
              {applying ? "A aplicar…" : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
