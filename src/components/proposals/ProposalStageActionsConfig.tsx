import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Plus, Trash2, ClipboardList, Mail, Send,
  ChevronDown, ChevronUp, Zap, CheckCircle2, XCircle, FileSignature,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkflowStage {
  id: string;
  organization_id?: string | null;
  name: string;
  label: string;
  color: string;
  stage_order: number;
  is_final: boolean;
  is_won: boolean;
  is_lost: boolean;
  is_active: boolean;
}

interface StageAction {
  id: string;
  organization_id: string;
  stage_id: string;
  action_type: string;
  action_config: Record<string, unknown>;
  is_active: boolean;
  execution_order: number;
}

interface Props {
  stages: WorkflowStage[];
  companyId: string | null;
}

const ACTION_LABELS: Record<string, { label: string; icon: React.ReactNode; description: string }> = {
  create_task: {
    label: "Criar Tarefa",
    icon: <ClipboardList className="w-4 h-4 text-amber-600" />,
    description: "Cria uma atividade/tarefa automaticamente",
  },
  // Mantido apenas para rotular linhas já existentes na tabela (ver
  // SELECTABLE_ACTION_TYPES abaixo) — deixou de ser oferecido como opção nova.
  send_notification: {
    label: "Enviar Notificação",
    icon: <Send className="w-4 h-4 text-blue-600" />,
    description: "Envia uma notificação interna",
  },
  // Mantido apenas para rotular linhas já existentes na tabela (ver
  // SELECTABLE_ACTION_TYPES abaixo) — deixou de ser oferecido como opção nova:
  // o motor já dispara templates de email a cada mudança de fase da proposta
  // (execute-workflow → trigger-email-template, moduleMap proposal→proposals),
  // ter as duas portas duplicava envios para quem configurasse nas duas, e não
  // explicava nada para quem configurasse só aqui.
  send_email: {
    label: "Enviar Email",
    icon: <Mail className="w-4 h-4 text-purple-600" />,
    description: "Envia um email automático",
  },
  // Legacy/informational entry: the actual "aceite → cria contrato"
  // automation is hardcoded in execute-workflow (triggered by the stage's
  // is_won flag) and does not read this table — this row only labels it.
  create_contract: {
    label: "Criar Contrato",
    icon: <FileSignature className="w-4 h-4 text-emerald-600" />,
    description: "Regista a criação automática de contrato (executada pelo motor de workflow ao aceitar a proposta)",
  },
};

/**
 * Tipos de acção oferecidos ao criar uma acção NOVA. `ACTION_LABELS` acima é o
 * dicionário de apresentação (tem de continuar a cobrir tudo o que já exista
 * guardado na tabela, senão a lista passa a mostrar o `action_type` em cru);
 * esta é a lista do que pode ser escolhido.
 *
 * `send_notification` foi retirado da escolha: a string não aparece em lado
 * nenhum de `supabase/` — nem edge function, nem migração, nem trigger de BD.
 * Não existe nada que a execute, aqui ou noutro módulo.
 *
 * `send_email` foi retirado da escolha por uma razão diferente: existe, mas
 * está a mais. O motor (`supabase/functions/execute-workflow`) já chama
 * `trigger-email-template` a cada mudança de fase (moduleMap inclui
 * proposal→proposals) — uma proposta que muda de fase já dispara templates de
 * email por si só. Ter `send_email` escolhível aqui dava duas portas para a
 * mesma casa: configurar nos dois lados duplicava o envio, configurar só
 * aqui não fazia nada (esta tabela não é lida pelo motor para este tipo).
 *
 * `create_task` foi retirado da escolha pela razão original: o motor NÃO lê
 * esta tabela. Lê `lead_stage_actions`, `deal_stage_actions`,
 * `quote_stage_actions` e `contract_stage_actions` — nunca
 * `proposal_stage_actions`. Uma tarefa configurada aqui era gravada e nunca
 * criada. O `ai-assistant/tools/stage_actions.ts` já o dizia por escrito:
 * "proposal → proposal_stage_actions (READ-ONLY via agente — executor NÃO lê
 * esta tabela)".
 *
 * Sobra `create_contract`, e é o único que faz sentido oferecer: funciona, mas
 * NÃO por esta tabela — está fixo no código pela flag is_won da fase. As duas
 * regras guardadas hoje (uma delas numa organização com dados reais) são desse
 * tipo e continuam a funcionar como sempre funcionaram.
 *
 * Retirou-se a promessa, não se implementou a funcionalidade. Ligar esta
 * superfície ao motor é decisão de produto por tomar, não uma correcção — e
 * enquanto não for tomada, a interface passa a dizer a verdade sobre o que faz.
 */
const SELECTABLE_ACTION_TYPES = ["create_contract"] as const;

