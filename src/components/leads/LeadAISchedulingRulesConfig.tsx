import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Sparkles, MapPin, Users,
  Plus, Trash2, Save, RefreshCw,
  Brain, Timer, Megaphone
} from "lucide-react";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

interface AISchedulingRule {
  id: string;
  organization_id: string | null;
  campaign_id: string | null;
  name: string;
  description: string | null;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  min_visit_duration_minutes: number;
  max_visits_per_day_per_employee: number;
  max_visits_per_week_per_employee: number;
  earliest_start_time: string;
  latest_end_time: string;
  allowed_weekdays: number[];
  use_postal_code_proximity: boolean;
  max_distance_km: number;
  prioritize_nearest: boolean;
  balance_workload: boolean;
  workload_weight_percent: number;
  ai_system_prompt: string | null;
  ai_considerations: string[] | null;
  is_active: boolean;
  priority: number;
  created_at: string;
}

interface Campaign {
  id: string;
  name: string;
  has_ai_scheduling: boolean;
}

interface LeadAISchedulingRulesConfigProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  campaignId?: string | null;
  onRulesUpdated?: () => void;
}

const WEEKDAYS = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
];

const DEFAULT_RULES: Partial<AISchedulingRule> = {
  name: "Regras de Agendamento",
  description: null,
  buffer_before_minutes: 120,
  buffer_after_minutes: 30,
  min_visit_duration_minutes: 60,
  max_visits_per_day_per_employee: 6,
  max_visits_per_week_per_employee: 25,
  earliest_start_time: "09:00",
  latest_end_time: "18:00",
  allowed_weekdays: [1, 2, 3, 4, 5],
  use_postal_code_proximity: true,
  max_distance_km: 50,
  prioritize_nearest: true,
  balance_workload: true,
  workload_weight_percent: 40,
  ai_system_prompt: null,
  ai_considerations: [],
  is_active: true,
  priority: 1
};

