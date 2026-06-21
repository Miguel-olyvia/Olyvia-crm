import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Plus,
  FileText,
  Building2,
  Briefcase,
  MapPin,
  Trash2,
  Edit2,
  Check,
  Save,
  Loader2,
  Settings2,
} from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { OrganizationCombobox } from "./OrganizationCombobox";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import {
  TemplateFieldsConfig,
  FieldConfig,
  getDefaultFieldConfig,
} from "./TemplateFieldsConfig";

interface Organization {
  id: string;
  name: string;
  type: string;
}

interface UserTemplate {
  id: string;
  name: string;
  description: string | null;
  organization_id: string | null;
  relationship_type: string | null;
  default_role: string | null;
  default_position: string | null;
  default_location: string | null;
  default_status: string | null;
  social_angellist: string | null;
  social_facebook: string | null;
  social_linkedin: string | null;
  is_active: boolean;
  created_by: string | null;
}

interface TemplateFormData {
  name: string;
  description: string;
  organization_id: string;
  default_position: string;
  default_location: string;
  social_angellist: string;
  social_facebook: string;
  social_linkedin: string;
}

interface UserTemplatesTabProps {
  organizations: Organization[];
  onApplyTemplate: (template: UserTemplate) => void;
  currentFormData?: {
    position: string;
    location: string;
    organizationId: string;
    socialLinks: {
      angellist: string;
      facebook: string;
      linkedin: string;
    };
  };
}

