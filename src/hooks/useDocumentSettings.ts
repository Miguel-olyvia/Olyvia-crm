import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";

export interface DocumentSettings {
  id?: string;
  organization_id: string;
  logo_url: string | null;
  primary_color: string;
  font_family: string;
  header_layout: "left" | "center" | "right";
  show_nif: boolean;
  show_address: boolean;
  show_phone: boolean;
  show_email: boolean;
  show_website: boolean;
  footer_text: string | null;
  show_footer: boolean;
  show_page_numbers: boolean;
  margin_top: number;
  margin_bottom: number;
  margin_left: number;
  margin_right: number;
  page_size: string;
  page_orientation: string;
  header_show_separator: boolean;
  company_name_override: string | null;
  company_website: string | null;
  table_header_color: string | null;

  // Campos novos — guardados em extra_settings (JSONB) para evitar migrations a cada adição.
  logo_size?: "small" | "medium" | "large";
  header_style?: "simple" | "split";
  contract_block_show?: boolean;
  contract_block_title?: string | null;
  contract_block_subtitle?: string | null;
  contract_block_number_label?: string | null;
  contract_block_number_value?: string | null;
  contract_block_show_date?: boolean;
  contract_block_date_label?: string | null;
  contract_block_date_value?: string | null;
  contract_block_show_commercial?: boolean;
  contract_block_commercial_label?: string | null;
  contract_block_commercial_value?: string | null;

  // Org-data overrides (header) — guardados em extra_settings.
  company_address_override?: string | null;
  company_nif_override?: string | null;
  company_phone_override?: string | null;
  company_email_override?: string | null;
}

// Colunas SQL existentes na tabela organization_document_settings.
// Qualquer campo fora desta lista vai para extra_settings (JSONB).
const COLUMN_FIELDS: Array<keyof DocumentSettings> = [
  "id",
  "organization_id",
  "logo_url",
  "primary_color",
  "font_family",
  "header_layout",
  "show_nif",
  "show_address",
  "show_phone",
  "show_email",
  "show_website",
  "footer_text",
  "show_footer",
  "show_page_numbers",
  "margin_top",
  "margin_bottom",
  "margin_left",
  "margin_right",
  "page_size",
  "page_orientation",
  "header_show_separator",
  "company_name_override",
  "company_website",
  "table_header_color",
];

const DEFAULTS: Omit<DocumentSettings, "organization_id"> = {
  logo_url: null,
  primary_color: "#7C3AED",
  font_family: "Arial",
  header_layout: "left",
  show_nif: true,
  show_address: true,
  show_phone: true,
  show_email: true,
  show_website: false,
  footer_text: null,
  show_footer: true,
  show_page_numbers: true,
  margin_top: 20,
  margin_bottom: 20,
  margin_left: 20,
  margin_right: 20,
  page_size: "A4",
  page_orientation: "portrait",
  header_show_separator: true,
  company_name_override: null,
  company_website: null,
  table_header_color: null,
  logo_size: "medium",
  header_style: "simple",
  contract_block_show: true,
};

/** Junta a row vinda da BD (com extra_settings JSONB) num objecto plano. */
function flattenRow(row: any, orgId: string): DocumentSettings {
  const { extra_settings, ...cols } = row || {};
  return { ...DEFAULTS, ...cols, ...(extra_settings || {}), organization_id: orgId };
}

/** Divide o payload entre colunas SQL e o JSONB extra_settings. */
function splitPayload(input: Partial<DocumentSettings>): { columns: Record<string, any>; extra: Record<string, any> } {
  const columns: Record<string, any> = {};
  const extra: Record<string, any> = {};
  for (const [key, value] of Object.entries(input)) {
    if ((COLUMN_FIELDS as string[]).includes(key)) {
      columns[key] = value;
    } else if (value !== undefined) {
      extra[key] = value;
    }
  }
  return { columns, extra };
}

export function useDocumentSettings() {
  const { activeCompany } = useCompany();
  const queryClient = useQueryClient();
  const orgId = activeCompany?.id;

  const { data: settings, isLoading } = useQuery({
    queryKey: ["organization-document-settings", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await (supabase as any)
        .from("organization_document_settings")
        .select("*")
        .eq("organization_id", orgId)
        .maybeSingle();
      if (error) throw error;
      if (data) return flattenRow(data, orgId);
      return { ...DEFAULTS, organization_id: orgId } as DocumentSettings;
    },
    enabled: !!orgId,
  });

  const saveMutation = useMutation({
    mutationFn: async (newSettings: Partial<DocumentSettings>) => {
      if (!orgId) throw new Error("Sem organização");

      // Lê o que já existe para preservar campos não enviados em extra_settings.
      const { data: existing } = await (supabase as any)
        .from("organization_document_settings")
        .select("extra_settings")
        .eq("organization_id", orgId)
        .maybeSingle();

      const { columns, extra } = splitPayload(newSettings);
      const mergedExtra = { ...(existing?.extra_settings || {}), ...extra };

      const payload = {
        ...columns,
        organization_id: orgId,
        extra_settings: mergedExtra,
        updated_at: new Date().toISOString(),
      };
      const { error } = await (supabase as any)
        .from("organization_document_settings")
        .upsert(payload, { onConflict: "organization_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization-document-settings", orgId] });
    },
  });

  return {
    settings: settings || (orgId ? ({ ...DEFAULTS, organization_id: orgId } as DocumentSettings) : null),
    isLoading,
    save: saveMutation.mutate,
    isSaving: saveMutation.isPending,
  };
}
