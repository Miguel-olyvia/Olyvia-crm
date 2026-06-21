import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  CommandSeparator,
} from "@/components/ui/command";
import {
  FileText,
  ChevronDown,
  Plus,
  Building2,
  Check,
  Loader2,
  Settings2,
} from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { FieldConfig } from "./TemplateFieldsConfig";

interface UserTemplate {
  id: string;
  name: string;
  description: string | null;
  organization_id: string | null;
}

interface Organization {
  id: string;
  name: string;
  type: string;
}

interface TemplateQuickPickerProps {
  organizations: Organization[];
  selectedTemplateId?: string;
  onTemplateSelect: (template: UserTemplate | null, fields: FieldConfig[], customAttrs: FieldConfig[]) => void;
  onManageTemplates?: () => void;
}

export function TemplateQuickPicker({
  organizations,
  selectedTemplateId,
  onTemplateSelect,
  onManageTemplates,
}: TemplateQuickPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<UserTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<UserTemplate | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    if (selectedTemplateId && templates.length > 0) {
      const found = templates.find(t => t.id === selectedTemplateId);
      setSelectedTemplate(found || null);
    }
  }, [selectedTemplateId, templates]);

  const loadTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from("user_creation_templates")
        .select("id, name, description, organization_id")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error("Error loading templates:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadTemplateDetails = async (templateId: string): Promise<{ fields: FieldConfig[], customAttrs: FieldConfig[] }> => {
    try {
      const [fieldsRes, attrsRes] = await Promise.all([
        supabase
          .from("user_template_fields")
          .select("*")
          .eq("template_id", templateId)
          .order("sort_order"),
        supabase
          .from("user_template_attributes")
          .select("*")
          .eq("template_id", templateId)
          .order("sort_order"),
      ]);

      const fields: FieldConfig[] = fieldsRes.data?.map((f) => ({
        key: f.field_key,
        label: f.field_label,
        type: f.field_type,
        isRequired: f.is_required,
        isVisible: f.is_visible,
        isCustom: false,
        defaultValue: f.default_value || undefined,
        sortOrder: f.sort_order,
      })) || [];

      const customAttrs: FieldConfig[] = attrsRes.data?.map((a: any) => ({
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
      })) || [];

      return { fields, customAttrs };
    } catch (error) {
      console.error("Error loading template details:", error);
      return { fields: [], customAttrs: [] };
    }
  };

  const handleSelect = async (template: UserTemplate) => {
    setSelectedTemplate(template);
    setOpen(false);
    
    const { fields, customAttrs } = await loadTemplateDetails(template.id);
    onTemplateSelect(template, fields, customAttrs);
  };

  const handleClear = () => {
    setSelectedTemplate(null);
    setOpen(false);
    onTemplateSelect(null, [], []);
  };

  const getOrgName = (orgId: string | null) => {
    if (!orgId) return null;
    return organizations.find((o) => o.id === orgId)?.name;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between h-9 text-sm",
            selectedTemplate ? "text-foreground" : "text-muted-foreground"
          )}
        >
          <span className="flex items-center gap-2 truncate">
            <FileText className="w-4 h-4 shrink-0" />
            {selectedTemplate ? (
              <span className="truncate">{selectedTemplate.name}</span>
            ) : (
              <span>{t("templates.selectTemplate")}</span>
            )}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0 z-[9999]" align="start">
        <Command>
          <CommandInput placeholder={t("common.search")} />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <CommandEmpty>{t("templates.noTemplates")}</CommandEmpty>
                
                {selectedTemplate && (
                  <CommandGroup>
                    <CommandItem onSelect={handleClear} className="text-muted-foreground">
                      <span className="text-sm">{t("common.clear")}</span>
                    </CommandItem>
                  </CommandGroup>
                )}
                
                {selectedTemplate && <CommandSeparator />}
                
                <CommandGroup heading={t("templates.available")}>
                  {templates.map((template) => (
                    <CommandItem
                      key={template.id}
                      value={`${template.name}-${template.id}`}
                      onSelect={() => {
                        handleSelect(template);
                      }}
                      className="flex items-center justify-between cursor-pointer"
                    >
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="font-medium truncate">{template.name}</span>
                        {template.organization_id && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Building2 className="w-3 h-3" />
                            {getOrgName(template.organization_id)}
                          </span>
                        )}
                      </div>
                      {selectedTemplate?.id === template.id && (
                        <Check className="w-4 h-4 text-primary shrink-0 ml-2" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
          
          {onManageTemplates && (
            <>
              <CommandSeparator />
              <div className="p-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-muted-foreground"
                  onClick={() => {
                    setOpen(false);
                    onManageTemplates();
                  }}
                >
                  <Settings2 className="w-4 h-4 mr-2" />
                  {t("templates.manage")}
                </Button>
              </div>
            </>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