export function UserTemplatesTab({
  organizations,
  onApplyTemplate,
  currentFormData,
}: UserTemplatesTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<UserTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<UserTemplate | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<UserTemplate | null>(null);

  // Field configuration state
  const [fields, setFields] = useState<FieldConfig[]>(getDefaultFieldConfig());
  const [customAttributes, setCustomAttributes] = useState<FieldConfig[]>([]);

  const [formData, setFormData] = useState<TemplateFormData>({
    name: "",
    description: "",
    organization_id: "",
    default_position: "",
    default_location: "",
    social_angellist: "",
    social_facebook: "",
    social_linkedin: "",
  });

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from("user_creation_templates")
        .select("*")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      setTemplates((data || []) as any);
    } catch (error: any) {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadTemplateDetails = async (templateId: string) => {
    try {
      // Load fields
      const { data: fieldsData } = await supabase
        .from("user_template_fields")
        .select("*")
        .eq("template_id", templateId)
        .order("sort_order");

      // Load custom attributes
      const { data: attrsData } = await supabase
        .from("user_template_attributes")
        .select("*")
        .eq("template_id", templateId)
        .order("sort_order");

      if (fieldsData && fieldsData.length > 0) {
        setFields(
          fieldsData.map((f) => ({
            key: f.field_key,
            label: f.field_label,
            type: f.field_type,
            isRequired: f.is_required,
            isVisible: f.is_visible,
            isCustom: false,
            defaultValue: f.default_value || undefined,
            sortOrder: f.sort_order,
          }))
        );
      } else {
        setFields(getDefaultFieldConfig());
      }

      if (attrsData) {
        setCustomAttributes(
          attrsData.map((a: any) => ({
            key: a.attribute_key || a.attribute_name,
            label: a.attribute_label,
            type: a.attribute_type,
            isRequired: a.is_required || false,
            isVisible: true,
            isCustom: true,
            defaultValue: a.default_value || undefined,
            options: a.options ? (Array.isArray(a.options) ? a.options.map((o: unknown) => String(o)) : []) : [],
            placeholder: a.placeholder || undefined,
            sortOrder: a.sort_order || 0,
          }))
        );
      } else {
        setCustomAttributes([]);
      }
    } catch (error: any) {
      console.error("Error loading template details:", error);
    }
  };

  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    setFormData({
      name: "",
      description: "",
      organization_id: currentFormData?.organizationId || "",
      default_position: currentFormData?.position || "",
      default_location: currentFormData?.location || "",
      social_angellist: currentFormData?.socialLinks?.angellist || "",
      social_facebook: currentFormData?.socialLinks?.facebook || "",
      social_linkedin: currentFormData?.socialLinks?.linkedin || "",
    });
    setFields(getDefaultFieldConfig());
    setCustomAttributes([]);
    setShowCreateDialog(true);
  };

  const handleEditTemplate = async (template: UserTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      description: template.description || "",
      organization_id: template.organization_id || "",
      default_position: template.default_position || "",
      default_location: template.default_location || "",
      social_angellist: template.social_angellist || "",
      social_facebook: template.social_facebook || "",
      social_linkedin: template.social_linkedin || "",
    });
    await loadTemplateDetails(template.id);
    setShowCreateDialog(true);
  };

  const handleSaveTemplate = async () => {
    if (!formData.name.trim()) {
      toast({
        title: t("common.error"),
        description: t("templates.nameRequired"),
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");
      
      const templateData = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        organization_id: formData.organization_id || null,
        default_position: formData.default_position.trim() || null,
        default_location: formData.default_location.trim() || null,
        social_angellist: formData.social_angellist.trim() || null,
        social_facebook: formData.social_facebook.trim() || null,
        social_linkedin: formData.social_linkedin.trim() || null,
        created_by: businessUserId,
      };

      let templateId = editingTemplate?.id;

      if (editingTemplate) {
        const { error } = await supabase
          .from("user_creation_templates")
          .update(templateData as any)
          .eq("id", editingTemplate.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("user_creation_templates")
          .insert(templateData as any)
          .select()
          .single();

        if (error) throw error;
        templateId = data.id;
      }

      // Save fields and custom attributes
      if (templateId) {
        // Delete existing fields and attributes
        await supabase
          .from("user_template_fields")
          .delete()
          .eq("template_id", templateId);

        await supabase
          .from("user_template_attributes")
          .delete()
          .eq("template_id", templateId);

        // Insert fields
        const fieldsToInsert = fields.map((f, index) => ({
          template_id: templateId,
          field_key: f.key,
          field_label: f.label,
          field_type: f.type,
          is_required: f.isRequired,
          is_visible: f.isVisible,
          default_value: f.defaultValue || null,
          sort_order: index,
        }));

        const { error: fieldsError } = await supabase
          .from("user_template_fields")
          .insert(fieldsToInsert);

        if (fieldsError) throw fieldsError;

        // Insert custom attributes
        if (customAttributes.length > 0) {
          const attrsToInsert = customAttributes.map((a, index) => ({
            template_id: templateId,
            attribute_key: a.key,
            attribute_label: a.label,
            attribute_type: a.type,
            is_required: a.isRequired,
            sort_order: index,
          }));

          const { error: attrsError } = await (supabase as any)
            .from("user_template_attributes")
            .insert(attrsToInsert);

          if (attrsError) throw attrsError;
        }
      }

      toast({
        title: t("common.success"),
        description: editingTemplate ? t("templates.updated") : t("templates.created"),
      });

      setShowCreateDialog(false);
      loadTemplates();
    } catch (error: any) {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!selectedTemplate) return;

    try {
      const { error } = await supabase
        .from("user_creation_templates")
        .update({ is_active: false })
        .eq("id", selectedTemplate.id);

      if (error) throw error;

      toast({
        title: t("common.success"),
        description: t("templates.deleted"),
      });

      setShowDeleteDialog(false);
      setSelectedTemplate(null);
      loadTemplates();
    } catch (error: any) {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getOrgName = (orgId: string | null) => {
    if (!orgId) return null;
    return organizations.find((o) => o.id === orgId)?.name;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {t("templates.title")}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {t("templates.description")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleCreateTemplate}>
          <Plus className="w-4 h-4 mr-1" />
          {t("templates.create")}
        </Button>
      </div>

      {templates.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/30">
          <FileText className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground mb-2">
            {t("templates.noTemplates")}
          </p>
          <Button variant="link" size="sm" onClick={handleCreateTemplate}>
            {t("templates.createFirst")}
          </Button>
        </div>
      ) : (
        <ScrollArea className="h-[400px]">
          <div className="space-y-2 pr-3">
            {templates.map((template) => (
              <div
                key={template.id}
                className="p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium truncate">{template.name}</h4>
                    </div>
                    {template.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {template.description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-3">
                      {template.organization_id && (
                        <Badge variant="secondary" className="text-xs">
                          <Building2 className="w-3 h-3 mr-1" />
                          {getOrgName(template.organization_id)}
                        </Badge>
                      )}
                      {template.default_position && (
                        <Badge variant="outline" className="text-xs">
                          <Briefcase className="w-3 h-3 mr-1" />
                          {template.default_position}
                        </Badge>
                      )}
                      {template.default_location && (
                        <Badge variant="outline" className="text-xs">
                          <MapPin className="w-3 h-3 mr-1" />
                          {template.default_location}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onApplyTemplate(template)}
                      title={t("templates.apply")}
                    >
                      <Check className="w-4 h-4 text-primary" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleEditTemplate(template)}
                      title={t("common.edit")}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        setSelectedTemplate(template);
                        setShowDeleteDialog(true);
                      }}
                      title={t("common.delete")}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          {/* Header */}
          <div className="px-6 py-4 border-b bg-gradient-to-r from-primary/5 to-transparent">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <FileText className="w-5 h-5 text-primary" />
                {editingTemplate ? "Editar Modelo" : "Novo Modelo de Utilizador"}
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Crie um modelo para agilizar a criação de utilizadores com campos e valores predefinidos.
              </p>
            </DialogHeader>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-6">
              
              {/* Section 1: Identificação do Modelo */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">1</div>
                  <h3 className="font-medium">Identificação do Modelo</h3>
                </div>
                
                <div className="pl-8 space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="template-name" className="text-xs font-medium">
                        Nome do Modelo <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="template-name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Ex: Comercial Lisboa"
                        className="h-9"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                        Empresa Associada
                      </Label>
                      <OrganizationCombobox
                        organizations={organizations}
                        value={formData.organization_id}
                        onChange={(v) => setFormData({ ...formData, organization_id: v })}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="template-description" className="text-xs font-medium">Descrição</Label>
                    <Textarea
                      id="template-description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Breve descrição do propósito deste modelo..."
                      rows={2}
                      className="resize-none text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Campos do Formulário */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">2</div>
                  <h3 className="font-medium">Campos do Formulário</h3>
                </div>
                
                <div className="pl-8">
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-muted/50 px-4 py-2.5 border-b">
                      <p className="text-xs text-muted-foreground">
                        Configure quais campos serão visíveis e obrigatórios ao criar utilizadores com este modelo.
                      </p>
                    </div>
                    <div className="p-4">
                      <TemplateFieldsConfig
                        fields={fields}
                        onFieldsChange={setFields}
                        customAttributes={customAttributes}
                        onCustomAttributesChange={setCustomAttributes}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 3: Valores Predefinidos */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">3</div>
                  <h3 className="font-medium">Valores Predefinidos</h3>
                </div>
                
                <div className="pl-8">
                  <p className="text-xs text-muted-foreground mb-3">
                    Defina valores padrão que serão automaticamente preenchidos ao usar este modelo.
                  </p>
                  
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium flex items-center gap-1.5">
                        <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
                        Cargo
                      </Label>
                      <Input
                        value={formData.default_position}
                        onChange={(e) => setFormData({ ...formData, default_position: e.target.value })}
                        placeholder="Ex: Consultor Comercial"
                        className="h-9"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                        Localização
                      </Label>
                      <Input
                        value={formData.default_location}
                        onChange={(e) => setFormData({ ...formData, default_location: e.target.value })}
                        placeholder="Ex: Lisboa, Portugal"
                        className="h-9"
                      />
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Footer */}
          <div className="shrink-0 px-6 py-4 border-t bg-muted/30 flex items-center justify-end gap-3">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveTemplate} disabled={saving} className="min-w-[120px]">
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  A guardar...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Guardar Modelo
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("templates.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("templates.deleteConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTemplate}>
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
