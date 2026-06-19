import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Pencil, Trash2, ArrowRight, GitBranch } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "@/hooks/useTranslation";
import { Textarea } from "@/components/ui/textarea";

interface RoutingRule {
  id: string;
  campaign_id: string;
  name: string;
  description: string | null;
  field_key: string;
  operator: string;
  field_value: string;
  action_type: string;
  target_organization_id: string | null;
  target_employee_id: string | null;
  target_status: string | null;
  target_priority: string | null;
  priority: number;
  is_active: boolean;
  stop_on_match: boolean;
}

interface FieldDefinition {
  id: string;
  field_key: string;
  field_label: string;
  field_type: string;
  options: any;
}

interface OrgOption {
  id: string;
  name: string;
  type: string;
}

interface CampaignRoutingRulesProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignName: string;
  companyId: string;
}

const OPERATORS = [
  { value: "equals", label: "é igual a" },
  { value: "not_equals", label: "é diferente de" },
  { value: "contains", label: "contém" },
  { value: "not_contains", label: "não contém" },
  { value: "in_list", label: "está na lista" },
];

const ACTION_TYPES = [
  { value: "assign_organization", label: "Atribuir a Organização" },
  { value: "assign_employee", label: "Atribuir a Colaborador" },
  { value: "set_status", label: "Definir Estado" },
  { value: "set_priority", label: "Definir Prioridade" },
];

const LEAD_STATUSES = [
  { value: "new", label: "Novo" },
  { value: "contacted", label: "Contactado" },
  { value: "qualified", label: "Qualificado" },
  { value: "proposal", label: "Proposta" },
  { value: "won", label: "Ganho" },
  { value: "lost", label: "Perdido" },
];

const PRIORITIES = [
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Média" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" },
];

