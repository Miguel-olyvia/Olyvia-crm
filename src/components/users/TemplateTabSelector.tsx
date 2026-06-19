import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useTranslation } from "@/hooks/useTranslation";
import { useToast } from "@/hooks/use-toast";
import { FieldConfig } from "./TemplateFieldsConfig";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Pencil, Trash2, FileText, Settings2, ChevronRight,
} from "lucide-react";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

interface UserTemplate {
  id: string;
  name: string;
  description: string | null;
  organization_id: string | null;
  organization_ids: string[];
  default_role_id: string | null;
  default_relationship_type: string;
  field_configs: FieldConfig[];
  custom_attributes: FieldConfig[];
  is_active: boolean;
  sort_order: number;
}

interface Organization {
  id: string;
  name: string;
  type: string;
}

interface AnewRole {
  id: string;
  name: string;
  code: string;
}

interface TemplateTabSelectorProps {
  organizations: Organization[];
  selectedTemplateId?: string;
  onTemplateSelect: (template: UserTemplate | null, fields: FieldConfig[], customAttrs: FieldConfig[]) => void;
  onManageTemplates?: () => void;
}

export function TemplateTabSelector({
  organizations,
  selectedTemplateId,
  onTemplateSelect,
  onManageTemplates,
}: TemplateTabSelectorProps) {
  const { activeCompany } = useCompany();
  const { t } = useTranslation();
  const { toast } = useToast();

  const [templates, setTemplates] = useState<UserTemplate[]>([]);
  const [roles, setRoles] = useState<AnewRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [showManageDialog, setShowManageDialog] = useState(false);
  const [showFormDialog, setShowFormDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<UserTemplate | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    organization_id: "",
    default_role_id: "",
    default_relationship_type: "MEMBER",
    is_active: true,
  });
  const [selectedOrgIds, setSelectedOrgIds] = useState<string[]>([]);

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("user_creation_templates")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");

      if (error) throw error;

      // Load org associations for each template
      const templateIds = (data || []).map((t: any) => t.id);
      let orgAssociations: any[] = [];
      if (templateIds.length > 0) {
        const { data: orgs } = await (supabase as any)
          .from("user_template_organizations")
          .select("template_id, organization_id")
          .in("template_id", templateIds);
        orgAssociations = orgs || [];
      }

      const mapped: UserTemplate[] = (data || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        organization_id: t.organization_id,
        organization_ids: orgAssociations
          .filter((o: any) => o.template_id === t.id)
          .map((o: any) => o.organization_id),
        default_role_id: t.default_role_id || null,
        default_relationship_type: t.default_relationship_type || "MEMBER",
        field_configs: Array.isArray(t.field_configs) ? t.field_configs : [],
        custom_attributes: Array.isArray(t.custom_attributes) ? t.custom_attributes : [],
        is_active: t.is_active,
        sort_order: t.sort_order || 0,
      }));

      setTemplates(mapped);
    } catch (err: any) {
      console.error("Error loading templates:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRoles = useCallback(async () => {
    if (!activeCompany) return;
    const { data } = await (supabase as any)
      .from("anew_roles")
      .select("id, name, code")
      .or(`organization_id.eq.${activeCompany.id},organization_id.is.null`)
      .order("name");
    setRoles(data || []);
  }, [activeCompany]);

  useEffect(() => {
    loadTemplates();
    loadRoles();
  }, [loadTemplates, loadRoles]);

  const handleSelectTemplate = (template: UserTemplate) => {
    onTemplateSelect(template, template.field_configs, template.custom_attributes);
  };

  const openCreateForm = () => {
    setEditingTemplate(null);
    setFormData({
      name: "",
      description: "",
      organization_id: activeCompany?.id || "",
      default_role_id: "",
      default_relationship_type: "MEMBER",
      is_active: true,
    });
    setSelectedOrgIds([]);
    setShowFormDialog(true);
  };

  const openEditForm = (template: UserTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      description: template.description || "",
      organization_id: template.organization_id || "",
      default_role_id: template.default_role_id || "",
      default_relationship_type: template.default_relationship_type,
      is_active: template.is_active,
    });
    setSelectedOrgIds(template.organization_ids);
    setShowFormDialog(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({ title: t("common.error"), description: "Nome é obrigatório", variant: "destructive" });
      return;
    }

    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        organization_id: formData.organization_id || null,
        default_role_id: formData.default_role_id || null,
        default_relationship_type: formData.default_relationship_type,
        is_active: formData.is_active,
      };

      let templateId: string;

      if (editingTemplate) {
        const { error } = await (supabase as any)
          .from("user_creation_templates")
          .update(payload)
          .eq("id", editingTemplate.id);
        if (error) throw error;
        templateId = editingTemplate.id;
      } else {
        const businessUserId = await resolveCurrentBusinessUserId();
        if (!businessUserId) throw new Error("Business user not resolved");
        const { data, error } = await (supabase as any)
          .from("user_creation_templates")
          .insert({ ...payload, created_by: businessUserId })
          .select("id")
          .single();
        if (error) throw error;
        templateId = data.id;
      }

      // Sync org associations
      await (supabase as any)
        .from("user_template_organizations")
        .delete()
        .eq("template_id", templateId);

      if (selectedOrgIds.length > 0) {
        const rows = selectedOrgIds.map(orgId => ({
          template_id: templateId,
          organization_id: orgId,
        }));
        await (supabase as any)
          .from("user_template_organizations")
          .insert(rows);
      }

      toast({ title: editingTemplate ? "Template atualizado" : "Template criado" });
      setShowFormDialog(false);
      loadTemplates();
    } catch (err: any) {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const { error } = await (supabase as any)
        .from("user_creation_templates")
        .delete()
        .eq("id", deleteId);
      if (error) throw error;
      toast({ title: "Template eliminado" });
      setDeleteId(null);
      loadTemplates();
    } catch (err: any) {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    }
  };

  const toggleOrgId = (orgId: string) => {
    setSelectedOrgIds(prev =>
      prev.includes(orgId) ? prev.filter(id => id !== orgId) : [...prev, orgId]
    );
  };

  if (loading) return null;

  return (
    <div className="space-y-3">
      {/* Template quick selector */}
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Template de Criação</Label>
        <Button variant="ghost" size="sm" onClick={() => setShowManageDialog(true)}>
          <Settings2 className="h-3.5 w-3.5 mr-1" />
          Gerir
        </Button>
      </div>

      {templates.length === 0 ? (
        <div className="border border-dashed rounded-lg p-4 text-center">
          <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground mb-2">Nenhum template configurado</p>
          <Button variant="outline" size="sm" onClick={openCreateForm}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Criar Template
          </Button>
        </div>
      ) : (
        <div className="grid gap-2">
          {/* None option */}
          <button
            type="button"
            onClick={() => onTemplateSelect(null, [], [])}
            className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
              !selectedTemplateId
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-muted/50"
            }`}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Sem template</p>
              <p className="text-xs text-muted-foreground">Formulário padrão</p>
            </div>
          </button>

          {templates.map(template => (
            <button
              key={template.id}
              type="button"
              onClick={() => handleSelectTemplate(template)}
              className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                selectedTemplateId === template.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{template.name}</p>
                {template.description && (
                  <p className="text-xs text-muted-foreground truncate">{template.description}</p>
                )}
                <div className="flex gap-1 mt-1">
                  {template.field_configs.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {template.field_configs.length} campos
                    </Badge>
                  )}
                  {template.organization_ids.length > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {template.organization_ids.length} orgs
                    </Badge>
                  )}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* Manage Templates Dialog */}
      <Dialog open={showManageDialog} onOpenChange={setShowManageDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Gerir Templates de Criação</DialogTitle>
          </DialogHeader>
          <div className="flex justify-end mb-2">
            <Button size="sm" onClick={openCreateForm}>
              <Plus className="h-4 w-4 mr-1" /> Novo Template
            </Button>
          </div>
          <ScrollArea className="max-h-[50vh]">
            <div className="space-y-2">
              {templates.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum template criado</p>
              )}
              {templates.map(template => {
                const orgNames = organizations
                  .filter(o => template.organization_ids.includes(o.id))
                  .map(o => o.name);
                return (
                  <div key={template.id} className="flex items-center gap-3 p-3 border rounded-lg">
                    <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{template.name}</p>
                      {template.description && (
                        <p className="text-xs text-muted-foreground">{template.description}</p>
                      )}
                      {orgNames.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Orgs: {orgNames.join(", ")}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setShowManageDialog(false); openEditForm(template); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(template.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Template Dialog */}
      <Dialog open={showFormDialog} onOpenChange={setShowFormDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Editar Template" : "Novo Template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome *</Label>
              <Input
                value={formData.name}
                onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                placeholder="Ex: Comercial Standard"
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                value={formData.description}
                onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                placeholder="Descrição do template..."
                rows={2}
              />
            </div>
            <div>
              <Label>Role Padrão</Label>
              <Select
                value={formData.default_role_id}
                onValueChange={v => setFormData(p => ({ ...p, default_role_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar role..." />
                </SelectTrigger>
                <SelectContent>
                  {roles.map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo de Relação</Label>
              <Select
                value={formData.default_relationship_type}
                onValueChange={v => setFormData(p => ({ ...p, default_relationship_type: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MEMBER">Membro</SelectItem>
                  <SelectItem value="BELONGS_TO">Pertence a</SelectItem>
                  <SelectItem value="EMPLOYEE">Colaborador</SelectItem>
                  <SelectItem value="CONTRACTOR">Contratado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {organizations.length > 0 && (
              <div>
                <Label>Organizações Associadas</Label>
                <ScrollArea className="h-[200px] border rounded-md p-2 mt-1">
                  <div className="space-y-1">
                    {organizations.map(org => (
                      <label key={org.id} className="flex items-center gap-2 text-sm cursor-pointer py-1">
                        <Checkbox
                          checked={selectedOrgIds.includes(org.id)}
                          onCheckedChange={() => toggleOrgId(org.id)}
                        />
                        <span>{org.name}</span>
                        <Badge variant="outline" className="text-xs ml-auto">{org.type}</Badge>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFormDialog(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{editingTemplate ? "Guardar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Template</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. O template será eliminado permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
