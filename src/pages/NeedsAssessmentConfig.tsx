import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/contexts/CompanyContext";
import {
  Plus, Trash2, Pencil, Settings2, FileText, GripVertical,
  Type, Hash, Calendar, ToggleLeft, List, AlignLeft, Paperclip,
  Save, CheckCircle2, Ruler, Package, Eye, EyeOff, X, Layers
} from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

const FIELD_TYPES = [
  { value: "text", label: "Texto", icon: Type },
  { value: "number", label: "Número", icon: Hash },
  { value: "dropdown", label: "Dropdown", icon: List },
  { value: "checkbox", label: "Checkbox", icon: ToggleLeft },
  { value: "date", label: "Data", icon: Calendar },
  { value: "textarea", label: "Texto longo", icon: AlignLeft },
  { value: "file", label: "Ficheiro", icon: Paperclip },
];

interface FieldConfig {
  id: string;
  name: string;
  field_type: string;
  options: string[];
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
}

interface MeasurementField {
  id: string;
  name: string;
  unit: string;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  is_active: boolean;
  show_measurements_tab: boolean | null;
  show_items_tab: boolean | null;
  fields: { field_config_id: string; sort_order: number; is_required_override: boolean | null }[];
}

interface Settings {
  show_measurements_tab: boolean;
  show_items_tab: boolean;
  measurement_fields: MeasurementField[];
}

