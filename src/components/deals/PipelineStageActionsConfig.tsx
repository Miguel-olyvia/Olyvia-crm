import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Plus, Trash2, ClipboardList, FileText, Receipt, FileSignature, Users,
  ChevronDown, ChevronUp, Zap, CheckCircle2, XCircle, Ban, Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

interface StageAction {
  id: string;
  organization_id: string;
  stage_id: string;
  action_type: string;
  action_config: Record<string, unknown>;
  is_active: boolean;
  execution_order: number;
}

interface Stage {
  id: string;
  name: string;
  color: string;
  label?: string;
}

interface Props {
  stages: Stage[];
  companyId: string | null;
  module: "deal" | "proposal" | "quote" | "contract";
  moduleLabel: string;
  pipelineOrder?: string[];
  onActionsChanged?: () => void;
}

const ALL_ACTIONS: Record<string, { label: string; icon: React.ReactNode; description: string }> = {
  create_proposal: {
    label: "Criar Proposta",
    icon: <FileText className="w-4 h-4 text-emerald-600" />,
    description: "Cria uma proposta em rascunho",
  },
  create_quote: {
    label: "Criar Orçamento",
    icon: <Receipt className="w-4 h-4 text-blue-600" />,
    description: "Cria um orçamento em rascunho",
  },
  create_contract: {
    label: "Criar Contrato",
    icon: <FileSignature className="w-4 h-4 text-purple-600" />,
    description: "Cria um contrato automaticamente",
  },
  create_deal: {
    label: "Criar Pedido",
    icon: <Briefcase className="w-4 h-4 text-primary" />,
    description: "Cria um pedido de proposta",
  },
  propagate_rejection: {
    label: "Propagar Rejeição",
    icon: <Ban className="w-4 h-4 text-red-600" />,
    description: "Move o Pedido para Desqualificado",
  },
  convert_to_client: {
    label: "Converter em Cliente",
    icon: <Users className="w-4 h-4 text-emerald-600" />,
    description: "Converte a entidade em cliente",
  },
  create_task: {
    label: "Criar Tarefa",
    icon: <ClipboardList className="w-4 h-4 text-amber-600" />,
    description: "Cria uma tarefa automática",
  },
};

const STEP_TO_CREATE_ACTION: Record<string, string> = {
  pedido: "create_deal",
  proposta: "create_proposal",
  orcamento: "create_quote",
  contrato: "create_contract",
  cliente: "convert_to_client",
};

const MODULE_TO_STEP: Record<string, string> = {
  deal: "pedido",
  proposal: "proposta",
  quote: "orcamento",
  contract: "contrato",
};

function getActionsForModule(
  module: string,
  pipelineOrder?: string[]
): Record<string, { label: string; icon: React.ReactNode; description: string }> {
  const result: Record<string, { label: string; icon: React.ReactNode; description: string }> = {};

  const order = pipelineOrder || ["pedido", "proposta", "orcamento", "contrato", "cliente"];
  const currentStep = MODULE_TO_STEP[module];
  const currentIndex = order.indexOf(currentStep);

  if (currentIndex >= 0) {
    for (let i = currentIndex + 1; i < order.length; i++) {
      const nextStep = order[i];
      const actionKey = STEP_TO_CREATE_ACTION[nextStep];
      if (actionKey && ALL_ACTIONS[actionKey]) {
        result[actionKey] = ALL_ACTIONS[actionKey];
        break;
      }
    }
  }

  if (module !== "deal") {
    result.propagate_rejection = ALL_ACTIONS.propagate_rejection;
  }
  result.create_task = ALL_ACTIONS.create_task;

  return result;
}

const TABLE_MAP: Record<string, string> = {
  deal: "deal_stage_actions",
  proposal: "proposal_stage_actions",
  quote: "quote_stage_actions",
  contract: "contract_stage_actions",
};

