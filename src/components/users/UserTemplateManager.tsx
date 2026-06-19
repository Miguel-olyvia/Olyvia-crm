import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Trash2,
  Edit2,
  Save,
  Loader2,
  Settings2,
  Copy,
  X,
} from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  TemplateFieldsConfig,
  FieldConfig,
  getDefaultFieldConfig,
} from "./TemplateFieldsConfig";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

interface Organization {
  id: string;
  name: string;
  type: string;
  parent_id?: string | null;
}

interface UserTemplate {
  id: string;
  name: string;
  description: string | null;
  organization_id: string | null;
  
  is_active: boolean;
  created_at: string;
  // Computed fields for display
  organization_ids?: string[];
  custom_attrs_count?: number;
}

interface UserTemplateField {
  id: string;
  template_id: string;
  field_key: string;
  field_label: string;
  field_type: string;
  is_required: boolean;
  is_visible: boolean;
  default_value: string | null;
  options: any;
  sort_order: number;
}

interface UserTemplateAttribute {
  id: string;
  template_id: string;
  attribute_name: string;
  attribute_label: string;
  attribute_type: string;
  is_required: boolean;
  default_value: string | null;
  options: any;
  placeholder: string | null;
  sort_order: number;
}

interface UserTemplateManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizations: Organization[];
  onTemplateSelect?: (template: UserTemplate, fields: FieldConfig[], customAttrs: FieldConfig[]) => void;
}