export default function NeedsAssessmentConfig() {
  const { activeCompany } = useCompany();
  const organizationId = activeCompany?.id || null;
  const { toast } = useToast();
  const [fields, setFields] = useState<FieldConfig[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [settings, setSettings] = useState<Settings>({ show_measurements_tab: false, show_items_tab: true, measurement_fields: [] });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("tabs");

  // Field dialog state
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<FieldConfig | null>(null);
  const [fieldName, setFieldName] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [fieldOptions, setFieldOptions] = useState("");
  const [fieldRequired, setFieldRequired] = useState(false);

  // Template dialog state
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateFieldIds, setTemplateFieldIds] = useState<Set<string>>(new Set());
  const [templateShowMeasurements, setTemplateShowMeasurements] = useState<boolean | null>(null);
  const [templateShowItems, setTemplateShowItems] = useState<boolean | null>(null);

  // Measurement field dialog state
  const [measurementDialogOpen, setMeasurementDialogOpen] = useState(false);
  const [editingMeasurementIndex, setEditingMeasurementIndex] = useState<number | null>(null);
  const [measurementName, setMeasurementName] = useState("");
  const [measurementUnit, setMeasurementUnit] = useState("m²");

  const loadData = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const [fieldsRes, templatesRes, settingsRes] = await Promise.all([
        supabase.from("needs_assessment_field_configs")
          .select("*").eq("organization_id", organizationId).order("sort_order"),
        supabase.from("needs_assessment_templates")
          .select("*, needs_assessment_template_fields(field_config_id, sort_order, is_required_override)")
          .eq("organization_id", organizationId).order("created_at"),
        supabase.from("needs_assessment_settings")
          .select("*").eq("organization_id", organizationId).maybeSingle(),
      ]);

      setFields((fieldsRes.data || []).map((f: any) => ({ ...f, options: Array.isArray(f.options) ? f.options : [] })));
      setTemplates((templatesRes.data || []).map((t: any) => ({
        ...t,
        fields: t.needs_assessment_template_fields || [],
      })));

      if (settingsRes.data) {
        setSettings({
          show_measurements_tab: settingsRes.data.show_measurements_tab ?? false,
          show_items_tab: settingsRes.data.show_items_tab ?? true,
          measurement_fields: Array.isArray(settingsRes.data.measurement_fields) ? settingsRes.data.measurement_fields as unknown as MeasurementField[] : [],
        });
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Settings CRUD ────────────────────────────────────────
  const saveSettings = async (newSettings: Partial<Settings>) => {
    if (!organizationId) return;
    const merged = { ...settings, ...newSettings };
    setSettings(merged);
    try {
      const payload = {
        show_measurements_tab: merged.show_measurements_tab,
        show_items_tab: merged.show_items_tab,
        measurement_fields: merged.measurement_fields as unknown as any,
        updated_at: new Date().toISOString(),
      };
      const { data: existing } = await supabase.from("needs_assessment_settings")
        .select("id").eq("organization_id", organizationId).maybeSingle();
      if (existing) {
        await supabase.from("needs_assessment_settings")
          .update(payload)
          .eq("organization_id", organizationId);
      } else {
        await supabase.from("needs_assessment_settings")
          .insert([{ organization_id: organizationId, ...payload }]);
      }
    } catch (err: any) {
      toast({ title: "Erro ao guardar", description: err.message, variant: "destructive" });
    }
  };

  // ─── Field CRUD ────────────────────────────────────────────
  const openFieldDialog = (field?: FieldConfig) => {
    if (field) {
      setEditingField(field);
      setFieldName(field.name);
      setFieldType(field.field_type);
      setFieldOptions(field.options.join(", "));
      setFieldRequired(field.is_required);
    } else {
      setEditingField(null);
      setFieldName("");
      setFieldType("text");
      setFieldOptions("");
      setFieldRequired(false);
    }
    setFieldDialogOpen(true);
  };

  const saveField = async () => {
    if (!fieldName.trim() || !organizationId) return;
    const options = fieldType === "dropdown" ? fieldOptions.split(",").map(o => o.trim()).filter(Boolean) : [];
    try {
      if (editingField) {
        await supabase.from("needs_assessment_field_configs")
          .update({ name: fieldName.trim(), field_type: fieldType, options, is_required: fieldRequired, updated_at: new Date().toISOString() })
          .eq("id", editingField.id);
      } else {
        await supabase.from("needs_assessment_field_configs")
          .insert({ organization_id: organizationId, name: fieldName.trim(), field_type: fieldType, options, is_required: fieldRequired, sort_order: fields.length });
      }
      toast({ title: editingField ? "Campo atualizado" : "Campo criado" });
      setFieldDialogOpen(false);
      loadData();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const deleteField = async (id: string) => {
    try {
      await supabase.from("needs_assessment_field_configs").delete().eq("id", id);
      toast({ title: "Campo eliminado" });
      loadData();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const toggleFieldActive = async (field: FieldConfig) => {
    await supabase.from("needs_assessment_field_configs")
      .update({ is_active: !field.is_active }).eq("id", field.id);
    loadData();
  };

  // ─── Template CRUD ────────────────────────────────────────
  const openTemplateDialog = (template?: Template) => {
    if (template) {
      setEditingTemplate(template);
      setTemplateName(template.name);
      setTemplateDescription(template.description || "");
      setTemplateFieldIds(new Set(template.fields.map(f => f.field_config_id)));
      setTemplateShowMeasurements(template.show_measurements_tab);
      setTemplateShowItems(template.show_items_tab);
    } else {
      setEditingTemplate(null);
      setTemplateName("");
      setTemplateDescription("");
      setTemplateFieldIds(new Set());
      setTemplateShowMeasurements(null);
      setTemplateShowItems(null);
    }
    setTemplateDialogOpen(true);
  };

  const saveTemplate = async () => {
    if (!templateName.trim() || !organizationId) return;
    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");
      let templateId: string;

      if (editingTemplate) {
        await supabase.from("needs_assessment_templates")
          .update({
            name: templateName.trim(), description: templateDescription || null,
            show_measurements_tab: templateShowMeasurements, show_items_tab: templateShowItems,
            updated_at: new Date().toISOString()
          })
          .eq("id", editingTemplate.id);
        templateId = editingTemplate.id;
        await supabase.from("needs_assessment_template_fields").delete().eq("template_id", templateId);
      } else {
        const { data, error } = await supabase.from("needs_assessment_templates")
          .insert({
            organization_id: organizationId, name: templateName.trim(), description: templateDescription || null,
            created_by: businessUserId, show_measurements_tab: templateShowMeasurements, show_items_tab: templateShowItems,
          })
          .select("id").single();
        if (error) throw error;
        templateId = data.id;
      }

      if (templateFieldIds.size > 0) {
        const rows = Array.from(templateFieldIds).map((fid, idx) => ({
          template_id: templateId, field_id: fid, sort_order: idx,
        }));
        await (supabase.from("needs_assessment_template_fields") as any).insert(rows);
      }

      toast({ title: editingTemplate ? "Template atualizado" : "Template criado" });
      setTemplateDialogOpen(false);
      loadData();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const deleteTemplate = async (id: string) => {
    try {
      await supabase.from("needs_assessment_templates").delete().eq("id", id);
      toast({ title: "Template eliminado" });
      loadData();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const toggleTemplateField = (fieldId: string) => {
    setTemplateFieldIds(prev => {
      const next = new Set(prev);
      if (next.has(fieldId)) next.delete(fieldId); else next.add(fieldId);
      return next;
    });
  };

  // ─── Measurement fields ────────────────────────────────────
  const openMeasurementDialog = (index?: number) => {
    if (index !== undefined) {
      const mf = settings.measurement_fields[index];
      setEditingMeasurementIndex(index);
      setMeasurementName(mf.name);
      setMeasurementUnit(mf.unit);
    } else {
      setEditingMeasurementIndex(null);
      setMeasurementName("");
      setMeasurementUnit("m²");
    }
    setMeasurementDialogOpen(true);
  };

  const saveMeasurementField = () => {
    if (!measurementName.trim()) return;
    const newFields = [...settings.measurement_fields];
    const entry: MeasurementField = { id: editingMeasurementIndex !== null ? newFields[editingMeasurementIndex].id : `mf-${Date.now()}`, name: measurementName.trim(), unit: measurementUnit.trim() || "un" };
    if (editingMeasurementIndex !== null) {
      newFields[editingMeasurementIndex] = entry;
    } else {
      newFields.push(entry);
    }
    saveSettings({ measurement_fields: newFields });
    setMeasurementDialogOpen(false);
  };

  const deleteMeasurementField = (index: number) => {
    const newFields = settings.measurement_fields.filter((_, i) => i !== index);
    saveSettings({ measurement_fields: newFields });
  };

  const getTypeIcon = (type: string) => {
    const ft = FIELD_TYPES.find(f => f.value === type);
    return ft?.icon || Type;
  };

  const activeFields = fields.filter(f => f.is_active);

  if (!organizationId) {
    return <><div className="p-6 text-center text-muted-foreground">Selecione uma organização.</div></>;
  }

  return (
    <>
      <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              Configurar Levantamento de Necessidades
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure quais tabs, campos e templates aparecem quando o comercial regista necessidades.
            </p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="tabs" className="gap-1.5 text-xs"><Layers className="h-3.5 w-3.5" /> Tabs Visíveis</TabsTrigger>
            <TabsTrigger value="fields" className="gap-1.5 text-xs"><Type className="h-3.5 w-3.5" /> Campos Custom</TabsTrigger>
            <TabsTrigger value="measurements" className="gap-1.5 text-xs"><Ruler className="h-3.5 w-3.5" /> Medições</TabsTrigger>
            <TabsTrigger value="templates" className="gap-1.5 text-xs"><FileText className="h-3.5 w-3.5" /> Templates</TabsTrigger>
          </TabsList>

          {/* ─── TABS VISIBILITY ─── */}
          <TabsContent value="tabs" className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              Controle quais separadores aparecem no formulário de levantamento de necessidades.
            </p>

            <div className="space-y-3">
              {/* Detalhes - always on */}
              <Card>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Detalhes</p>
                      <p className="text-xs text-muted-foreground">Título, descrição, prioridade, estado, estimativa, notas internas</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-xs">Sempre activo</Badge>
                </CardContent>
              </Card>

              {/* Campos Custom */}
              <Card>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Settings2 className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Campos Personalizados</p>
                      <p className="text-xs text-muted-foreground">
                        {activeFields.length > 0
                          ? `${activeFields.length} campos activos — tab visível automaticamente`
                          : "Sem campos configurados — tab escondida automaticamente"}
                      </p>
                    </div>
                  </div>
                  <Badge variant={activeFields.length > 0 ? "default" : "outline"} className="text-xs">
                    {activeFields.length > 0 ? <><Eye className="h-3 w-3 mr-1" /> Visível</> : <><EyeOff className="h-3 w-3 mr-1" /> Escondida</>}
                  </Badge>
                </CardContent>
              </Card>

              {/* Medições */}
              <Card className={cn(settings.show_measurements_tab && "border-primary/30")}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-3">
                    <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", settings.show_measurements_tab ? "bg-primary/10" : "bg-muted")}>
                      <Ruler className={cn("h-4 w-4", settings.show_measurements_tab ? "text-primary" : "text-muted-foreground")} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Medições</p>
                      <p className="text-xs text-muted-foreground">Campos de medição (m², m, kg, etc.) — útil para construção, obras, remodelação</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.show_measurements_tab}
                    onCheckedChange={(v) => saveSettings({ show_measurements_tab: v })}
                  />
                </CardContent>
              </Card>

              {/* Itens */}
              <Card className={cn(settings.show_items_tab && "border-primary/30")}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-3">
                    <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", settings.show_items_tab ? "bg-primary/10" : "bg-muted")}>
                      <Package className={cn("h-4 w-4", settings.show_items_tab ? "text-primary" : "text-muted-foreground")} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Itens / Produtos e Serviços</p>
                      <p className="text-xs text-muted-foreground">Pesquisa de produtos e serviços do catálogo com preços</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.show_items_tab}
                    onCheckedChange={(v) => saveSettings({ show_items_tab: v })}
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ─── FIELDS TAB ─── */}
          <TabsContent value="fields" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Campos que aparecem na tab "Campos Custom" do levantamento de necessidades.
              </p>
              <Button size="sm" onClick={() => openFieldDialog()}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Novo Campo
              </Button>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />)}
              </div>
            ) : fields.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-10 text-center">
                  <Settings2 className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhum campo configurado.</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Crie campos como "Área m²", "Tipo de intervenção", "Prazo desejado", etc.
                  </p>
                  <Button size="sm" variant="link" className="mt-3" onClick={() => openFieldDialog()}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Criar primeiro campo
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-1.5">
                {fields.map(field => {
                  const Icon = getTypeIcon(field.field_type);
                  return (
                    <div key={field.id} className={cn(
                      "flex items-center justify-between p-3 rounded-lg border transition-all",
                      field.is_active ? "bg-card" : "bg-muted/30 opacity-60"
                    )}>
                      <div className="flex items-center gap-3 min-w-0">
                        <GripVertical className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
                        <Icon className="h-4 w-4 text-primary flex-shrink-0" />
                        <div className="min-w-0">
                          <span className="text-sm font-medium">{field.name}</span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {FIELD_TYPES.find(ft => ft.value === field.field_type)?.label || field.field_type}
                            </Badge>
                            {field.is_required && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Obrigatório</Badge>}
                            {field.field_type === "dropdown" && field.options.length > 0 && (
                              <span className="text-[10px] text-muted-foreground">{field.options.length} opções</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Switch checked={field.is_active} onCheckedChange={() => toggleFieldActive(field)} className="scale-75" />
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openFieldDialog(field)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteField(field.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ─── MEASUREMENTS TAB ─── */}
          <TabsContent value="measurements" className="space-y-4 mt-4">
            {!settings.show_measurements_tab ? (
              <Card className="border-dashed border-amber-500/30 bg-amber-50/50 dark:bg-amber-900/10">
                <CardContent className="py-8 text-center">
                  <EyeOff className="mx-auto h-8 w-8 text-amber-500 mb-3" />
                  <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">
                    Tab de Medições está desactivada
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                    Active a tab "Medições" na secção "Tabs Visíveis" para configurar campos de medição.
                  </p>
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => { saveSettings({ show_measurements_tab: true }); setTab("measurements"); }}>
                    <Eye className="h-3.5 w-3.5 mr-1" /> Activar Medições
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Campos de medição disponíveis no levantamento (ex: Comprimento, Largura, Área, Peso).
                  </p>
                  <Button size="sm" onClick={() => openMeasurementDialog()}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Novo Campo
                  </Button>
                </div>

                {settings.measurement_fields.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="py-10 text-center">
                      <Ruler className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                      <p className="text-sm text-muted-foreground">Nenhum campo de medição configurado.</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Ex: Comprimento (m), Largura (m), Área (m²), Peso (kg)
                      </p>
                      <Button size="sm" variant="link" className="mt-3" onClick={() => openMeasurementDialog()}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Criar primeiro campo
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-1.5">
                    {settings.measurement_fields.map((mf, idx) => (
                      <div key={mf.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                        <div className="flex items-center gap-3">
                          <Ruler className="h-4 w-4 text-primary flex-shrink-0" />
                          <div>
                            <span className="text-sm font-medium">{mf.name}</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-2">{mf.unit}</Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openMeasurementDialog(idx)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMeasurementField(idx)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* ─── TEMPLATES TAB ─── */}
          <TabsContent value="templates" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Templates pré-carregam campos e definem quais tabs ficam activas por tipo de levantamento.
              </p>
              <Button size="sm" onClick={() => openTemplateDialog()}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Novo Template
              </Button>
            </div>

            {templates.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-10 text-center">
                  <FileText className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhum template criado.</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ex: "Remodelação" (com medições), "Consultoria" (sem medições, sem itens)
                  </p>
                  <Button size="sm" variant="link" className="mt-3" onClick={() => openTemplateDialog()}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Criar primeiro template
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {templates.map(tpl => (
                  <Card key={tpl.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">{tpl.name}</CardTitle>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openTemplateDialog(tpl)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteTemplate(tpl.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      {tpl.description && <CardDescription className="text-xs">{tpl.description}</CardDescription>}
                    </CardHeader>
                    <CardContent className="pt-0 space-y-2">
                      <div className="flex flex-wrap gap-1">
                        {tpl.fields.map(tf => {
                          const fc = fields.find(f => f.id === tf.field_config_id);
                          if (!fc) return null;
                          return <Badge key={tf.field_config_id} variant="outline" className="text-[10px]">{fc.name}</Badge>;
                        })}
                        {tpl.fields.length === 0 && <span className="text-xs text-muted-foreground">Sem campos custom</span>}
                      </div>
                      <div className="flex gap-2 text-[10px]">
                        {tpl.show_measurements_tab !== null && (
                          <Badge variant={tpl.show_measurements_tab ? "default" : "outline"} className="text-[10px]">
                            <Ruler className="h-2.5 w-2.5 mr-0.5" /> Medições {tpl.show_measurements_tab ? "ON" : "OFF"}
                          </Badge>
                        )}
                        {tpl.show_items_tab !== null && (
                          <Badge variant={tpl.show_items_tab ? "default" : "outline"} className="text-[10px]">
                            <Package className="h-2.5 w-2.5 mr-0.5" /> Itens {tpl.show_items_tab ? "ON" : "OFF"}
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* ─── Field Dialog ─── */}
        <Dialog open={fieldDialogOpen} onOpenChange={setFieldDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingField ? "Editar Campo" : "Novo Campo"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome do campo *</Label>
                <Input value={fieldName} onChange={e => setFieldName(e.target.value)} placeholder='Ex: Área m², Tipo de intervenção' />
              </div>
              <div className="space-y-2">
                <Label>Tipo de campo</Label>
                <Select value={fieldType} onValueChange={setFieldType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map(ft => (
                      <SelectItem key={ft.value} value={ft.value}>
                        <div className="flex items-center gap-2">
                          <ft.icon className="h-3.5 w-3.5" />
                          <span>{ft.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {fieldType === "dropdown" && (
                <div className="space-y-2">
                  <Label>Opções (separadas por vírgula)</Label>
                  <Textarea value={fieldOptions} onChange={e => setFieldOptions(e.target.value)} placeholder="Remodelação, Construção, Manutenção" rows={2} />
                </div>
              )}
              <div className="flex items-center gap-2">
                <Switch checked={fieldRequired} onCheckedChange={setFieldRequired} />
                <Label>Obrigatório</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFieldDialogOpen(false)}>Cancelar</Button>
              <Button onClick={saveField} disabled={!fieldName.trim()}>
                <Save className="h-3.5 w-3.5 mr-1" /> {editingField ? "Guardar" : "Criar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── Template Dialog ─── */}
        <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingTemplate ? "Editar Template" : "Novo Template"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder='Ex: Remodelação, Manutenção, Consultoria' />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea value={templateDescription} onChange={e => setTemplateDescription(e.target.value)} placeholder="Breve descrição..." rows={2} />
              </div>
              <Separator />
              <div className="space-y-3">
                <Label>Tabs activas neste template</Label>
                <p className="text-[10px] text-muted-foreground">Deixe em "Usar padrão" para seguir a configuração geral. Altere para forçar ON/OFF neste template.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1"><Ruler className="h-3 w-3" /> Medições</Label>
                    <Select value={templateShowMeasurements === null ? "default" : templateShowMeasurements ? "on" : "off"} onValueChange={v => setTemplateShowMeasurements(v === "default" ? null : v === "on")}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Usar padrão</SelectItem>
                        <SelectItem value="on">✅ Activar</SelectItem>
                        <SelectItem value="off">❌ Desactivar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1"><Package className="h-3 w-3" /> Itens</Label>
                    <Select value={templateShowItems === null ? "default" : templateShowItems ? "on" : "off"} onValueChange={v => setTemplateShowItems(v === "default" ? null : v === "on")}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Usar padrão</SelectItem>
                        <SelectItem value="on">✅ Activar</SelectItem>
                        <SelectItem value="off">❌ Desactivar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Campos custom incluídos</Label>
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {activeFields.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhum campo activo disponível.</p>
                  ) : activeFields.map(field => {
                    const Icon = getTypeIcon(field.field_type);
                    const isSelected = templateFieldIds.has(field.id);
                    return (
                      <div
                        key={field.id}
                        className={cn(
                          "flex items-center gap-3 p-2 rounded-md border cursor-pointer transition-all",
                          isSelected ? "bg-primary/5 border-primary/30" : "bg-card hover:bg-muted/50"
                        )}
                        onClick={() => toggleTemplateField(field.id)}
                      >
                        {isSelected ? (
                          <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                        ) : (
                          <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 flex-shrink-0" />
                        )}
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm">{field.name}</span>
                        <Badge variant="secondary" className="text-[10px] ml-auto">
                          {FIELD_TYPES.find(ft => ft.value === field.field_type)?.label}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>Cancelar</Button>
              <Button onClick={saveTemplate} disabled={!templateName.trim()}>
                <Save className="h-3.5 w-3.5 mr-1" /> {editingTemplate ? "Guardar" : "Criar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── Measurement Field Dialog ─── */}
        <Dialog open={measurementDialogOpen} onOpenChange={setMeasurementDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{editingMeasurementIndex !== null ? "Editar Campo de Medição" : "Novo Campo de Medição"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input value={measurementName} onChange={e => setMeasurementName(e.target.value)} placeholder="Ex: Comprimento, Largura, Área, Peso" />
              </div>
              <div className="space-y-2">
                <Label>Unidade</Label>
                <Select value={measurementUnit} onValueChange={setMeasurementUnit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="m">m (metros)</SelectItem>
                    <SelectItem value="m²">m² (metros quadrados)</SelectItem>
                    <SelectItem value="m³">m³ (metros cúbicos)</SelectItem>
                    <SelectItem value="cm">cm (centímetros)</SelectItem>
                    <SelectItem value="kg">kg (quilogramas)</SelectItem>
                    <SelectItem value="L">L (litros)</SelectItem>
                    <SelectItem value="un">un (unidades)</SelectItem>
                    <SelectItem value="h">h (horas)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMeasurementDialogOpen(false)}>Cancelar</Button>
              <Button onClick={saveMeasurementField} disabled={!measurementName.trim()}>
                <Save className="h-3.5 w-3.5 mr-1" /> {editingMeasurementIndex !== null ? "Guardar" : "Criar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
