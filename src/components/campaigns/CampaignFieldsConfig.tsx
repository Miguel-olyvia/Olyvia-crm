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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Pencil, Trash2, GripVertical, Settings2, Loader2, CircleDot, ChevronDown, Zap, Type, Hash, Mail, Phone, Calendar, Link, AlignLeft, HelpCircle, CheckSquare, ListChecks, Info, Layers, Palette } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "@/hooks/useTranslation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StepInfoBlocksConfig } from "./StepInfoBlocksConfig";
import { FormSectionsConfig } from "./FormSectionsConfig";
import { FieldOptionIcons } from "./FieldOptionIcons";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

interface FormStep {
  id: string;
  campaign_id: string;
  step_number: number;
  step_title: string;
  step_description: string | null;
  step_subtitle: string | null;
  next_button_text: string | null;
  previous_button_text: string | null;
  submit_button_text: string | null;
  sort_order: number;
}

interface FieldDefinition {
  id: string;
  campaign_id: string | null;
  organization_id: string | null;
  field_key: string;
  field_label: string;
  field_type: string;
  is_required: boolean;
  is_unique: boolean;
  options: any;
  sort_order: number;
  contact_field_mapping: string | null;
  client_field_mapping: string | null;
  step_number: number;
  step_title: string | null;
  is_multi_select?: boolean;
  min_length?: number | null;
  max_length?: number | null;
  min_value?: number | null;
  max_value?: number | null;
  pattern?: string | null;
  pattern_message?: string | null;
  placeholder?: string | null;
  help_text?: string | null;
  display_style?: string | null;
}

import { CONTACT_FIELDS, CLIENT_FIELDS } from "@/constants/fieldMappings";

interface CampaignFieldsConfigProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignName: string;
  companyId: string;
}

