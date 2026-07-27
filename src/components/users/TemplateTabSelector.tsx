import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { FieldConfig } from "./TemplateFieldsConfig";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  FileText, Settings2, ChevronRight,
} from "lucide-react";

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

  const [templates, setTemplates] = useState<UserTemplate[]>([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates, activeCompany]);

  const handleSelectTemplate = (template: UserTemplate) => {
    onTemplateSelect(template, template.field_configs, template.custom_attributes);
  };

  if (loading) return null;

  return (
    <div className="space-y-3">
      {/* Template quick selector */}
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Template de Criação</Label>
        <Button variant="ghost" size="sm" onClick={() => onManageTemplates?.()}>
          <Settings2 className="h-3.5 w-3.5 mr-1" />
          Gerir
        </Button>
      </div>

      {templates.length === 0 ? (
        <div className="border border-dashed rounded-lg p-4 text-center">
          <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground mb-2">Nenhum template configurado</p>
          <Button variant="outline" size="sm" onClick={() => onManageTemplates?.()}>
            <Settings2 className="h-3.5 w-3.5 mr-1" /> Gerir Templates
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
    </div>
  );
}