export function CampaignRoutingRules({
  open,
  onOpenChange,
  campaignId,
  campaignName,
  companyId,
}: CampaignRoutingRulesProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [organizations, setOrganizations] = useState<OrgOption[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [editingRule, setEditingRule] = useState<Partial<RoutingRule> | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (open && campaignId) {
      loadRules();
      loadFields();
      loadTargetOptions();
    }
  }, [open, campaignId]);

  const loadRules = async () => {
    const { data, error } = await supabase
      .from("campaign_routing_rules")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("priority", { ascending: false });

    if (!error && data) {
      setRules(data as RoutingRule[]);
    }
  };

  const loadFields = async () => {
    const { data: campaignData, error: campaignError } = await supabase
      .from("campaigns")
      .select("form_id")
      .eq("id", campaignId)
      .single();

    if (campaignError || !campaignData?.form_id) {
      const { data, error } = await supabase
        .from("lead_field_definitions")
        .select("id, field_key, field_label, field_type, options")
        .eq("campaign_id", campaignId)
        .eq("is_active", true)
        .order("sort_order");

      if (!error && data) setFields(data);
      return;
    }

    const { data: formFields, error } = await supabase
      .from("form_fields")
      .select("id, field_key, field_label, field_type, options")
      .eq("form_id", campaignData.form_id)
      .eq("is_active", true)
      .order("sort_order");

    if (!error && formFields) setFields(formFields);
  };

  const loadTargetOptions = async () => {
    // Load all descendant organizations recursively from hierarchy
    const collectDescendants = async (parentId: string, collected: OrgOption[]) => {
      const { data } = await supabase
        .from("anew_hierarchy")
        .select("child_org_id, anew_organizations!anew_hierarchy_child_org_id_fkey(id, name, type)")
        .eq("parent_org_id", parentId) as any;

      if (!data) return;
      for (const h of data) {
        const org = h.anew_organizations;
        if (org && !collected.find(o => o.id === org.id)) {
          collected.push({ id: org.id, name: org.name, type: org.type });
          await collectDescendants(org.id, collected);
        }
      }
    };

    const orgs: OrgOption[] = [];
    await collectDescendants(companyId, orgs);
    setOrganizations(orgs);

    // Load employees from memberships
    const empResult = await supabase
      .from("anew_memberships")
      .select("user_id, anew_users!inner(id, name)")
      .eq("organization_id", companyId)
      .eq("status", "active") as any;
    if (empResult.data) {
      setEmployees(empResult.data.map((e: any) => ({
        id: e.anew_users?.id,
        name: e.anew_users?.name || ''
      })).filter((e: any) => e.id));
    }
  };

  const getFieldOptions = (fieldKey: string): string[] => {
    const field = fields.find(f => f.field_key === fieldKey);
    if (!field?.options) return [];
    if (Array.isArray(field.options)) return field.options;
    if (field.options.options && Array.isArray(field.options.options)) return field.options.options;
    return [];
  };

  const handleSaveRule = async () => {
    if (!editingRule?.name || !editingRule?.field_key || !editingRule?.field_value) {
      toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }

    const ruleData = {
      campaign_id: campaignId,
      organization_id: companyId,
      name: editingRule.name,
      description: editingRule.description || null,
      field_key: editingRule.field_key,
      operator: editingRule.operator || "equals",
      field_value: editingRule.field_value,
      action_type: editingRule.action_type || "assign_organization",
      target_organization_id: editingRule.target_organization_id || null,
      target_employee_id: editingRule.target_employee_id || null,
      target_status: editingRule.target_status || null,
      target_priority: editingRule.target_priority || null,
      priority: editingRule.priority || 0,
      is_active: editingRule.is_active !== false,
      stop_on_match: editingRule.stop_on_match || false,
    };

    let error;
    if (editingRule.id) {
      const result = await supabase
        .from("campaign_routing_rules")
        .update(ruleData)
        .eq("id", editingRule.id);
      error = result.error;
    } else {
      const result = await supabase
        .from("campaign_routing_rules")
        .insert(ruleData);
      error = result.error;
    }

    if (error) {
      toast({ title: "Erro ao guardar regra", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editingRule.id ? "Regra atualizada" : "Regra criada" });
      setEditingRule(null);
      setIsCreating(false);
      loadRules();
    }
  };

  const handleDeleteRule = async (id: string) => {
    const { error } = await supabase
      .from("campaign_routing_rules")
      .delete()
      .eq("id", id);

    if (error) {
      toast({ title: "Erro ao eliminar regra", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Regra eliminada" });
      loadRules();
    }
  };

  const handleToggleActive = async (rule: RoutingRule) => {
    const { error } = await supabase
      .from("campaign_routing_rules")
      .update({ is_active: !rule.is_active })
      .eq("id", rule.id);

    if (!error) loadRules();
  };

  const getActionLabel = (rule: RoutingRule): string => {
    switch (rule.action_type) {
      case "assign_organization": {
        const org = organizations.find(o => o.id === rule.target_organization_id);
        return org ? `→ ${org.name} (${org.type})` : "→ Organização não encontrada";
      }
      case "assign_employee": {
        const emp = employees.find(e => e.id === rule.target_employee_id);
        return emp ? `→ ${emp.name}` : "→ Colaborador não encontrado";
      }
      case "set_status":
        return `→ Estado: ${rule.target_status}`;
      case "set_priority":
        return `→ Prioridade: ${rule.target_priority}`;
      default:
        return "";
    }
  };

  const getOperatorLabel = (op: string): string => {
    return OPERATORS.find(o => o.value === op)?.label || op;
  };

  // Group organizations by type for the selector
  const orgsByType = organizations.reduce<Record<string, OrgOption[]>>((acc, org) => {
    const type = org.type || "Outro";
    if (!acc[type]) acc[type] = [];
    acc[type].push(org);
    return acc;
  }, {});

  const renderRuleForm = () => {
    if (!editingRule) return null;

    const fieldOptions = getFieldOptions(editingRule.field_key || "");

    return (
      <Card className="border-primary/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {editingRule.id ? "Editar Regra" : "Nova Regra de Routing"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Nome da Regra *</Label>
              <Input
                value={editingRule.name || ""}
                onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })}
                placeholder="Ex: Leads WC para Equipa Remodelações"
              />
            </div>
            <div>
              <Label>Prioridade</Label>
              <Input
                type="number"
                value={editingRule.priority || 0}
                onChange={(e) => setEditingRule({ ...editingRule, priority: parseInt(e.target.value) || 0 })}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground mt-1">Maior número = maior prioridade</p>
            </div>
          </div>

          <div>
            <Label>Descrição</Label>
            <Textarea
              value={editingRule.description || ""}
              onChange={(e) => setEditingRule({ ...editingRule, description: e.target.value })}
              placeholder="Descrição opcional da regra..."
              rows={2}
            />
          </div>

          {/* Condition */}
          <div className="p-4 bg-muted/50 rounded-lg space-y-3">
            <Label className="text-sm font-semibold uppercase text-muted-foreground">SE (Condição)</Label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Campo</Label>
                <Select
                  value={editingRule.field_key || ""}
                  onValueChange={(v) => setEditingRule({ ...editingRule, field_key: v, field_value: "" })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione campo" />
                  </SelectTrigger>
                  <SelectContent>
                    {fields.map((f) => (
                      <SelectItem key={f.field_key} value={f.field_key}>
                        {f.field_label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Operador</Label>
                <Select
                  value={editingRule.operator || "equals"}
                  onValueChange={(v) => setEditingRule({ ...editingRule, operator: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATORS.map((op) => (
                      <SelectItem key={op.value} value={op.value}>
                        {op.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Valor</Label>
                {fieldOptions.length > 0 ? (
                  <Select
                    value={editingRule.field_value || ""}
                    onValueChange={(v) => setEditingRule({ ...editingRule, field_value: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione valor" />
                    </SelectTrigger>
                    <SelectContent>
                      {fieldOptions.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={editingRule.field_value || ""}
                    onChange={(e) => setEditingRule({ ...editingRule, field_value: e.target.value })}
                    placeholder="Valor"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Action */}
          <div className="p-4 bg-primary/5 rounded-lg space-y-3">
            <Label className="text-sm font-semibold uppercase text-muted-foreground">ENTÃO (Ação)</Label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo de Ação</Label>
                <Select
                  value={editingRule.action_type || "assign_organization"}
                  onValueChange={(v) => setEditingRule({ 
                    ...editingRule, 
                    action_type: v,
                    target_organization_id: null,
                    target_employee_id: null,
                    target_status: null,
                    target_priority: null,
                  })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTION_TYPES.map((at) => (
                      <SelectItem key={at.value} value={at.value}>
                        {at.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Destino</Label>
                {editingRule.action_type === "assign_organization" && (
                  <Select
                    value={editingRule.target_organization_id || ""}
                    onValueChange={(v) => setEditingRule({ ...editingRule, target_organization_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione organização" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(orgsByType).map(([type, orgs]) => (
                        <SelectGroup key={type}>
                          <SelectLabel className="capitalize">{type}</SelectLabel>
                          {orgs.map((org) => (
                            <SelectItem key={org.id} value={org.id}>
                              {org.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {editingRule.action_type === "assign_employee" && (
                  <Select
                    value={editingRule.target_employee_id || ""}
                    onValueChange={(v) => setEditingRule({ ...editingRule, target_employee_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione colaborador" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {editingRule.action_type === "set_status" && (
                  <Select
                    value={editingRule.target_status || ""}
                    onValueChange={(v) => setEditingRule({ ...editingRule, target_status: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione estado" />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {editingRule.action_type === "set_priority" && (
                  <Select
                    value={editingRule.target_priority || ""}
                    onValueChange={(v) => setEditingRule({ ...editingRule, target_priority: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione prioridade" />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>

          {/* Options */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch
                checked={editingRule.is_active !== false}
                onCheckedChange={(v) => setEditingRule({ ...editingRule, is_active: v })}
              />
              <Label>Regra Ativa</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={editingRule.stop_on_match || false}
                onCheckedChange={(v) => setEditingRule({ ...editingRule, stop_on_match: v })}
              />
              <Label>Parar se corresponder</Label>
              <p className="text-xs text-muted-foreground">(Não avaliar outras regras)</p>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => { setEditingRule(null); setIsCreating(false); }}>
              Cancelar
            </Button>
            <Button onClick={handleSaveRule}>
              {editingRule.id ? "Guardar Alterações" : "Criar Regra"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="w-5 h-5" />
            Regras de Routing - {campaignName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Configure regras para encaminhar automaticamente os leads com base nas respostas do formulário.
            As regras são avaliadas por ordem de prioridade (maior primeiro).
          </p>

          {!isCreating && !editingRule && (
            <Button
              onClick={() => {
                setIsCreating(true);
                setEditingRule({
                  operator: "equals",
                  action_type: "assign_organization",
                  is_active: true,
                  priority: rules.length,
                });
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Regra
            </Button>
          )}

          {(isCreating || editingRule) && renderRuleForm()}

          <div className="space-y-2">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
              Regras Configuradas ({rules.length})
            </h4>

            {rules.length === 0 && !isCreating ? (
              <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                <GitBranch className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Nenhuma regra configurada.</p>
                <p className="text-sm">Adicione regras para encaminhar leads automaticamente.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {rules.map((rule, index) => {
                  const field = fields.find(f => f.field_key === rule.field_key);
                  
                  return (
                    <div
                      key={rule.id}
                      className={`flex items-center justify-between p-4 border rounded-lg transition-colors ${
                        rule.is_active ? "hover:bg-muted/50" : "opacity-60 bg-muted/30"
                      }`}
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <Badge variant="outline" className="text-xs">
                          #{index + 1}
                        </Badge>
                        <div className="flex-1">
                          <div className="font-medium">{rule.name}</div>
                          <div className="text-sm text-muted-foreground flex items-center gap-1 flex-wrap">
                            <span>SE</span>
                            <Badge variant="secondary">{field?.field_label || rule.field_key}</Badge>
                            <span>{getOperatorLabel(rule.operator)}</span>
                            <Badge variant="secondary">{rule.field_value}</Badge>
                            <ArrowRight className="w-4 h-4 mx-1" />
                            <Badge variant="default">{getActionLabel(rule)}</Badge>
                          </div>
                          {rule.description && (
                            <p className="text-xs text-muted-foreground mt-1">{rule.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={rule.is_active}
                          onCheckedChange={() => handleToggleActive(rule)}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingRule(rule)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteRule(rule.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
