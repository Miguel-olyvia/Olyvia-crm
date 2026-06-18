import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, Pencil, Trash2, ArrowRight, Zap, AlertCircle, 
  CheckCircle2, XCircle, ChevronDown, ChevronUp 
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface WorkflowAutomationRule {
  id: string;
  organization_id: string | null;
  name: string;
  description: string | null;
  is_active: boolean;
  source_entity: string;
  trigger_type: string;
  trigger_stage_id: string | null;
  trigger_conditions: Record<string, unknown>;
  target_entity: string;
  action_type: string;
  action_stage_id: string | null;
  action_config: Record<string, unknown>;
  relationship_field: string | null;
  execution_order: number;
}

interface WorkflowStage {
  id: string;
  name: string;
  label: string;
  color: string;
  is_final: boolean;
  is_won: boolean;
  is_lost: boolean;
}

interface LeadStage {
  id: string;
  name: string;
  label: string;
  color: string;
}

interface DealStage {
  id: string;
  name: string;
  label: string;
  color: string;
}

interface Props {
  companyId?: string;
  sourceEntity: "proposal" | "lead" | "deal";
  workflowStages: WorkflowStage[];
}

const ENTITY_LABELS: Record<string, string> = {
  proposal: "Proposta",
  lead: "Lead",
  deal: "Negócio",
};

const TRIGGER_TYPES: Record<string, string> = {
  stage_change: "Mudança de Fase",
  create: "Quando Criado",
  update: "Quando Atualizado",
};

const ACTION_TYPES: Record<string, string> = {
  change_stage: "Mudar Fase",
  update_field: "Atualizar Campo",
  send_notification: "Enviar Notificação",
};

const RELATIONSHIP_FIELDS: Record<string, Record<string, string>> = {
  proposal: {
    lead: "lead_id",
    deal: "deal_id",
  },
  deal: {
    lead: "lead_id",
  },
  lead: {},
};