export function LeadAISchedulingRulesConfig({
  open,
  onOpenChange,
  companyId,
  campaignId: initialCampaignId,
  onRulesUpdated
}: LeadAISchedulingRulesConfigProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rules, setRules] = useState<AISchedulingRule | null>(null);
  const [templateRules, setTemplateRules] = useState<AISchedulingRule | null>(null);
  const [isUsingTemplate, setIsUsingTemplate] = useState(false);
  const [newConsideration, setNewConsideration] = useState("");
  
  // Campaign selection
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(initialCampaignId || null);

  useEffect(() => {
    if (open && companyId) {
      loadCampaigns();
    }
  }, [open, companyId]);

  useEffect(() => {
    if (open && selectedCampaignId) {
      loadRules();
    } else if (open && !selectedCampaignId) {
      setRules(null);
      setIsUsingTemplate(false);
    }
  }, [open, selectedCampaignId]);

  const loadCampaigns = async () => {
    if (!companyId) return;
    
    const { data } = await supabase
      .from("campaigns")
      .select("id, name, has_ai_scheduling")
      .eq("organization_id", companyId)
      .order("name");
    
    setCampaigns(data || []);
    
    // If initial campaign provided, select it
    if (initialCampaignId) {
      setSelectedCampaignId(initialCampaignId);
    }
  };

  const loadRules = async () => {
    if (!companyId || !selectedCampaignId) return;
    setLoading(true);

    // Load campaign-specific rules
    const { data: campaignRules } = await supabase
      .from("lead_ai_scheduling_rules")
      .select("*")
      .eq("campaign_id", selectedCampaignId)
      .eq("is_active", true)
      .order("priority", { ascending: false })
      .limit(1)
      .single();

    // Load template rules (organization_id and campaign_id are null)
    const { data: template } = await supabase
      .from("lead_ai_scheduling_rules")
      .select("*")
      .is("organization_id", null)
      .is("campaign_id", null)
      .eq("is_active", true)
      .order("priority", { ascending: false })
      .limit(1)
      .single();

    if (campaignRules) {
      setRules(campaignRules as unknown as AISchedulingRule);
      setIsUsingTemplate(false);
    } else if (template) {
      setTemplateRules(template as unknown as AISchedulingRule);
      setRules({ 
        ...template, 
        organization_id: companyId, 
        campaign_id: selectedCampaignId 
      });
      setIsUsingTemplate(true);
    } else {
      // No template exists, use defaults
      setRules({
        ...DEFAULT_RULES,
        id: '',
        organization_id: companyId,
        campaign_id: selectedCampaignId,
        created_at: new Date().toISOString()
      } as AISchedulingRule);
      setIsUsingTemplate(true);
    }

    setLoading(false);
  };

  const handleSave = async () => {
    if (!rules || !companyId || !selectedCampaignId) return;
    setSaving(true);

    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");

      if (isUsingTemplate || !rules.id) {
        // Create new campaign-specific rules
        const { error } = await supabase
          .from("lead_ai_scheduling_rules")
          .insert({
            organization_id: companyId,
            campaign_id: selectedCampaignId,
            name: rules.name,
            description: rules.description,
            buffer_before_minutes: rules.buffer_before_minutes,
            buffer_after_minutes: rules.buffer_after_minutes,
            min_visit_duration_minutes: rules.min_visit_duration_minutes,
            max_visits_per_day_per_employee: rules.max_visits_per_day_per_employee,
            max_visits_per_week_per_employee: rules.max_visits_per_week_per_employee,
            earliest_start_time: rules.earliest_start_time,
            latest_end_time: rules.latest_end_time,
            allowed_weekdays: rules.allowed_weekdays,
            use_postal_code_proximity: rules.use_postal_code_proximity,
            max_distance_km: rules.max_distance_km,
            prioritize_nearest: rules.prioritize_nearest,
            balance_workload: rules.balance_workload,
            workload_weight_percent: rules.workload_weight_percent,
            ai_system_prompt: rules.ai_system_prompt,
            ai_considerations: rules.ai_considerations,
            is_active: true,
            priority: 1,
            created_by: businessUserId
          });

        if (error) throw error;

        // Update campaign to enable AI scheduling
        await supabase
          .from("campaigns")
          .update({ has_ai_scheduling: true })
          .eq("id", selectedCampaignId);

      } else {
        // Update existing rules
        const { error } = await supabase
          .from("lead_ai_scheduling_rules")
          .update({
            name: rules.name,
            description: rules.description,
            buffer_before_minutes: rules.buffer_before_minutes,
            buffer_after_minutes: rules.buffer_after_minutes,
            min_visit_duration_minutes: rules.min_visit_duration_minutes,
            max_visits_per_day_per_employee: rules.max_visits_per_day_per_employee,
            max_visits_per_week_per_employee: rules.max_visits_per_week_per_employee,
            earliest_start_time: rules.earliest_start_time,
            latest_end_time: rules.latest_end_time,
            allowed_weekdays: rules.allowed_weekdays,
            use_postal_code_proximity: rules.use_postal_code_proximity,
            max_distance_km: rules.max_distance_km,
            prioritize_nearest: rules.prioritize_nearest,
            balance_workload: rules.balance_workload,
            workload_weight_percent: rules.workload_weight_percent,
            ai_system_prompt: rules.ai_system_prompt,
            ai_considerations: rules.ai_considerations
          })
          .eq("id", rules.id);

        if (error) throw error;
      }

      toast({ title: "Regras guardadas com sucesso!" });
      setIsUsingTemplate(false);
      loadRules();
      loadCampaigns();
      onRulesUpdated?.();
    } catch (error: any) {
      toast({ title: "Erro ao guardar", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDisableScheduling = async () => {
    if (!selectedCampaignId) return;
    
    // Deactivate rules for this campaign
    await supabase
      .from("lead_ai_scheduling_rules")
      .update({ is_active: false })
      .eq("campaign_id", selectedCampaignId);
    
    // Update campaign flag
    await supabase
      .from("campaigns")
      .update({ has_ai_scheduling: false })
      .eq("id", selectedCampaignId);
    
    toast({ title: "Agendamento AI desativado para esta campanha" });
    loadCampaigns();
    setRules(null);
    setSelectedCampaignId(null);
  };

  const addConsideration = () => {
    if (!newConsideration.trim() || !rules) return;
    setRules({
      ...rules,
      ai_considerations: [...(rules.ai_considerations || []), newConsideration.trim()]
    });
    setNewConsideration("");
  };

  const removeConsideration = (index: number) => {
    if (!rules) return;
    const updated = [...(rules.ai_considerations || [])];
    updated.splice(index, 1);
    setRules({ ...rules, ai_considerations: updated });
  };

  const toggleWeekday = (day: number) => {
    if (!rules) return;
    const current = rules.allowed_weekdays || [];
    const updated = current.includes(day)
      ? current.filter(d => d !== day)
      : [...current, day].sort();
    setRules({ ...rules, allowed_weekdays: updated });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Configuração de Agendamento AI
          </DialogTitle>
        </DialogHeader>

        {/* Campaign Selector */}
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Megaphone className="w-4 h-4" />
              Selecionar Campanha
            </CardTitle>
            <CardDescription>
              Cada campanha pode ter configurações de agendamento diferentes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select 
              value={selectedCampaignId || ""} 
              onValueChange={(v) => setSelectedCampaignId(v || null)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma campanha" />
              </SelectTrigger>
              <SelectContent>
                {campaigns.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    <div className="flex items-center gap-2">
                      {c.name}
                      {c.has_ai_scheduling && (
                        <Badge variant="secondary" className="text-xs">
                          <Sparkles className="w-3 h-3 mr-1" />
                          AI Ativo
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {campaigns.length === 0 && (
              <p className="text-sm text-muted-foreground mt-2">
                Nenhuma campanha encontrada. Crie campanhas primeiro.
              </p>
            )}
          </CardContent>
        </Card>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && !selectedCampaignId && (
          <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
            <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Selecione uma campanha para configurar o agendamento AI</p>
          </div>
        )}

        {!loading && selectedCampaignId && isUsingTemplate && (
          <Card className="border-primary/50 bg-primary/5">
            <CardContent className="py-3">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Template</Badge>
                <span className="text-sm text-muted-foreground">
                  A usar regras padrão. Guarde para criar configuração para esta campanha.
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {!loading && selectedCampaignId && rules && (
          <div className="space-y-6 mt-4">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nome da Configuração</Label>
                <Input
                  value={rules.name}
                  onChange={e => setRules({ ...rules, name: e.target.value })}
                  placeholder="Ex: Regras de Agendamento"
                />
              </div>
              <div>
                <Label>Descrição</Label>
                <Input
                  value={rules.description || ""}
                  onChange={e => setRules({ ...rules, description: e.target.value })}
                  placeholder="Descrição opcional"
                />
              </div>
            </div>

            {/* Timing Rules */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Timer className="w-4 h-4" />
                  Regras de Tempo
                </CardTitle>
                <CardDescription>Configure buffers e durações</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs">Buffer Antes (min)</Label>
                    <Input
                      type="number"
                      value={rules.buffer_before_minutes}
                      onChange={e => setRules({ ...rules, buffer_before_minutes: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Buffer Depois (min)</Label>
                    <Input
                      type="number"
                      value={rules.buffer_after_minutes}
                      onChange={e => setRules({ ...rules, buffer_after_minutes: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Duração Mínima (min)</Label>
                    <Input
                      type="number"
                      value={rules.min_visit_duration_minutes}
                      onChange={e => setRules({ ...rules, min_visit_duration_minutes: parseInt(e.target.value) || 30 })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs">Hora Início</Label>
                    <Input
                      type="time"
                      value={rules.earliest_start_time}
                      onChange={e => setRules({ ...rules, earliest_start_time: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Hora Fim</Label>
                    <Input
                      type="time"
                      value={rules.latest_end_time}
                      onChange={e => setRules({ ...rules, latest_end_time: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs mb-2 block">Dias Permitidos</Label>
                  <div className="flex gap-2">
                    {WEEKDAYS.map(day => (
                      <Button
                        key={day.value}
                        type="button"
                        size="sm"
                        variant={(rules.allowed_weekdays || []).includes(day.value) ? "default" : "outline"}
                        className="w-10 h-10"
                        onClick={() => toggleWeekday(day.value)}
                      >
                        {day.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Workload Rules */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Carga de Trabalho
                </CardTitle>
                <CardDescription>Limite de visitas por colaborador</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs">Máx. Visitas/Dia</Label>
                    <Input
                      type="number"
                      value={rules.max_visits_per_day_per_employee}
                      onChange={e => setRules({ ...rules, max_visits_per_day_per_employee: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Máx. Visitas/Semana</Label>
                    <Input
                      type="number"
                      value={rules.max_visits_per_week_per_employee}
                      onChange={e => setRules({ ...rules, max_visits_per_week_per_employee: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Balancear Carga de Trabalho</Label>
                    <p className="text-xs text-muted-foreground">
                      Distribuir visitas equitativamente entre colaboradores
                    </p>
                  </div>
                  <Switch
                    checked={rules.balance_workload}
                    onCheckedChange={v => setRules({ ...rules, balance_workload: v })}
                  />
                </div>

                {rules.balance_workload && (
                  <div>
                    <Label className="text-xs">
                      Peso do Balanceamento: {rules.workload_weight_percent}%
                    </Label>
                    <Slider
                      value={[rules.workload_weight_percent]}
                      onValueChange={([v]) => setRules({ ...rules, workload_weight_percent: v })}
                      min={0}
                      max={100}
                      step={5}
                      className="mt-2"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {rules.workload_weight_percent}% balanceamento vs {100 - rules.workload_weight_percent}% proximidade
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Proximity Rules */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Regras de Proximidade
                </CardTitle>
                <CardDescription>Configurações de localização</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Usar Proximidade por Código Postal</Label>
                    <p className="text-xs text-muted-foreground">
                      Priorizar colaboradores mais próximos
                    </p>
                  </div>
                  <Switch
                    checked={rules.use_postal_code_proximity}
                    onCheckedChange={v => setRules({ ...rules, use_postal_code_proximity: v })}
                  />
                </div>

                {rules.use_postal_code_proximity && (
                  <>
                    <div className="flex items-center justify-between">
                      <Label>Priorizar Mais Próximo</Label>
                      <Switch
                        checked={rules.prioritize_nearest}
                        onCheckedChange={v => setRules({ ...rules, prioritize_nearest: v })}
                      />
                    </div>

                    <div>
                      <Label className="text-xs">Distância Máxima (km)</Label>
                      <Input
                        type="number"
                        value={rules.max_distance_km}
                        onChange={e => setRules({ ...rules, max_distance_km: parseInt(e.target.value) || 50 })}
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* AI Considerations */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Brain className="w-4 h-4" />
                  Considerações AI
                </CardTitle>
                <CardDescription>Instruções adicionais para a IA</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs">Prompt do Sistema (opcional)</Label>
                  <Textarea
                    value={rules.ai_system_prompt || ""}
                    onChange={e => setRules({ ...rules, ai_system_prompt: e.target.value })}
                    placeholder="Instruções personalizadas para a IA..."
                    rows={3}
                  />
                </div>

                <div>
                  <Label className="text-xs mb-2 block">Considerações Adicionais</Label>
                  <div className="space-y-2">
                    {(rules.ai_considerations || []).map((consideration, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Badge variant="secondary" className="flex-1 justify-start text-sm py-1">
                          {consideration}
                        </Badge>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => removeConsideration(idx)}
                        >
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <Input
                        value={newConsideration}
                        onChange={e => setNewConsideration(e.target.value)}
                        placeholder="Nova consideração..."
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addConsideration())}
                      />
                      <Button type="button" size="icon" onClick={addConsideration}>
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <DialogFooter className="mt-4 gap-2">
          {!loading && selectedCampaignId && rules && !isUsingTemplate && (
            <Button variant="outline" onClick={handleDisableScheduling} className="mr-auto">
              <Trash2 className="w-4 h-4 mr-2" />
              Desativar AI
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {selectedCampaignId && rules && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  A guardar...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Guardar
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
