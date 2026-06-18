import { supabase } from "@/integrations/supabase/client";

type QuotePdfTemplate = Record<string, unknown> & {
  id?: string;
  name?: string;
  is_default?: boolean | null;
  sections?: unknown;
  design_settings?: unknown;
};

const QUOTE_TEMPLATE_SELECT = `
  id,
  organization_id,
  name,
  description,
  logo_url,
  primary_color,
  secondary_color,
  accent_color,
  background_color,
  text_color,
  font_family,
  heading_font_family,
  header_style,
  show_company_info,
  show_client_info,
  show_validity,
  show_terms,
  header_text,
  footer_text,
  terms_conditions,
  thank_you_message,
  is_default,
  is_active,
  template_type,
  sections,
  design_settings
`;

export const normalizeQuotePdfTemplate = (template: QuotePdfTemplate | null) => {
  if (!template) return null;
  const designSettings = template.design_settings && typeof template.design_settings === "object"
    ? template.design_settings
    : {};

  return {
    ...template,
    ...designSettings,
    sections: Array.isArray(template.sections) ? template.sections : [],
  };
};

export async function fetchActiveQuotePdfTemplates(organizationId: string | null) {
  if (!organizationId) return [];

  type QuoteTemplateQuery = {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => {
        eq: (column: string, value: unknown) => {
          eq: (column: string, value: unknown) => {
            order: (column: string, options: { ascending: boolean }) => {
              order: (column: string, options: { ascending: boolean }) => {
                limit: (count: number) => Promise<{ data: QuotePdfTemplate[] | null; error: Error | null }>;
              };
            };
          };
        };
      };
    };
  };

  const query = (supabase as unknown as { from: (table: string) => unknown })
    .from("proposal_templates") as QuoteTemplateQuery;

  const result = await query
    .select(QUOTE_TEMPLATE_SELECT)
    .eq("organization_id", organizationId)
    .eq("template_type", "quote")
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true })
    .limit(50);

  if (result.error) throw result.error;
  return (result.data || []).map(normalizeQuotePdfTemplate).filter(Boolean);
}

export async function fetchActivePdfTemplates(organizationId: string | null) {
  if (!organizationId) return [];

  const { data, error } = await (supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: unknown) => {
          eq: (column: string, value: unknown) => {
            order: (column: string, options: { ascending: boolean }) => {
              order: (column: string, options: { ascending: boolean }) => Promise<{ data: QuotePdfTemplate[] | null; error: Error | null }>;
            };
          };
        };
      };
    };
  })
    .from("proposal_templates")
    .select(QUOTE_TEMPLATE_SELECT)
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });

  if (error) throw error;
  return (data || []).map(normalizeQuotePdfTemplate).filter(Boolean);
}

export async function fetchDefaultQuotePdfTemplate(organizationId: string | null) {
  const templates = await fetchActiveQuotePdfTemplates(organizationId);
  return templates.find((template) => template.is_default) || templates[0] || null;
}

export async function fetchQuotePdfTemplateById(templateId: string | null | undefined) {
  if (!templateId) return null;
  const { data, error } = await supabase
    .from("proposal_templates")
    .select(QUOTE_TEMPLATE_SELECT)
    .eq("id", templateId)
    .maybeSingle();
  if (error) {
    console.warn("[fetchQuotePdfTemplateById] error", error);
    return null;
  }
  return normalizeQuotePdfTemplate(data as any);
}