export function WorkflowAutomationRules({ companyId, sourceEntity, workflowStages }: Props) {
  const [rules, setRules] = useState<WorkflowAutomationRule[]>([]);
  const [leadStages, setLeadStages] = useState<LeadStage[]>([]);
  const [dealStages, setDealStages] = useState<DealStage[]>([]);
  const [proposalStages, setProposalStages] = useState<WorkflowStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<WorkflowAutomationRule | null>(null);
  const { toast } = useToast();

  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    is_active: boolean;
    source_entity: string;
    trigger_type: string;
    trigger_stage_id: string;
    target_entity: string;
    action_type: string;
    action_stage_id: string;
    relationship_field: string;
  }>({
    name: "",
    description: "",
    is_active: true,
    source_entity: sourceEntity,
    trigger_type: "stage_change",
    trigger_stage_id: "",
    target_entity: "",
    action_type: "change_stage",
    action_stage_id: "",
    relationship_field: "",
  });

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      // Load automation rules
      const { data: rulesData, error } = await supabase
        .from("workflow_automation_rules")
        .select("*")
        .or(`organization_id.eq.${companyId},organization_id.is.null`)
        .eq("source_entity", sourceEntity)
        .order("execution_order");

      if (error) throw error;
      
      // Type assertion since we know the structure
      const typedRules = (rulesData || []).map(rule => ({
        ...rule,
        trigger_conditions: (rule.trigger_conditions || {}) as Record<string, unknown>,
        action_config: (rule.action_config || {}) as Record<string, unknown>,
      })) as unknown as WorkflowAutomationRule[];
      
      setRules(typedRules);

      // Load lead workflow stages
      const { data: leadStagesData } = await supabase
        .from("lead_workflow_stages")
        .select("id, name, label, color")
        .or(`organization_id.eq.${companyId},organization_id.is.null`)
        .eq("is_active", true)
        .order("stage_order");
      
      setLeadStages(leadStagesData || []);

      // Load proposal workflow stages  
      const { data: proposalStagesData } = await supabase
        .from("proposal_workflow_stages")
        .select("id, name, label, color, is_final, is_won, is_lost")
        .or(`organization_id.eq.${companyId},organization_id.is.null`)
        .eq("is_active", true)
        .order("stage_order");
      
      setProposalStages(proposalStagesData || []);

      // TODO: Load deal workflow stages when they exist
      // For now, use static deal stages
      setDealStages([
        { id: "new", name: "new", label: "Novo", color: "#3b82f6" },
        { id: "negotiation", name: "negotiation", label: "Negociação", color: "#f59e0b" },
        { id: "won", name: "won", label: "Ganho", color: "#22c55e" },
        { id: "lost", name: "lost", label: "Perdido", color: "#ef4444" },
      ]);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar regras",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [companyId, sourceEntity, toast]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const getStagesForEntity = (entity: string) => {
    switch (entity) {
      case "lead":
        return leadStages;
      case "proposal":
        return proposalStages;
      case "deal":
        return dealStages;
      default:
        return [];
    }
  };

  const getStageLabelById = (entity: string, stageId: string | null) => {
    if (!stageId) return "-";
    const stages = getStagesForEntity(entity);
    const stage = stages.find(s => s.id === stageId);
    return stage?.label || stageId;
  };

  const getStageColorById = (entity: string, stageId: string | null) => {
    if (!stageId) return "#6b7280";
    const stages = getStagesForEntity(entity);
    const stage = stages.find(s => s.id === stageId);
    return stage?.color || "#6b7280";
  };

  const handleEdit = (rule: WorkflowAutomationRule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      description: rule.description || "",
      is_active: rule.is_active,
      source_entity: rule.source_entity,
      trigger_type: rule.trigger_type,
      trigger_stage_id: rule.trigger_stage_id || "",
      target_entity: rule.target_entity,
      action_type: rule.action_type,
      action_stage_id: rule.action_stage_id || "",
      relationship_field: rule.relationship_field || "",
    });
    setIsFormOpen(true);
  };

  const handleDelete = async (ruleId: string) => {
    try {
      const { error } = await supabase
        .from("workflow_automation_rules")
        .delete()
        .eq("id", ruleId);

      if (error) throw error;

      toast({ title: "Regra eliminada com sucesso" });
      loadRules();
    } catch (error: any) {
      toast({
        title: "Erro ao eliminar regra",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleToggleActive = async (rule: WorkflowAutomationRule) => {
    try {
      const { error } = await supabase
        .from("workflow_automation_rules")
        .update({ is_active: !rule.is_active })
        .eq("id", rule.id);

      if (error) throw error;

      toast({ title: rule.is_active ? "Regra desativada" : "Regra ativada" });
      loadRules();
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar regra",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.target_entity) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }

    try {
      const ruleData = {
        organization_id: companyId,
        name: formData.name,
        description: formData.description || null,
        is_active: formData.is_active,
        source_entity: formData.source_entity,
        trigger_type: formData.trigger_type,
        trigger_stage_id: formData.trigger_stage_id || null,
        target_entity: formData.target_entity,
        action_type: formData.action_type,
        action_stage_id: formData.action_stage_id || null,
        relationship_field: formData.relationship_field || RELATIONSHIP_FIELDS[formData.source_entity]?.[formData.target_entity] || null,
        execution_order: editingRule ? editingRule.execution_order : rules.length,
      };

      if (editingRule) {
        const { error } = await supabase
          .from("workflow_automation_rules")
          .update(ruleData)
          .eq("id", editingRule.id);
        if (error) throw error;
        toast({ title: "Regra atualizada" });
      } else {
        const { error } = await supabase
          .from("workflow_automation_rules")
          .insert(ruleData);
        if (error) throw error;
        toast({ title: "Regra criada" });
      }

      resetForm();
      loadRules();
    } catch (error: any) {
      toast({
        title: "Erro ao guardar regra",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setEditingRule(null);
    setFormData({
      name: "",
      description: "",
      is_active: true,
      source_entity: sourceEntity,
      trigger_type: "stage_change",
      trigger_stage_id: "",
      target_entity: "",
      action_type: "change_stage",
      action_stage_id: "",
      relationship_field: "",
    });
    setIsFormOpen(false);
  };

  // Get available target entities
  const getAvailableTargets = () => {
    return Object.keys(RELATIONSHIP_FIELDS[sourceEntity] || {}).map(entity => ({
      value: entity,
      label: ENTITY_LABELS[entity],
    }));
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map(i => (
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
            Regras de Automação
          </h4>
          <p className="text-xs text-muted-foreground">
            Configure ações automáticas quando o estado mudar
          </p>
        </div>
        <Button size="sm" onClick={() => setIsFormOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />
          Nova Regra
        </Button>
      </div>

      {/* Rules list */}
      {rules.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Nenhuma regra de automação configurada</p>
            <p className="text-xs text-muted-foreground mt-1">
              Adicione regras para automatizar ações entre entidades
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <Card 
              key={rule.id} 
              className={cn(
                "transition-all",
                !rule.is_active && "opacity-60",
                rule.organization_id === null && "border-dashed"
              )}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {rule.is_active ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-muted-foreground" />
                      )}
                      <span className="font-medium">{rule.name}</span>
                      {rule.organization_id === null && (
                        <Badge variant="outline" className="text-xs">Template</Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm">
                      <Badge 
                        variant="secondary"
                        style={{ 
                          backgroundColor: getStageColorById(rule.source_entity, rule.trigger_stage_id) + '20',
                          color: getStageColorById(rule.source_entity, rule.trigger_stage_id),
                        }}
                      >
                        {ENTITY_LABELS[rule.source_entity]}: {getStageLabelById(rule.source_entity, rule.trigger_stage_id)}
                      </Badge>
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      <Badge 
                        variant="secondary"
                        style={{ 
                          backgroundColor: getStageColorById(rule.target_entity, rule.action_stage_id) + '20',
                          color: getStageColorById(rule.target_entity, rule.action_stage_id),
                        }}
                      >
                        {ENTITY_LABELS[rule.target_entity]}: {getStageLabelById(rule.target_entity, rule.action_stage_id)}
                      </Badge>
                    </div>
                    
                    {rule.description && (
                      <p className="text-xs text-muted-foreground mt-2">{rule.description}</p>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={rule.is_active}
                      onCheckedChange={() => handleToggleActive(rule)}
                    />
                    {rule.organization_id && (
                      <>
                        <Button size="icon" variant="ghost" onClick={() => handleEdit(rule)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handleDelete(rule.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit form */}
      <Collapsible open={isFormOpen} onOpenChange={setIsFormOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between" size="sm">
            {editingRule ? "Editar Regra" : "Nova Regra"}
            {isFormOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="mt-2">
            <CardContent className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label>Nome da Regra *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: Proposta Perdida → Lead Perdida"
                  />
                </div>
                
                <div className="col-span-2 space-y-2">
                  <Label>Descrição</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Descreva o que esta regra faz..."
                    rows={2}
                  />
                </div>

                <Separator className="col-span-2" />

                {/* Trigger configuration */}
                <div className="col-span-2">
                  <Label className="text-xs uppercase text-muted-foreground tracking-wide">Quando</Label>
                </div>

                <div className="space-y-2">
                  <Label>Tipo de Trigger</Label>
                  <Select 
                    value={formData.trigger_type} 
                    onValueChange={(value) => setFormData({ ...formData, trigger_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TRIGGER_TYPES).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {formData.trigger_type === "stage_change" && (
                  <div className="space-y-2">
                    <Label>Fase de {ENTITY_LABELS[sourceEntity]}</Label>
                    <Select 
                      value={formData.trigger_stage_id} 
                      onValueChange={(value) => setFormData({ ...formData, trigger_stage_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar fase..." />
                      </SelectTrigger>
                      <SelectContent>
                        {workflowStages.map((stage) => (
                          <SelectItem key={stage.id} value={stage.id}>
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: stage.color }}
                              />
                              {stage.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <Separator className="col-span-2" />

                {/* Action configuration */}
                <div className="col-span-2">
                  <Label className="text-xs uppercase text-muted-foreground tracking-wide">Então</Label>
                </div>

                <div className="space-y-2">
                  <Label>Entidade Alvo *</Label>
                  <Select 
                    value={formData.target_entity} 
                    onValueChange={(value) => setFormData({ ...formData, target_entity: value, action_stage_id: "" })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar entidade..." />
                    </SelectTrigger>
                    <SelectContent>
                      {getAvailableTargets().map((target) => (
                        <SelectItem key={target.value} value={target.value}>
                          {target.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Tipo de Ação</Label>
                  <Select 
                    value={formData.action_type} 
                    onValueChange={(value) => setFormData({ ...formData, action_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ACTION_TYPES).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {formData.action_type === "change_stage" && formData.target_entity && (
                  <div className="col-span-2 space-y-2">
                    <Label>Nova Fase de {ENTITY_LABELS[formData.target_entity]}</Label>
                    <Select 
                      value={formData.action_stage_id} 
                      onValueChange={(value) => setFormData({ ...formData, action_stage_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar fase..." />
                      </SelectTrigger>
                      <SelectContent>
                        {getStagesForEntity(formData.target_entity).map((stage) => (
                          <SelectItem key={stage.id} value={stage.id}>
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: stage.color }}
                              />
                              {stage.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="col-span-2 flex items-center gap-2">
                  <Switch
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                  <Label>Regra ativa</Label>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={resetForm}>
                  Cancelar
                </Button>
                <Button onClick={handleSubmit}>
                  {editingRule ? "Guardar" : "Criar Regra"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