export function UserTemplateManager({
  open,
  onOpenChange,
  organizations,
  onTemplateSelect,
}: UserTemplateManagerProps) {
  const { t } = useTranslation();
  const { activeCompany } = useCompany();
  const activeOrgId = activeCompany?.id || null;
  const [templates, setTemplates] = useState<UserTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<UserTemplate | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<UserTemplate | null>(null);
  const [activeTab, setActiveTab] = useState("list");
  const [isEditing, setIsEditing] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formOrgIds, setFormOrgIds] = useState<string[]>([]);
  const [fields, setFields] = useState<FieldConfig[]>(getDefaultFieldConfig());
  const [customAttributes, setCustomAttributes] = useState<FieldConfig[]>([]);

  useEffect(() => {
    if (open) {
      loadTemplates();
    }
  }, [open, activeOrgId]);

  const loadTemplates = async () => {
    try {
      setLoading(true);

      // If activeOrgId is set, only load templates associated with that org
      let templateIds: string[] | null = null;
      if (activeOrgId) {
        const { data: orgTemplates } = await supabase
          .from("user_template_organizations")
          .select("template_id")
          .eq("organization_id", activeOrgId);
        
        templateIds = orgTemplates?.map(ot => ot.template_id) || [];
        
        // If no templates associated with this org, return empty
        if (templateIds.length === 0) {
          setTemplates([]);
          setLoading(false);
          return;
        }
      }

      let query = supabase
        .from("user_creation_templates")
        .select("*")
        .eq("is_active", true)
        .order("name");

      if (templateIds) {
        query = query.in("id", templateIds);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Load extra metadata for each template
      const templatesWithMeta = await Promise.all(
        (data || []).map(async (t) => {
          // Get organizations
          const { data: orgData } = await supabase
            .from("user_template_organizations")
            .select("organization_id")
            .eq("template_id", t.id);
          
          // Get custom attributes count
          const { count: attrsCount } = await supabase
            .from("user_template_attributes")
            .select("*", { count: "exact", head: true })
            .eq("template_id", t.id);
          
          return {
            ...t,
            organization_ids: orgData?.map(o => o.organization_id) || [],
            custom_attrs_count: attrsCount || 0,
          };
        })
      );
      
      setTemplates(templatesWithMeta);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadTemplateDetails = async (templateId: string): Promise<{ fields: FieldConfig[], customAttrs: FieldConfig[] }> => {
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

      // Convert to FieldConfig format
      let loadedFields: FieldConfig[];
      if (fieldsData && fieldsData.length > 0) {
        loadedFields = fieldsData.map((f) => ({
          key: f.field_key,
          label: f.field_label,
          type: f.field_type,
          isRequired: f.is_required,
          isVisible: f.is_visible,
          isCustom: false,
          defaultValue: f.default_value || undefined,
          sortOrder: f.sort_order,
        }));
      } else {
        loadedFields = getDefaultFieldConfig();
      }
      setFields(loadedFields);

      let loadedAttrs: FieldConfig[] = [];
      if (attrsData && attrsData.length > 0) {
        loadedAttrs = attrsData.map((a: any) => ({
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
        }));
      }
      setCustomAttributes(loadedAttrs);

      return { fields: loadedFields, customAttrs: loadedAttrs };
    } catch (error: any) {
      toast.error(error.message);
      return { fields: getDefaultFieldConfig(), customAttrs: [] };
    }
  };

  const handleCreateNew = () => {
    setEditingTemplate(null);
    setFormName("");
    setFormDescription("");
    // Pre-select active org when creating new template
    setFormOrgIds(activeOrgId ? [activeOrgId] : []);
    setFields(getDefaultFieldConfig());
    setCustomAttributes([]);
    setIsEditing(true);
    setActiveTab("edit");
  };

  const handleEdit = async (template: UserTemplate) => {
    setEditingTemplate(template);
    setFormName(template.name);
    setFormDescription(template.description || "");
    // Load organizations from junction table
    const { data: orgData } = await supabase
      .from("user_template_organizations")
      .select("organization_id")
      .eq("template_id", template.id)
      .order("sort_order");
    setFormOrgIds(orgData?.map(o => o.organization_id) || []);
    await loadTemplateDetails(template.id);
    setIsEditing(true);
    setActiveTab("edit");
  };

  const handleDuplicate = async (template: UserTemplate) => {
    setEditingTemplate(null);
    setFormName(`${template.name} (Cópia)`);
    setFormDescription(template.description || "");
    // Load organizations from junction table
    const { data: orgData } = await supabase
      .from("user_template_organizations")
      .select("organization_id")
      .eq("template_id", template.id)
      .order("sort_order");
    setFormOrgIds(orgData?.map(o => o.organization_id) || []);
    await loadTemplateDetails(template.id);
    setIsEditing(true);
    setActiveTab("edit");
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error(t("templates.nameRequired"));
      return;
    }

    setSaving(true);
    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");

      let templateId = editingTemplate?.id;

      if (editingTemplate) {
        // Update existing
        const { error } = await supabase
          .from("user_creation_templates")
          .update({
            name: formName.trim(),
            description: formDescription.trim() || null,
          })
          .eq("id", editingTemplate.id);

        if (error) throw error;
      } else {
        // Create new
        const { data, error } = await supabase
          .from("user_creation_templates")
          .insert({
            name: formName.trim(),
            description: formDescription.trim() || null,
            created_by: businessUserId,
          })
          .select()
          .single();

        if (error) throw error;
        templateId = data.id;
      }

      if (templateId) {
        // Delete existing fields, attributes and organizations
        await supabase
          .from("user_template_fields")
          .delete()
          .eq("template_id", templateId);

        await supabase
          .from("user_template_attributes")
          .delete()
          .eq("template_id", templateId);

        await supabase
          .from("user_template_organizations")
          .delete()
          .eq("template_id", templateId);

        // Insert organizations
        if (formOrgIds.length > 0) {
          const orgsToInsert = formOrgIds.map((orgId, index) => ({
            template_id: templateId,
            organization_id: orgId,
            sort_order: index,
          }));
          await supabase.from("user_template_organizations").insert(orgsToInsert as any);
        }

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

      toast.success(
        editingTemplate ? t("templates.updated") : t("templates.created")
      );
      setIsEditing(false);
      setActiveTab("list");
      loadTemplates();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedTemplate) return;

    try {
      const { error } = await supabase
        .from("user_creation_templates")
        .update({ is_active: false })
        .eq("id", selectedTemplate.id);

      if (error) throw error;

      toast.success(t("templates.deleted"));
      setShowDeleteDialog(false);
      setSelectedTemplate(null);
      loadTemplates();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleSelectTemplate = async (template: UserTemplate) => {
    const { fields: loadedFields, customAttrs: loadedAttrs } = await loadTemplateDetails(template.id);
    if (onTemplateSelect) {
      onTemplateSelect(template, loadedFields, loadedAttrs);
    }
    onOpenChange(false);
  };

  const getOrgName = (orgId: string | null) => {
    if (!orgId) return null;
    return organizations.find((o) => o.id === orgId)?.name;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5" />
              {t("templates.manageUserTemplates")}
            </DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="list">{t("templates.templateList")}</TabsTrigger>
              <TabsTrigger value="edit" disabled={!isEditing}>
                {editingTemplate ? t("common.edit") : isEditing ? t("common.new") : t("common.edit")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="list" className="flex-1 overflow-hidden mt-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-muted-foreground">
                  {t("templates.manageDescription")}
                </p>
                <Button size="sm" onClick={handleCreateNew}>
                  <Plus className="w-4 h-4 mr-1" />
                  {t("templates.create")}
                </Button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-12 border rounded-lg bg-muted/30">
                  <FileText className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-sm text-muted-foreground mb-2">
                    {t("templates.noTemplates")}
                  </p>
                  <Button variant="link" size="sm" onClick={handleCreateNew}>
                    {t("templates.createFirst")}
                  </Button>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2 pr-3">
                    {templates.map((template) => (
                      <div
                        key={template.id}
                        className="p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors group cursor-pointer"
                        onClick={() => handleSelectTemplate(template)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium truncate">{template.name}</h4>
                            {template.description && (
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                {template.description}
                              </p>
                            )}
                            {/* Template metadata badges */}
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {/* Organizations */}
                              {(template.organization_ids && template.organization_ids.length > 0) && (
                                <Badge variant="secondary" className="text-xs">
                                  <Building2 className="w-3 h-3 mr-1" />
                                  {template.organization_ids.length === 1
                                    ? getOrgName(template.organization_ids[0])
                                    : `${template.organization_ids.length} orgs`
                                  }
                                </Badge>
                              )}
                              {/* Custom attributes count */}
                              {(template.custom_attrs_count ?? 0) > 0 && (
                                <Badge variant="outline" className="text-xs bg-primary/10">
                                  {template.custom_attrs_count} {template.custom_attrs_count === 1 ? 'atributo' : 'atributos'}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDuplicate(template);
                              }}
                              title={t("common.duplicate")}
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(template);
                              }}
                              title={t("common.edit")}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation();
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
            </TabsContent>

            <TabsContent value="edit" className="flex-1 overflow-hidden mt-4 flex flex-col">
              {/* Basic info - compact at top */}
              <div className="grid gap-3 md:grid-cols-3 mb-4 pb-4 border-b">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("common.name")} *</Label>
                  <Input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder={t("templates.namePlaceholder")}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("common.description")}</Label>
                  <Input
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder={t("templates.descriptionPlaceholder")}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("users.organizations")}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between h-auto min-h-10"
                      >
                        <div className="flex flex-wrap gap-1">
                          {formOrgIds.length > 0 ? (
                            organizations
                              .filter((o) => formOrgIds.includes(o.id))
                              .map((org) => (
                                <Badge
                                  key={org.id}
                                  variant="secondary"
                                  className="mr-1 mb-1"
                                >
                                  {org.name}
                                  <button
                                    className="ml-1 rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setFormOrgIds(formOrgIds.filter((id) => id !== org.id));
                                    }}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </Badge>
                              ))
                          ) : (
                            <span className="text-muted-foreground">
                              {t("templates.selectOrganizations")}
                            </span>
                          )}
                        </div>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start">
                      <Command>
                        <CommandInput placeholder={t("common.searchCompany")} />
                        <CommandList>
                          <CommandEmpty>{t("common.noCompanyFound")}</CommandEmpty>
                          <CommandGroup>
                            {organizations.map((org) => (
                              <CommandItem
                                key={org.id}
                                value={org.name}
                                onSelect={() => {
                                  setFormOrgIds(
                                    formOrgIds.includes(org.id)
                                      ? formOrgIds.filter((id) => id !== org.id)
                                      : [...formOrgIds, org.id]
                                  );
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    formOrgIds.includes(org.id) ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {org.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Field configuration - main content */}
              <div className="flex-1 overflow-hidden">
                <div className="flex items-center gap-2 mb-3">
                  <Settings2 className="w-4 h-4 text-primary" />
                  <h4 className="text-sm font-semibold">{t("templates.fieldConfiguration")}</h4>
                </div>
                <ScrollArea className="h-[350px] pr-4">
                  <TemplateFieldsConfig
                    fields={fields}
                    onFieldsChange={setFields}
                    customAttributes={customAttributes}
                    onCustomAttributesChange={setCustomAttributes}
                  />
                </ScrollArea>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t mt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditing(false);
                    setActiveTab("list");
                  }}
                >
                  {t("common.cancel")}
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <Save className="w-4 h-4 mr-2" />
                  {t("common.save")}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
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
            <AlertDialogAction onClick={handleDelete}>
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
