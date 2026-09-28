import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";

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

/**
 * O modelo que manda no aspecto (cores, logotipo, rodape, termos) do PDF de
 * uma proposta.
 *
 * A copia congelada na propria proposta -- proposals.template_snapshot -- vem
 * primeiro. E ela que impede uma proposta ja enviada de mudar de aspecto
 * porque alguem editou o modelo partilhado: quem a recebeu reabre o PDF e ve
 * o mesmo documento.
 *
 * O modelo vivo so e consultado quando nao ha copia -- linhas anteriores ao
 * trigger que passou a congelar (20261116170000), ou propostas sem modelo
 * nenhum escolhido.
 */
export async function resolveProposalBrandingTemplate(
  proposal: { template_snapshot?: unknown; template_id?: string | null } | null | undefined,
) {
  if (proposal?.template_snapshot) {
    return normalizeQuotePdfTemplate(proposal.template_snapshot as QuotePdfTemplate);
  }
  return fetchQuotePdfTemplateById(proposal?.template_id);
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
    captureFlowError(error, "quote-document-export");
    return null;
  }
  return normalizeQuotePdfTemplate(data as any);
}

// Proposal-type templates ("Templates de Proposta") use a different section
// layout convention (client_info/company_info as "card"/"inline" blocks)
// than quote-type templates (`layout: "quote_pdf"`), which is the only
// convention QuotePDFDocument's items table/bundle rendering actually knows
// how to lay out correctly. Swapping the whole template object for a
// proposal-type one breaks that layout (overlapping bundle rows). Instead,
// keep the quote-compatible template's structure and only patch the visible
// branding — title, colors, footer/terms/thank-you text — from the
// proposal's own selected template on top of it.
//
// Movida de generateProposalPdfBlob.ts para aqui (sem alterar uma linha) para
// o PDF da venda direta usar exatamente a mesma fusão sem arrastar o pdf-lib
// e o gerador de propostas para o seu chunk.
export function mergeProposalBranding(structuralTemplate: any | null, proposalTemplate: any | null) {
  if (!proposalTemplate) return structuralTemplate;
  if (!structuralTemplate) return proposalTemplate;

  const proposalHeaderTitle = Array.isArray(proposalTemplate.sections)
    ? proposalTemplate.sections.find((s: any) => s?.type === 'header')?.settings?.customTitle
    : null;

  const sections = Array.isArray(structuralTemplate.sections)
    ? structuralTemplate.sections.map((s: any) =>
        s?.type === 'header' && proposalHeaderTitle
          ? { ...s, settings: { ...s.settings, customTitle: proposalHeaderTitle } }
          : s
      )
    : structuralTemplate.sections;

  return {
    ...structuralTemplate,
    sections,
    primary_color: proposalTemplate.primary_color ?? structuralTemplate.primary_color,
    secondary_color: proposalTemplate.secondary_color ?? structuralTemplate.secondary_color,
    accent_color: proposalTemplate.accent_color ?? structuralTemplate.accent_color,
    logo_url: proposalTemplate.logo_url ?? structuralTemplate.logo_url,
    footer_text: proposalTemplate.footer_text ?? structuralTemplate.footer_text,
    terms_conditions: proposalTemplate.terms_conditions ?? structuralTemplate.terms_conditions,
    thank_you_message: proposalTemplate.thank_you_message ?? structuralTemplate.thank_you_message,
  };
}

/**
 * Modelo de proposta por omissão da empresa (template_type 'proposal'): o
 * marcado como is_default, senão o primeiro ativo por nome — a mesma ordem de
 * `fetchDefaultQuotePdfTemplate` para os modelos de orçamento.
 *
 * Usado pelo PDF da venda direta, que não tem proposta nem modelo escolhido
 * mas tem de sair com o mesmo aspecto (cores, logótipo, rodapé, termos) que as
 * propostas da empresa.
 */
export async function fetchDefaultProposalBrandingTemplate(organizationId: string | null) {
  if (!organizationId) return null;
  const { data, error } = await (supabase as any)
    .from("proposal_templates")
    .select(QUOTE_TEMPLATE_SELECT)
    .eq("organization_id", organizationId)
    .eq("template_type", "proposal")
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true })
    .limit(50);
  if (error) {
    console.warn("[fetchDefaultProposalBrandingTemplate] error", error);
    captureFlowError(error, "quote-document-export");
    return null;
  }
  const templates = ((data || []) as QuotePdfTemplate[]).map(normalizeQuotePdfTemplate).filter(Boolean);
  return templates.find((template) => template?.is_default) || templates[0] || null;
}