export function ProposalStageActionsConfig({ stages, companyId }: Props) {
  const { toast } = useToast();
  const [actions, setActions] = useState<StageAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState("");
  const [selectedActionType, setSelectedActionType] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskType, setTaskType] = useState("follow_up");

  const hasLoadedOnceRef = useRef(false);

  const loadActions = useCallback(async () => {
    if (!companyId) return;
    if (!hasLoadedOnceRef.current) setLoading(true);
    const { data, error } = await supabase
      .from("proposal_stage_actions" as any)
      .select("*")
      .eq("organization_id", companyId)
      .order("execution_order");

    if (!error) {
      setActions(
        ((data || []) as any[]).map((a: any) => ({
          ...a,
          action_config: (a.action_config || {}) as Record<string, unknown>,
        }))
      );
    }
    hasLoadedOnceRef.current = true;
      setLoading(false);
  }, [companyId]);

  useEffect(() => {
    loadActions();
  }, [loadActions]);

  const handleAdd = async () => {
    if (!companyId || !selectedStageId || !selectedActionType) {
      toast({ title: "Selecione fase e tipo de acção", variant: "destructive" });
      return;
    }

    const businessUserId = await resolveCurrentBusinessUserId();
    if (!businessUserId) {
      toast({ title: "Erro de identidade", description: "Não foi possível identificar o utilizador.", variant: "destructive" });
      return;
    }
    const config: Record<string, unknown> = {};

    if (selectedActionType === "create_task") {
      config.title = taskTitle || "Tarefa automática";
      config.type = taskType;
    }

    const { error } = await (supabase.from("proposal_stage_actions" as any) as any).insert([{
      organization_id: companyId,
      stage_id: selectedStageId,
      action_type: selectedActionType,
      action_config: config as any,
      execution_order: actions.length,
      created_by: businessUserId,
    }]);

    if (error) {
      toast({ title: "Erro ao adicionar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Acção adicionada" });
      resetForm();
      loadActions();
    }
  };

  const handleToggle = async (action: StageAction) => {
    const { error } = await (supabase.from("proposal_stage_actions" as any) as any)
      .update({ is_active: !action.is_active })
      .eq("id", action.id);
    if (!error) loadActions();
  };

  const handleDelete = async (id: string) => {
    const { error } = await (supabase.from("proposal_stage_actions" as any) as any).delete().eq("id", id);
    if (!error) {
      toast({ title: "Acção removida" });
      loadActions();
    }
  };

  const resetForm = () => {
    setSelectedStageId("");
    setSelectedActionType("");
    setTaskTitle("");
    setTaskType("follow_up");
    setIsFormOpen(false);
  };

  const getStageName = (stageId: string) => stages.find((s) => s.id === stageId)?.label || "Fase removida";
  const getStageColor = (stageId: string) => stages.find((s) => s.id === stageId)?.color || "#6b7280";
  // Only offer active stages as a target for a NEW action — stages is the
  // full (active + inactive) list, needed above just to resolve labels for
  // actions already tied to a deactivated stage.
  const activeStages = stages.filter((s) => s.is_active);

  const actionsByStage = actions.reduce<Record<string, StageAction[]>>((acc, a) => {
    acc[a.stage_id] = acc[a.stage_id] || [];
    acc[a.stage_id].push(a);
    return acc;
  }, {});

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
            Acções por Fase
          </h4>
          <p className="text-xs text-muted-foreground">
            Configure tarefas e notificações automáticas quando uma proposta entra numa fase
          </p>
        </div>
        <Button size="sm" onClick={() => setIsFormOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />
          Nova Acção
        </Button>
      </div>

      {Object.keys(actionsByStage).length === 0 && !isFormOpen ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Zap className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Nenhuma acção automática configurada</p>
            <p className="text-xs text-muted-foreground mt-1">
              Adicione acções para automatizar tarefas e notificações
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {Object.entries(actionsByStage).map(([stageId, stageActions]) => (
            <Card key={stageId}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getStageColor(stageId) }} />
                  <span className="font-medium text-sm">{getStageName(stageId)}</span>
                  <Badge variant="secondary" className="text-xs">{stageActions.length}</Badge>
                </div>
                <div className="space-y-2 pl-5">
                  {stageActions.map((action) => {
                    const meta = ACTION_LABELS[action.action_type];
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
                      {activeStages.map((s) => (
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
                <div className="space-y-2">
                  <Label>Tipo de Acção *</Label>
                  <Select value={selectedActionType} onValueChange={setSelectedActionType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar acção..." />
                    </SelectTrigger>
                    <SelectContent>
                      {SELECTABLE_ACTION_TYPES.map((key) => (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            {ACTION_LABELS[key].icon}
                            {ACTION_LABELS[key].label}
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
                    <Input
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      placeholder="Ex: Revisão da proposta"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select value={taskType} onValueChange={setTaskType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
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