export function CampaignFieldsConfig({
  open,
  onOpenChange,
  campaignId,
  campaignName,
  companyId,
}: CampaignFieldsConfigProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [fieldDefs, setFieldDefs] = useState<FieldDefinition[]>([]);
  const [formSteps, setFormSteps] = useState<FormStep[]>([]);
  const [editingField, setEditingField] = useState<FieldDefinition | null>(null);
  const [editingStep, setEditingStep] = useState<FormStep | null>(null);
  const [newStepTitle, setNewStepTitle] = useState("");
  const [countries, setCountries] = useState<{ code: string; name: string }[]>([]);
  const [systemEntities, setSystemEntities] = useState<{ id: string; name: string }[]>([]);
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [infoBlocksDialogOpen, setInfoBlocksDialogOpen] = useState(false);
  const [newField, setNewField] = useState({
    field_key: "",
    field_label: "",
    field_type: "text",
    is_required: false,
    is_unique: false,
    contact_field_mapping: "",
    client_field_mapping: "",
    step_number: 1,
    country_code: "",
    display_style: "dropdown" as "dropdown" | "radio" | "buttons",
    show_icons: false,
    is_multi_select: false,
    min_length: null as number | null,
    max_length: null as number | null,
    min_value: null as number | null,
    max_value: null as number | null,
    pattern: "",
    pattern_message: "",
    placeholder: "",
    help_text: "",
  });

  // Load system entities when field type changes to a ref_* or list_* type
  useEffect(() => {
    const loadSystemEntities = async () => {
      const entityType = getSystemEntityType(newField.field_type);
      if (!entityType) {
        setSystemEntities([]);
        setSelectedEntityIds([]);
        return;
      }

      setLoadingEntities(true);
      try {
        let data: { id: string; name: string }[] = [];
        
        if (entityType === 'services') {
          const result = await supabase
            .from('services')
            .select('id, name')
            .eq('organization_id', companyId)
            .eq('is_active', true)
            .order('name') as any;
          data = result.data || [];
        } else if (entityType === 'products') {
          const result = await supabase
            .from('products')
            .select('id, name')
            .eq('organization_id', companyId)
            .eq('is_active', true)
            .order('name') as any;
          data = result.data || [];
        } else if (entityType === 'districts') {
          const countryCode = newField.country_code || 'PT';
          const result = await supabase
            .from('administrative_divisions')
            .select('id, name')
            .eq('country_code', countryCode)
            .eq('admin_level', 1)
            .eq('is_active', true)
            .order('name') as any;
          data = result.data || [];
        } else if (entityType === 'business_units') {
          // Fetch child organizations via hierarchy (replaces legacy business_units table)
          const result = await supabase
            .from('anew_hierarchy')
            .select('child_org_id, anew_organizations!anew_hierarchy_child_org_id_fkey(id, name)')
            .eq('parent_org_id', companyId) as any;
          data = (result.data || [])
            .filter((h: any) => h.anew_organizations)
            .map((h: any) => ({ id: h.anew_organizations.id, name: h.anew_organizations.name }));
        } else if (entityType === 'departments') {
          // Fetch child organizations of type "departamento" via hierarchy
          const result = await supabase
            .from('anew_hierarchy')
            .select('child_org_id, anew_organizations!anew_hierarchy_child_org_id_fkey(id, name, type)')
            .eq('parent_org_id', companyId) as any;
          data = (result.data || [])
            .filter((h: any) => h.anew_organizations?.type === 'departamento')
            .map((h: any) => ({ id: h.anew_organizations.id, name: h.anew_organizations.name }));
        }
        
        setSystemEntities(data);
        // By default, select all entities
        setSelectedEntityIds(data.map((e: any) => e.id));
      } catch (error) {
        console.error('Error loading system entities:', error);
        setSystemEntities([]);
      } finally {
        setLoadingEntities(false);
      }
    };

    loadSystemEntities();
  }, [newField.field_type, newField.country_code, companyId]);

  useEffect(() => {
    if (open && campaignId) {
      loadFormSteps();
      loadFieldDefinitions();
      loadCountries();
    }
  }, [open, campaignId]);

  const loadCountries = async () => {
    const { data } = await supabase
      .from("administrative_divisions")
      .select("country_code")
      .eq("admin_level", 1);
    
    if (data) {
      const uniqueCountries = [...new Set(data.map(d => d.country_code))];
      const countryList = uniqueCountries.map(code => ({
        code,
        name: code === 'PT' ? 'Portugal' : code === 'ES' ? 'Espanha' : code === 'FR' ? 'França' : code,
      }));
      setCountries(countryList);
    }
  };

  const loadFormSteps = async () => {
    const { data, error } = await supabase
      .from("campaign_form_steps")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("step_number");

    if (error) {
      console.error("Error loading form steps:", error);
    } else {
      // If no steps exist, create a default one
      if (!data || data.length === 0) {
        await createDefaultStep();
      } else {
        setFormSteps(data);
      }
    }
  };

  const createDefaultStep = async () => {
    const { data, error } = await supabase
      .from("campaign_form_steps")
      .insert({
        campaign_id: campaignId,
        step_number: 1,
        step_title: t("campaigns.steps.defaultTitle") || "Step 1",
        sort_order: 0,
      })
      .select()
      .single();

    if (!error && data) {
      setFormSteps([data]);
    }
  };

  const loadFieldDefinitions = async () => {
    const { data, error } = await supabase
      .from("lead_field_definitions")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("is_active", true)
      .order("sort_order");

    if (error) {
      console.error("Error loading field definitions:", error);
    } else {
      setFieldDefs(data || []);
    }
  };

  const handleAddStep = async () => {
    if (!newStepTitle.trim()) {
      toast({ title: t("campaigns.steps.enterTitle") || "Please enter a step title", variant: "destructive" });
      return;
    }

    const nextStepNumber = formSteps.length > 0 
      ? Math.max(...formSteps.map(s => s.step_number)) + 1 
      : 1;

    const { error } = await supabase.from("campaign_form_steps").insert({
      campaign_id: campaignId,
      step_number: nextStepNumber,
      step_title: newStepTitle.trim(),
      sort_order: nextStepNumber - 1,
    });

    if (error) {
      toast({ title: "Error adding step", description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("campaigns.steps.added") || "Step added" });
      setNewStepTitle("");
      loadFormSteps();
    }
  };

  const handleUpdateStep = async () => {
    if (!editingStep) return;

    const { error } = await supabase
      .from("campaign_form_steps")
      .update({
        step_title: editingStep.step_title,
        step_description: editingStep.step_description,
        step_subtitle: editingStep.step_subtitle,
        next_button_text: editingStep.next_button_text,
        previous_button_text: editingStep.previous_button_text,
        submit_button_text: editingStep.submit_button_text,
      })
      .eq("id", editingStep.id);

    if (error) {
      toast({ title: "Error updating step", description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("campaigns.steps.updated") || "Step updated" });
      setEditingStep(null);
      loadFormSteps();
    }
  };

  const handleDeleteStep = async (stepId: string, stepNumber: number) => {
    // Check if there are fields assigned to this step
    const fieldsInStep = fieldDefs.filter(f => f.step_number === stepNumber);
    if (fieldsInStep.length > 0) {
      toast({ 
        title: t("campaigns.steps.hasFields") || "Cannot delete step", 
        description: t("campaigns.steps.moveFieldsFirst") || "Move or delete fields in this step first",
        variant: "destructive" 
      });
      return;
    }

    // Don't allow deleting the last step
    if (formSteps.length <= 1) {
      toast({ 
        title: t("campaigns.steps.lastStep") || "Cannot delete", 
        description: t("campaigns.steps.needAtLeastOne") || "You need at least one step",
        variant: "destructive" 
      });
      return;
    }

    const { error } = await supabase
      .from("campaign_form_steps")
      .delete()
      .eq("id", stepId);

    if (error) {
      toast({ title: "Error deleting step", description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("campaigns.steps.deleted") || "Step deleted" });
      loadFormSteps();
    }
  };

  // Map field types to system entity types
  const getSystemEntityType = (fieldType: string): string | null => {
    const mapping: Record<string, string> = {
      'ref_company': 'companies',
      'ref_business_unit': 'business_units',
      'ref_department': 'departments',
      'ref_contact': 'contacts',
      'ref_client': 'clients',
      'ref_employee': 'employees',
      'ref_product': 'products',
      'ref_service': 'services',
      'ref_district': 'districts',
      'list_products': 'products',
      'list_services': 'services',
      'list_districts': 'districts',
    };
    return mapping[fieldType] || null;
  };

  const isMultiSelectType = (fieldType: string): boolean => {
    return fieldType.startsWith('list_');
  };

  const handleAddField = async () => {
    if (!newField.field_key || !newField.field_label) {
      toast({ title: "Please fill key and label", variant: "destructive" });
      return;
    }

    const systemEntityType = getSystemEntityType(newField.field_type);
    const isMultiSelect = isMultiSelectType(newField.field_type) || newField.is_multi_select;

    // Build options - for system entity types, include selected entity IDs and their names
    let fieldOptions = null;
    if (systemEntityType && selectedEntityIds.length > 0) {
      const selectedEntities = systemEntities.filter(e => selectedEntityIds.includes(e.id));
      fieldOptions = {
        entity_ids: selectedEntityIds,
        options: selectedEntities.map(e => e.name)
      };
    }

    // Build option_icons for select fields with show_icons enabled
    let optionIcons = null;
    if (newField.show_icons && selectedEntityIds.length > 0) {
      // Default icon mapping (can be customized later)
      optionIcons = {};
    }

    const businessUserId = await resolveCurrentBusinessUserId();
    if (!businessUserId) throw new Error("Business user not resolved");

    const { error } = await supabase.from("lead_field_definitions").insert({
      campaign_id: campaignId,
      organization_id: companyId,
      field_key: newField.field_key.toLowerCase().replace(/\s+/g, "_"),
      field_label: newField.field_label,
      field_type: newField.field_type,
      is_required: newField.is_required,
      is_unique: newField.is_unique,
      contact_field_mapping: newField.contact_field_mapping || null,
      client_field_mapping: newField.client_field_mapping || null,
      sort_order: fieldDefs.filter(f => f.step_number === newField.step_number).length,
      step_number: newField.step_number,
      created_by: businessUserId,
      system_entity_type: systemEntityType,
      system_entity_organization_id: systemEntityType ? companyId : null,
      is_multi_select: isMultiSelect,
      system_entity_country_code: newField.country_code || null,
      options: fieldOptions,
      display_style: newField.display_style,
      option_icons: optionIcons,
      min_length: newField.min_length,
      max_length: newField.max_length,
      min_value: newField.min_value,
      max_value: newField.max_value,
      pattern: newField.pattern || null,
      pattern_message: newField.pattern_message || null,
      placeholder: newField.placeholder || null,
      help_text: newField.help_text || null,
    });

    if (error) {
      toast({ title: "Error adding field", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Field added successfully" });
      setNewField({
        field_key: "",
        field_label: "",
        field_type: "text",
        is_required: false,
        is_unique: false,
        contact_field_mapping: "",
        client_field_mapping: "",
        step_number: newField.step_number,
        country_code: "",
        display_style: "dropdown",
        show_icons: false,
        is_multi_select: false,
        min_length: null,
        max_length: null,
        min_value: null,
        max_value: null,
        pattern: "",
        pattern_message: "",
        placeholder: "",
        help_text: "",
      });
      setSelectedEntityIds([]);
      setSystemEntities([]);
      loadFieldDefinitions();
    }
  };

  const handleUpdateField = async () => {
    if (!editingField) return;

    const { error } = await supabase
      .from("lead_field_definitions")
      .update({
        field_label: editingField.field_label,
        field_type: editingField.field_type,
        is_required: editingField.is_required,
        is_unique: editingField.is_unique,
        contact_field_mapping: editingField.contact_field_mapping || null,
        client_field_mapping: editingField.client_field_mapping || null,
        step_number: editingField.step_number,
      })
      .eq("id", editingField.id);

    if (error) {
      toast({ title: "Error updating field", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Field updated" });
      setEditingField(null);
      loadFieldDefinitions();
    }
  };

  const handleDeleteField = async (id: string) => {
    const { error } = await supabase
      .from("lead_field_definitions")
      .update({ is_active: false })
      .eq("id", id);

    if (error) {
      toast({ title: "Error deleting field", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Field removed" });
      loadFieldDefinitions();
    }
  };

  // Get step title by number
  const getStepTitle = (stepNumber: number) => {
    const step = formSteps.find(s => s.step_number === stepNumber);
    return step?.step_title || `${t("campaigns.fields.step") || "Step"} ${stepNumber}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("campaigns.fields.title") || "Configure Lead Fields"} - {campaignName}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="steps" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="steps">
              <Settings2 className="w-4 h-4 mr-2" />
              Passos
            </TabsTrigger>
            <TabsTrigger value="fields">
              <Plus className="w-4 h-4 mr-2" />
              Campos
            </TabsTrigger>
            <TabsTrigger value="sections">
              <Layers className="w-4 h-4 mr-2" />
              Secções
            </TabsTrigger>
            <TabsTrigger value="icons">
              <Palette className="w-4 h-4 mr-2" />
              Ícones
            </TabsTrigger>
            <TabsTrigger value="info">
              <Info className="w-4 h-4 mr-2" />
              Blocos
            </TabsTrigger>
          </TabsList>

          {/* Steps Configuration Tab */}
          <TabsContent value="steps" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("campaigns.steps.description") || "Configure the steps for your lead form. You can add multiple steps to create a multi-step form."}
            </p>

            {/* Add New Step */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  {t("campaigns.steps.addNew") || "Add New Step"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder={t("campaigns.steps.titlePlaceholder") || "Step title (e.g., Personal Info)"}
                    value={newStepTitle}
                    onChange={(e) => setNewStepTitle(e.target.value)}
                    className="flex-1"
                  />
                  <Button onClick={handleAddStep}>
                    <Plus className="w-4 h-4 mr-2" />
                    {t("campaigns.steps.add") || "Add Step"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Existing Steps */}
            <div className="space-y-2">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                {t("campaigns.steps.configured") || "Configured Steps"} ({formSteps.length})
              </h4>
              
              {formSteps.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                  {t("campaigns.steps.noSteps") || "No steps configured. Add your first step above."}
                </div>
              ) : (
                <div className="space-y-2">
                  {formSteps.map((step) => {
                    const fieldsInStep = fieldDefs.filter(f => f.step_number === step.step_number);
                    
                    return (
                      <div
                        key={step.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        {editingStep?.id === step.id ? (
                          <div className="flex-1 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs">Título do Passo</Label>
                                <Input
                                  value={editingStep.step_title}
                                  onChange={(e) => setEditingStep({ ...editingStep, step_title: e.target.value })}
                                  placeholder="Título do passo"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Subtítulo (opcional)</Label>
                                <Input
                                  value={editingStep.step_subtitle || ""}
                                  onChange={(e) => setEditingStep({ ...editingStep, step_subtitle: e.target.value })}
                                  placeholder="Subtítulo do passo"
                                />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Descrição (opcional)</Label>
                              <Input
                                value={editingStep.step_description || ""}
                                onChange={(e) => setEditingStep({ ...editingStep, step_description: e.target.value })}
                                placeholder={t("campaigns.steps.descriptionPlaceholder") || "Descrição opcional"}
                              />
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs">Botão Anterior</Label>
                                <Input
                                  value={editingStep.previous_button_text || ""}
                                  onChange={(e) => setEditingStep({ ...editingStep, previous_button_text: e.target.value })}
                                  placeholder="Anterior"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Botão Próximo</Label>
                                <Input
                                  value={editingStep.next_button_text || ""}
                                  onChange={(e) => setEditingStep({ ...editingStep, next_button_text: e.target.value })}
                                  placeholder="Continuar"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Botão Submeter</Label>
                                <Input
                                  value={editingStep.submit_button_text || ""}
                                  onChange={(e) => setEditingStep({ ...editingStep, submit_button_text: e.target.value })}
                                  placeholder="Submeter"
                                />
                              </div>
                            </div>
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" onClick={handleUpdateStep}>
                                {t("common.save") || "Guardar"}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingStep(null)}>
                                {t("common.cancel") || "Cancelar"}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-3">
                              <Badge variant="default" className="text-lg px-3 py-1">
                                {step.step_number}
                              </Badge>
                              <div>
                                <div className="font-medium">{step.step_title}</div>
                                {step.step_description && (
                                  <div className="text-sm text-muted-foreground">{step.step_description}</div>
                                )}
                                <div className="text-xs text-muted-foreground">
                                  {fieldsInStep.length} {fieldsInStep.length === 1 ? 
                                    (t("campaigns.steps.field") || 'field') : 
                                    (t("campaigns.steps.fields") || 'fields')}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button variant="ghost" size="icon" onClick={() => setEditingStep(step)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleDeleteStep(step.id, step.step_number)}
                                disabled={formSteps.length <= 1}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Fields Configuration Tab */}
          <TabsContent value="fields" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("campaigns.fields.description") ||
                "Configure the form fields that will be used to capture leads for this campaign."}
            </p>

            {/* Add New Field Form */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  {t("campaigns.fields.addNew") || "Add New Field"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t("campaigns.fields.fieldKey") || "Field Key"}</Label>
                    <Input
                      placeholder="e.g. first_name"
                      value={newField.field_key}
                      onChange={(e) => setNewField({ ...newField, field_key: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>{t("campaigns.fields.displayLabel") || "Display Label"}</Label>
                    <Input
                      placeholder="e.g. First Name"
                      value={newField.field_label}
                      onChange={(e) => setNewField({ ...newField, field_label: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t("campaigns.fields.fieldType") || "Field Type"}</Label>
                    <Select
                      value={newField.field_type}
                      onValueChange={(v) => setNewField({ ...newField, field_type: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="phone">Phone</SelectItem>
                        <SelectItem value="number">Number</SelectItem>
                        <SelectItem value="date">Date</SelectItem>
                        <SelectItem value="datetime">Date & Time</SelectItem>
                        <SelectItem value="boolean">Yes/No</SelectItem>
                        <SelectItem value="select">Dropdown</SelectItem>
                        <SelectItem value="textarea">Long Text</SelectItem>
                        <SelectItem value="url">URL</SelectItem>
                        <SelectItem value="radio">Radio (opção única)</SelectItem>
                        <SelectItem value="checkbox">Checkbox (múltiplas opções)</SelectItem>
                        <SelectItem value="_separator1" disabled className="text-muted-foreground font-semibold">
                          — Dados do Sistema —
                        </SelectItem>
                        <SelectItem value="ref_district">Distrito</SelectItem>
                        <SelectItem value="ref_service">Serviço</SelectItem>
                        <SelectItem value="ref_product">Produto</SelectItem>
                        <SelectItem value="ref_business_unit">Unidade de Negócio</SelectItem>
                        <SelectItem value="ref_department">Departamento</SelectItem>
                        <SelectItem value="_separator2" disabled className="text-muted-foreground font-semibold">
                          — Listas do Sistema —
                        </SelectItem>
                        <SelectItem value="list_districts">Lista de Distritos</SelectItem>
                        <SelectItem value="list_services">Lista de Serviços</SelectItem>
                        <SelectItem value="list_products">Lista de Produtos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{t("campaigns.fields.step") || "Step"}</Label>
                    <Select
                      value={String(newField.step_number)}
                      onValueChange={(v) => setNewField({ ...newField, step_number: parseInt(v) })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {formSteps.map((step) => (
                          <SelectItem key={step.step_number} value={String(step.step_number)}>
                            {step.step_number}. {step.step_title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Country selector for district fields */}
                {(newField.field_type === 'ref_district' || newField.field_type === 'list_districts') && (
                  <div>
                    <Label>País dos Distritos</Label>
                    <Select
                      value={newField.country_code}
                      onValueChange={(v) => setNewField({ ...newField, country_code: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o país" />
                      </SelectTrigger>
                      <SelectContent>
                        {countries.map((country) => (
                          <SelectItem key={country.code} value={country.code}>
                            {country.name} ({country.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Entity selector for system reference types */}
                {getSystemEntityType(newField.field_type) && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Selecionar {newField.field_type.includes('service') ? 'Serviços' : 
                        newField.field_type.includes('product') ? 'Produtos' :
                        newField.field_type.includes('district') ? 'Distritos' :
                        newField.field_type.includes('business_unit') ? 'Unidades de Negócio' :
                        newField.field_type.includes('department') ? 'Departamentos' : 'Itens'} a mostrar</Label>
                      {loadingEntities ? (
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      ) : (
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="sm"
                          onClick={() => {
                            if (selectedEntityIds.length === systemEntities.length) {
                              setSelectedEntityIds([]);
                            } else {
                              setSelectedEntityIds(systemEntities.map(e => e.id));
                            }
                          }}
                        >
                          {selectedEntityIds.length === systemEntities.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                        </Button>
                      )}
                    </div>
                    {loadingEntities ? (
                      <div className="flex items-center justify-center py-4 border rounded-lg">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : systemEntities.length === 0 ? (
                      <div className="text-center py-4 text-muted-foreground border rounded-lg text-sm">
                        Nenhum item encontrado. {newField.field_type.includes('district') ? 'Selecione primeiro o país.' : 'Verifique se existem registos no sistema.'}
                      </div>
                    ) : (
                      <ScrollArea className="h-40 border rounded-lg p-2">
                        <div className="space-y-2">
                          {systemEntities.map((entity) => (
                            <div key={entity.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`entity-${entity.id}`}
                                checked={selectedEntityIds.includes(entity.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedEntityIds([...selectedEntityIds, entity.id]);
                                  } else {
                                    setSelectedEntityIds(selectedEntityIds.filter(id => id !== entity.id));
                                  }
                                }}
                              />
                              <Label 
                                htmlFor={`entity-${entity.id}`} 
                                className="font-normal cursor-pointer text-sm"
                              >
                                {entity.name}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {selectedEntityIds.length} de {systemEntities.length} selecionados
                    </p>
                  </div>
                )}

                {/* Display Style for select-type fields */}
                {(getSystemEntityType(newField.field_type) || newField.field_type === 'select') && !isMultiSelectType(newField.field_type) && (
                  <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
                    <div className="flex items-center gap-2">
                      <CircleDot className="w-4 h-4 text-primary" />
                      <Label className="font-medium">Estilo de Apresentação</Label>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        type="button"
                        variant={newField.display_style === 'dropdown' ? 'default' : 'outline'}
                        size="sm"
                        className="justify-start"
                        onClick={() => setNewField({ ...newField, display_style: 'dropdown' })}
                      >
                        <ChevronDown className="w-4 h-4 mr-2" />
                        Dropdown
                      </Button>
                      <Button
                        type="button"
                        variant={newField.display_style === 'radio' ? 'default' : 'outline'}
                        size="sm"
                        className="justify-start"
                        onClick={() => setNewField({ ...newField, display_style: 'radio' })}
                      >
                        <CircleDot className="w-4 h-4 mr-2" />
                        Radio
                      </Button>
                      <Button
                        type="button"
                        variant={newField.display_style === 'buttons' ? 'default' : 'outline'}
                        size="sm"
                        className="justify-start"
                        onClick={() => setNewField({ ...newField, display_style: 'buttons' })}
                      >
                        <Zap className="w-4 h-4 mr-2" />
                        Botões
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <Switch
                        checked={newField.show_icons}
                        onCheckedChange={(v) => setNewField({ ...newField, show_icons: v })}
                      />
                      <Label className="text-sm">Mostrar ícones nas opções</Label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {newField.display_style === 'dropdown' && 'O utilizador seleciona de uma lista suspensa (2 cliques)'}
                      {newField.display_style === 'radio' && 'O utilizador seleciona diretamente (1 clique)'}
                      {newField.display_style === 'buttons' && 'Opções apresentadas como botões (1 clique)'}
                    </p>
                  </div>
                )}

                {/* Multi-select option for select-type fields */}
                {(newField.field_type === 'select' || newField.field_type === 'checkbox') && (
                  <div className="flex items-center gap-2 border rounded-lg p-3 bg-muted/30">
                    <CheckSquare className="w-4 h-4 text-primary" />
                    <Switch
                      checked={newField.is_multi_select}
                      onCheckedChange={(v) => setNewField({ ...newField, is_multi_select: v })}
                    />
                    <Label className="text-sm">Permitir múltipla seleção (ex: Casa de Banho + Cozinha)</Label>
                  </div>
                )}

                {/* Validation Rules Section */}
                <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <ListChecks className="w-4 h-4 text-primary" />
                    <Label className="font-medium">Regras de Validação</Label>
                  </div>
                  
                  {/* Type indicator */}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {newField.field_type === 'text' && <><Type className="w-4 h-4" /> Texto (string)</>}
                    {newField.field_type === 'email' && <><Mail className="w-4 h-4" /> Email (validação automática)</>}
                    {newField.field_type === 'phone' && <><Phone className="w-4 h-4" /> Telefone (números)</>}
                    {newField.field_type === 'number' && <><Hash className="w-4 h-4" /> Número</>}
                    {newField.field_type === 'date' && <><Calendar className="w-4 h-4" /> Data</>}
                    {newField.field_type === 'datetime' && <><Calendar className="w-4 h-4" /> Data e Hora</>}
                    {newField.field_type === 'url' && <><Link className="w-4 h-4" /> URL (validação automática)</>}
                    {newField.field_type === 'textarea' && <><AlignLeft className="w-4 h-4" /> Texto longo</>}
                    {newField.field_type === 'boolean' && <><CheckSquare className="w-4 h-4" /> Sim/Não</>}
                    {(newField.field_type === 'select' || newField.field_type === 'radio' || newField.field_type === 'checkbox') && <><ListChecks className="w-4 h-4" /> Opções</>}
                  </div>

                  {/* Text length limits */}
                  {['text', 'textarea', 'phone'].includes(newField.field_type) && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Mín. caracteres</Label>
                        <Input
                          type="number"
                          placeholder="Ex: 3"
                          value={newField.min_length ?? ""}
                          onChange={(e) => setNewField({ ...newField, min_length: e.target.value ? parseInt(e.target.value) : null })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Máx. caracteres</Label>
                        <Input
                          type="number"
                          placeholder={newField.field_type === 'phone' ? "Ex: 9" : "Ex: 100"}
                          value={newField.max_length ?? ""}
                          onChange={(e) => setNewField({ ...newField, max_length: e.target.value ? parseInt(e.target.value) : null })}
                        />
                      </div>
                    </div>
                  )}

                  {/* Number value limits */}
                  {newField.field_type === 'number' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Valor mínimo</Label>
                        <Input
                          type="number"
                          placeholder="Ex: 0"
                          value={newField.min_value ?? ""}
                          onChange={(e) => setNewField({ ...newField, min_value: e.target.value ? parseFloat(e.target.value) : null })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Valor máximo</Label>
                        <Input
                          type="number"
                          placeholder="Ex: 1000"
                          value={newField.max_value ?? ""}
                          onChange={(e) => setNewField({ ...newField, max_value: e.target.value ? parseFloat(e.target.value) : null })}
                        />
                      </div>
                    </div>
                  )}

                  {/* Phone specific hint */}
                  {newField.field_type === 'phone' && (
                    <p className="text-xs text-muted-foreground">
                      💡 Dica: Para telefones portugueses use máx. 9 algarismos. O campo aceita apenas números.
                    </p>
                  )}

                  {/* Custom pattern for advanced validation */}
                  {['text', 'phone', 'number'].includes(newField.field_type) && (
                    <div className="space-y-2">
                      <div>
                        <Label className="text-xs">Padrão (Regex) - Opcional</Label>
                        <Input
                          placeholder="Ex: ^[0-9]{4}-[0-9]{3}$ para código postal"
                          value={newField.pattern}
                          onChange={(e) => setNewField({ ...newField, pattern: e.target.value })}
                        />
                      </div>
                      {newField.pattern && (
                        <div>
                          <Label className="text-xs">Mensagem de erro do padrão</Label>
                          <Input
                            placeholder="Ex: O código postal deve ter o formato 1234-567"
                            value={newField.pattern_message}
                            onChange={(e) => setNewField({ ...newField, pattern_message: e.target.value })}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Placeholder and help text */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Placeholder</Label>
                      <Input
                        placeholder="Texto de exemplo no campo"
                        value={newField.placeholder}
                        onChange={(e) => setNewField({ ...newField, placeholder: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Texto de ajuda</Label>
                      <Input
                        placeholder="Instrução abaixo do campo"
                        value={newField.help_text}
                        onChange={(e) => setNewField({ ...newField, help_text: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-sm">{t("campaigns.fields.mapToContact")}</Label>
                    <Select
                      value={newField.contact_field_mapping}
                      onValueChange={(v) => setNewField({ ...newField, contact_field_mapping: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("campaigns.fields.noMapping")} />
                      </SelectTrigger>
                      <SelectContent>
                        {CONTACT_FIELDS.map((f) => (
                          <SelectItem key={f.value || "_none"} value={f.value || "_none"}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">{t("campaigns.fields.mapToClient")}</Label>
                    <Select
                      value={newField.client_field_mapping}
                      onValueChange={(v) => setNewField({ ...newField, client_field_mapping: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("campaigns.fields.noMapping")} />
                      </SelectTrigger>
                      <SelectContent>
                        {CLIENT_FIELDS.map((f) => (
                          <SelectItem key={f.value || "_none"} value={f.value || "_none"}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={newField.is_required}
                      onCheckedChange={(v) => setNewField({ ...newField, is_required: v })}
                    />
                    <Label>Obrigatório</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={newField.is_unique}
                      onCheckedChange={(v) => setNewField({ ...newField, is_unique: v })}
                    />
                    <Label>Único</Label>
                  </div>
                </div>
                <Button onClick={handleAddField} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  {t("campaigns.fields.addField") || "Add Field"}
                </Button>
              </CardContent>
            </Card>

            {/* Existing Fields - Grouped by Step */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                {t("campaigns.fields.configured") || "Configured Fields"} ({fieldDefs.length})
              </h4>
              {fieldDefs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                  {t("campaigns.fields.noFields") || "No fields configured yet. Add your first field above."}
                </div>
              ) : (
                formSteps.map((step) => {
                  const stepFields = fieldDefs.filter(f => f.step_number === step.step_number);
                  if (stepFields.length === 0) return null;
                  
                  return (
                    <div key={step.step_number} className="space-y-2">
                      <div className="flex items-center gap-2 bg-muted/50 px-3 py-2 rounded-lg">
                        <Badge variant="outline" className="bg-primary/10 text-primary">
                          {step.step_number}. {step.step_title}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {stepFields.length} {stepFields.length === 1 ? 
                            (t("campaigns.steps.field") || 'field') : 
                            (t("campaigns.steps.fields") || 'fields')}
                        </span>
                      </div>
                      
                      {stepFields.map((field) => (
                        <div
                          key={field.id}
                          className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors ml-4"
                        >
                          {editingField?.id === field.id ? (
                            // Edit mode
                            <div className="flex-1 space-y-2">
                              <div className="grid grid-cols-3 gap-2">
                                <Input
                                  value={editingField.field_label}
                                  onChange={(e) =>
                                    setEditingField({ ...editingField, field_label: e.target.value })
                                  }
                                  placeholder="Label"
                                />
                                <Select
                                  value={editingField.field_type}
                                  onValueChange={(v) => setEditingField({ ...editingField, field_type: v })}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="text">Text</SelectItem>
                                    <SelectItem value="email">Email</SelectItem>
                                    <SelectItem value="phone">Phone</SelectItem>
                                    <SelectItem value="number">Number</SelectItem>
                                    <SelectItem value="date">Date</SelectItem>
                                    <SelectItem value="datetime">Date & Time</SelectItem>
                                    <SelectItem value="boolean">Yes/No</SelectItem>
                                    <SelectItem value="select">Dropdown</SelectItem>
                                    <SelectItem value="textarea">Long Text</SelectItem>
                                    <SelectItem value="url">URL</SelectItem>
                                    <SelectItem value="_separator1" disabled className="text-muted-foreground font-semibold">
                                      — References —
                                    </SelectItem>
                                    <SelectItem value="ref_company">Company</SelectItem>
                                    <SelectItem value="ref_business_unit">Business Unit</SelectItem>
                                    <SelectItem value="ref_department">Department</SelectItem>
                                    <SelectItem value="ref_contact">Contact</SelectItem>
                                    <SelectItem value="ref_client">Client</SelectItem>
                                    <SelectItem value="ref_employee">Employee</SelectItem>
                                    <SelectItem value="_separator2" disabled className="text-muted-foreground font-semibold">
                                      — Lists —
                                    </SelectItem>
                                    <SelectItem value="list_products">Product List</SelectItem>
                                    <SelectItem value="list_services">Service List</SelectItem>
                                    <SelectItem value="ref_product">Single Product</SelectItem>
                                    <SelectItem value="ref_service">Single Service</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Select
                                  value={String(editingField.step_number)}
                                  onValueChange={(v) => setEditingField({ ...editingField, step_number: parseInt(v) })}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {formSteps.map((s) => (
                                      <SelectItem key={s.step_number} value={String(s.step_number)}>
                                        {s.step_number}. {s.step_title}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">{t("campaigns.fields.mapToContact")}</Label>
                                  <Select
                                    value={editingField.contact_field_mapping || "_none"}
                                    onValueChange={(v) =>
                                      setEditingField({
                                        ...editingField,
                                        contact_field_mapping: v === "_none" ? null : v,
                                      })
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder={t("campaigns.fields.noMapping")} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {CONTACT_FIELDS.map((f) => (
                                        <SelectItem key={f.value || "_none"} value={f.value || "_none"}>
                                          {f.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">{t("campaigns.fields.mapToClient")}</Label>
                                  <Select
                                    value={editingField.client_field_mapping || "_none"}
                                    onValueChange={(v) =>
                                      setEditingField({
                                        ...editingField,
                                        client_field_mapping: v === "_none" ? null : v,
                                      })
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder={t("campaigns.fields.noMapping")} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {CLIENT_FIELDS.map((f) => (
                                        <SelectItem key={f.value || "_none"} value={f.value || "_none"}>
                                          {f.label}
                                      </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="flex items-center gap-1">
                                  <Switch
                                    checked={editingField.is_required}
                                    onCheckedChange={(v) =>
                                      setEditingField({ ...editingField, is_required: v })
                                    }
                                  />
                                  <span className="text-xs">Obrigatório</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Switch
                                    checked={editingField.is_unique}
                                    onCheckedChange={(v) =>
                                      setEditingField({ ...editingField, is_unique: v })
                                    }
                                  />
                                  <span className="text-xs">Único</span>
                                </div>
                              </div>
                              <div className="flex gap-1 justify-end">
                                <Button size="sm" onClick={handleUpdateField}>
                                  Save
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setEditingField(null)}>
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            // View mode
                            <>
                              <div className="flex items-center gap-2 flex-1">
                                <GripVertical className="w-4 h-4 text-muted-foreground" />
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{field.field_label}</span>
                                    <span className="text-muted-foreground text-sm">({field.field_key})</span>
                                  </div>
                                  {field.contact_field_mapping && (
                                    <div className="text-xs text-muted-foreground">
                                      → Contacto:{" "}
                                      <span className="font-medium">{field.contact_field_mapping}</span>
                                    </div>
                                  )}
                                  {field.client_field_mapping && (
                                    <div className="text-xs text-muted-foreground">
                                      → Cliente:{" "}
                                      <span className="font-medium">{field.client_field_mapping}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                {/* Type badge with icon */}
                                <Badge variant="outline" className="flex items-center gap-1">
                                  {field.field_type === 'text' && <Type className="w-3 h-3" />}
                                  {field.field_type === 'email' && <Mail className="w-3 h-3" />}
                                  {field.field_type === 'phone' && <Phone className="w-3 h-3" />}
                                  {field.field_type === 'number' && <Hash className="w-3 h-3" />}
                                  {field.field_type === 'date' && <Calendar className="w-3 h-3" />}
                                  {field.field_type === 'datetime' && <Calendar className="w-3 h-3" />}
                                  {field.field_type === 'url' && <Link className="w-3 h-3" />}
                                  {field.field_type === 'textarea' && <AlignLeft className="w-3 h-3" />}
                                  {(field.field_type === 'select' || field.field_type === 'radio' || field.field_type === 'checkbox') && <ListChecks className="w-3 h-3" />}
                                  {field.field_type}
                                </Badge>
                                {field.is_required && <Badge>Obrigatório</Badge>}
                                {field.is_unique && <Badge variant="secondary">Único</Badge>}
                                {field.is_multi_select && <Badge variant="secondary" className="bg-purple-100 text-purple-700">Multi</Badge>}
                                {(field.max_length || field.min_length) && (
                                  <Badge variant="outline" className="text-xs">
                                    {field.min_length && `min:${field.min_length}`}
                                    {field.min_length && field.max_length && ' / '}
                                    {field.max_length && `max:${field.max_length}`}
                                  </Badge>
                                )}
                                {field.display_style && field.display_style !== 'dropdown' && (
                                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700">
                                    {field.display_style === 'radio' && 'Radio'}
                                    {field.display_style === 'buttons' && 'Botões'}
                                  </Badge>
                                )}
                                {(field.contact_field_mapping || field.client_field_mapping) && (
                                  <Badge variant="default" className="bg-green-600">
                                    Mapeado
                                  </Badge>
                                )}
                                <Button variant="ghost" size="icon" onClick={() => setEditingField(field)}>
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => handleDeleteField(field.id)}>
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })
              )}
            </div>
          </TabsContent>

          {/* Sections Configuration Tab */}
          <TabsContent value="sections" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Agrupe campos em secções para melhor organização visual do formulário.
            </p>
            <FormSectionsConfig
              campaignId={campaignId}
              formSteps={formSteps}
            />
          </TabsContent>

          {/* Icons Configuration Tab */}
          <TabsContent value="icons" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Configure ícones Lucide para opções de campos select/radio.
            </p>
            <ScrollArea className="h-[500px]">
              <div className="space-y-6 pr-4">
                {fieldDefs.filter(f => 
                  ['select', 'ref_service', 'ref_product', 'ref_district'].includes(f.field_type) && 
                  f.options?.options?.length
                ).map(field => (
                  <FieldOptionIcons 
                    key={field.id} 
                    field={field} 
                    onUpdate={loadFieldDefinitions} 
                  />
                ))}
                {fieldDefs.filter(f => 
                  ['select', 'ref_service', 'ref_product', 'ref_district'].includes(f.field_type) && 
                  f.options?.options?.length
                ).length === 0 && (
                  <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                    Nenhum campo com opções. Adicione campos do tipo "Select" com opções para configurar ícones.
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Info Blocks Tab */}
          <TabsContent value="info" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Adicione blocos de informação aos passos do formulário para fornecer contexto ou instruções aos utilizadores.
            </p>

            <StepInfoBlocksConfig 
              campaignId={campaignId}
              formSteps={formSteps}
              open={infoBlocksDialogOpen || true}
              onOpenChange={setInfoBlocksDialogOpen}
            />
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.close") || "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
