import { useState, useEffect } from "react";
import { FileText, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { replaceVariables } from "@/utils/emailTemplateVariables";

interface CustomVar { key: string; label?: string; example?: string }
interface Template {
  id: string;
  name: string;
  description: string | null;
  subject: string;
  body_html: string;
  trigger_phase: string | null;
  trigger_type: string;
  is_system: boolean;
  custom_variables?: CustomVar[] | null;
}

interface TemplateSelectorProps {
  module: string;
  organizationId?: string;
  variables: Record<string, string>;
  disabled?: boolean;
  onSelect: (subject: string, bodyHtml: string, templateId: string) => void;
}

export function TemplateSelector({ module, organizationId, variables, disabled = false, onSelect }: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        let query = (supabase as any)
          .from("email_templates")
          .select("id, name, description, subject, body_html, trigger_phase, trigger_type, is_system, custom_variables")
          .eq("module", module)
          .eq("is_active", true)
          .order("is_system", { ascending: false })
          .order("name");

        if (organizationId) {
          // Get org-specific + system templates
          query = query.or(`organization_id.eq.${organizationId},is_system.eq.true`);
        }

        const { data } = await query;
        setTemplates(data || []);
      } catch (err) {
        console.error("Error fetching templates:", err);
      } finally {
        setLoading(false);
      }
    };
    if (module) fetch();
  }, [module, organizationId]);

  // Always render the selector — empty state is shown inside the dropdown

  const handleSelect = (template: Template) => {
    const customMap: Record<string, string> = {};
    (template.custom_variables || []).forEach((v) => { customMap[v.key] = v.example || ""; });
    const merged = { ...customMap, ...variables };
    const subject = replaceVariables(template.subject, merged);
    const body = replaceVariables(template.body_html, merged);
    onSelect(subject, body, template.id);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" disabled={loading || disabled}>
          <FileText className="h-4 w-4" />
          Usar template
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80 z-[9999]" sideOffset={5}>
        <DropdownMenuLabel>Templates disponíveis</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {templates.map((t) => (
          <DropdownMenuItem key={t.id} onClick={() => handleSelect(t)} className="flex flex-col items-start gap-1 py-2">
            <div className="flex items-center gap-2 w-full">
              <span className="font-medium text-sm">{t.name}</span>
              {t.is_system && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Sistema</Badge>}
              {t.trigger_phase && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{t.trigger_phase}</Badge>}
            </div>
            {t.description && <span className="text-xs text-muted-foreground line-clamp-1">{t.description}</span>}
          </DropdownMenuItem>
        ))}
        {templates.length === 0 && (
          <div className="p-3 text-sm text-muted-foreground text-center">Sem templates para este módulo</div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