export function PipelineStageActionsConfig({ stages, companyId, module, moduleLabel, pipelineOrder, onActionsChanged }: Props) {
  const { toast } = useToast();
  const [actions, setActions] = useState<StageAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState("");
  const [selectedActionType, setSelectedActionType] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskType, setTaskType] = useState("follow_up");

  const tableName = TABLE_MAP[module];
  const actionLabels = getActionsForModule(module, pipelineOrder);

  const loadActions = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data, error } = await (supabase.from(tableName as any) as any)
      .select("*")
      .eq("organization_id", companyId)
      .order("execution_order");

    if (!error) {
      setActions(
        ((data as any[]) || []).map((a: any) => ({
          ...a,
          action_config: (a.action_config || {}) as Record<string, unknown>,
        }))
      );
    }
    setLoading(false);
  }, [companyId, tableName]);

  useEffect(() => {
    loadActions();
  }, [loadActions]);

  const handleAdd = async () => {
    if (!companyId || !selectedStageId || !selectedActionType) {
      toast({ title: "Selecione estágio e tipo de acção", variant: "destructive" });
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) throw new Error("User not authenticated");
    const businessUserId = await resolveCurrentBusinessUserId();
    if (!businessUserId) throw new Error("Business user not resolved");
    const config: Record<string, unknown> = {};

    if (selectedActionType === "create_task") {
      config.title = taskTitle || "Tarefa automática";
      config.type = taskType;
    }

    const { error } = await (supabase.from(tableName as any) as any).insert([{
      organization_id: companyId,
      stage_id: selectedStageId,
      action_type: selectedActionType,
      action_config: config,
      execution_order: actions.length,
      created_by: businessUserId,
    }]);

    if (error) {
      toast({ title: "Erro ao adicionar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Acção adicionada" });
      resetForm();
      loadActions();
      onActionsChanged?.();
    }
  };

  const handleToggle = async (action: StageAction) => {
    const { error } = await (supabase.from(tableName as any) as any)
      .update({ is_active: !action.is_active })
      .eq("id", action.id);
    if (!error) { loadActions(); onActionsChanged?.(); }
  };

  const handleDelete = async (id: string) => {
    const { error } = await (supabase.from(tableName as any) as any).delete().eq("id", id);
    if (!error) {
      toast({ title: "Acção removida" });
      loadActions();
      onActionsChanged?.();
    }
  };

  const resetForm = () => {
    setSelectedStageId("");
    setSelectedActionType("");
    setTaskTitle("");
    setTaskType("follow_up");
    setIsFormOpen(false);
  };

  const getStageName = (stageId: string) => {
    const s = stages.find((st) => st.id === stageId);
    return s?.label || s?.name || stageId;
  };

  const getStageColor = (stageId: string) => {
    const s = stages.find((st) => st.id === stageId);
    return s?.color || "#6b7280";
  };

  const actionsByStage = actions.reduce<Record<string, StageAction[]>>((acc, a) => {
    acc[a.stage_id] = acc[a.stage_id] || [];
    acc[a.stage_id].push(a);
    return acc;
  }, {});

  const displayLabels = { ...ALL_ACTIONS, ...actionLabels };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-16 bg-muted/50 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            Acções – {moduleLabel}
          </h4>
          <p className="text-xs text-muted-foreground">
            Automações quando o estado muda neste módulo
          </p>
        </div>
        <Button size="sm" onClick={() => setIsFormOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />
          Nova Acção
        </Button>
      </div>

      {Object.keys(actionsByStage).length === 0 && !isFormOpen ? (
        <Card>
          <CardContent className="py-6 text-center">
            <Zap className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhuma acção configurada para {moduleLabel}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {Object.entries(actionsByStage).map(([stageId, stageActions]) => (
            <Card key={stageId}>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getStageColor(stageId) }} />
                  <span className="font-medium text-sm">{getStageName(stageId)}</span>
                  <Badge variant="secondary" className="text-xs">{stageActions.length}</Badge>
                </div>
                <div className="space-y-1.5 pl-5">
                  {stageActions.map((action) => {
                    const meta = displayLabels[action.action_type];
                    return (
                      <div
                        key={action.id}
                        className={cn(
                          "flex items-center justify-between p-2 rounded-md border",
                          !action.is_active && "opacity-50"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          {action.is_active ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
                          )}
                          {meta?.icon}
                          <span className="text-sm">{meta?.label || action.action_type}</span>
                          {action.action_type === "create_task" && action.action_config?.title && (
                            <span className="text-xs text-muted-foreground">
                              — "{action.action_config.title as string}"
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Switch checked={action.is_active} onCheckedChange={() => handleToggle(action)} />
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(action.id)}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Collapsible open={isFormOpen} onOpenChange={setIsFormOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between" size="sm">
            Nova Acção
            {isFormOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="mt-2">
            <CardContent className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Fase *</Label>
                  <Select value={selectedStageId} onValueChange={setSelectedStageId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar fase..." />
                    </SelectTrigger>
                    <SelectContent>
                      {stages.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                            {s.label || s.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Tipo de Acção *</Label>
                  <Select value={selectedActionType} onValueChange={setSelectedActionType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar acção..." />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(actionLabels).map(([key, meta]) => (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            {meta.icon}
                            <div>
                              <span>{meta.label}</span>
                              <span className="text-xs text-muted-foreground ml-2">{meta.description}</span>
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {selectedActionType === "create_task" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Título da Tarefa</Label>
                    <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Ex: Follow-up" />
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select value={taskType} onValueChange={setTaskType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="follow_up">Follow-up</SelectItem>
                        <SelectItem value="call">Chamada</SelectItem>
                        <SelectItem value="meeting">Reunião</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="task">Tarefa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={resetForm}>Cancelar</Button>
                <Button size="sm" onClick={handleAdd}>Adicionar Acção</Button>
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
