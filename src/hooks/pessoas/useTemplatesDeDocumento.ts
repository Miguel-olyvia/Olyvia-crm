// Os templates que a ficha do Pipeline deixa escolher nos passos Orçamento, Proposta e Contrato (só leitura, da organização ativa):
//  · «quote»    = proposal_templates com template_type='quote'    (aspeto do documento do orçamento; página /quote-templates)
//  · «proposal» = proposal_templates com template_type='proposal' (aspeto da proposta; página /proposal-templates)
//  · minutas    = client_contract_templates ativas                 (corpo do contrato; página /contract-templates)
// Não são os «modelos de orçamento» (quote_templates), que são listas de linhas. Sem nada na base devolve a lista vazia: quem desenha diz que
// ainda não há templates; nunca se inventa um.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { normalizeQuotePdfTemplate } from "@/utils/quotePdfTemplate";

export type TipoTemplateDocumento = "quote" | "proposal";

/** O que o aspeto de um template de orçamento/proposta traz (os campos de proposal_templates que o documento usa). */
export interface TemplateDeAspeto {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  background_color: string | null;
  text_color: string | null;
  font_family: string | null;
  heading_font_family: string | null;
  header_text: string | null;
  footer_text: string | null;
  terms_conditions: string | null;
  thank_you_message: string | null;
  show_company_info: boolean | null;
  show_client_info: boolean | null;
  show_validity: boolean | null;
  show_terms: boolean | null;
  sections: unknown[];
  design_settings?: unknown;
}

export interface MinutaDeContrato {
  id: string;
  name: string;
  description: string | null;
  language: string | null;
  body_html: string;
  is_default: boolean;
  /** O signatário da empresa configurado na minuta (id de um utilizador, em texto); o contrato nasce assinado por ele. */
  signatory_user_id: string | null;
}

export interface PerguntaDaMinuta { key: string; label: string; description: string | null; promptType: "text" | "textarea" | "number" | "date" }

const COLUNAS_ASPETO = "id, name, description, is_default, logo_url, primary_color, secondary_color, accent_color, background_color, text_color, font_family, heading_font_family, header_text, footer_text, terms_conditions, thank_you_message, show_company_info, show_client_info, show_validity, show_terms, sections, design_settings";

interface Consulta { select: (c: string) => Consulta; eq: (c: string, v: unknown) => Consulta; is: (c: string, v: null) => Consulta; order: (c: string, o: { ascending: boolean }) => Consulta; then: PromiseLike<{ data: unknown; error: { message: string } | null }>["then"] }
const tabela = (nome: string): Consulta => (supabase as unknown as { from: (n: string) => Consulta }).from(nome);

/** Os templates ativos da organização do tipo pedido, o por omissão primeiro. */
export function useTemplatesDeAspeto(tipo: TipoTemplateDocumento) {
  const { activeCompany } = useCompany();
  const org = activeCompany?.id ?? null;
  return useQuery({
    queryKey: ["pessoas-templates-aspeto", org, tipo],
    enabled: org !== null,
    staleTime: 60_000,
    queryFn: async (): Promise<TemplateDeAspeto[]> => {
      const { data, error } = await tabela("proposal_templates").select(COLUNAS_ASPETO)
        .eq("organization_id", org).eq("template_type", tipo).eq("is_active", true)
        .order("is_default", { ascending: false }).order("name", { ascending: true });
      if (error) throw new Error(error.message);
      return ((data ?? []) as Record<string, unknown>[]).map((l) => normalizeQuotePdfTemplate(l) as unknown as TemplateDeAspeto);
    },
  });
}

/** As minutas de contrato ativas da organização, a por omissão primeiro. */
export function useMinutasDeContrato() {
  const { activeCompany } = useCompany();
  const org = activeCompany?.id ?? null;
  return useQuery({
    queryKey: ["pessoas-minutas-contrato", org],
    enabled: org !== null,
    staleTime: 60_000,
    queryFn: async (): Promise<MinutaDeContrato[]> => {
      const { data, error } = await tabela("client_contract_templates").select("id, name, description, language, body_html, is_default, signatory_user_id")
        .eq("organization_id", org).eq("is_active", true)
        .order("is_default", { ascending: false }).order("name", { ascending: true });
      if (error) throw new Error(error.message);
      return ((data ?? []) as MinutaDeContrato[]).map((m) => ({ ...m, body_html: m.body_html ?? "", is_default: m.is_default === true, signatory_user_id: m.signatory_user_id ?? null }));
    },
  });
}

/** O nome do signatário de uma minuta (anew_users); sem id não lê. Uma falha devolve erro, nunca um nome inventado. */
export function useNomeDoSignatario(id: string | null) {
  return useQuery({
    queryKey: ["pessoas-signatario-minuta", id],
    enabled: id !== null,
    staleTime: 60_000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await tabela("anew_users").select("name").eq("id", id).is("deleted_at", null);
      if (error) throw new Error(error.message);
      return ((data as { name?: string | null }[] | null) ?? [])[0]?.name?.trim() || null;
    },
  });
}

/** As perguntas «Preencher no contrato» da organização (a mesma fonte do detalhe do contrato: custom_contract_variables sem valor por omissão). */
export function usePerguntasDeContrato() {
  const { activeCompany } = useCompany();
  const org = activeCompany?.id ?? null;
  return useQuery({
    queryKey: ["custom-contract-prompt-vars", org],
    enabled: org !== null,
    staleTime: 60_000,
    queryFn: async (): Promise<PerguntaDaMinuta[]> => {
      const { data, error } = await tabela("custom_contract_variables").select("variable_key, label, description, prompt_type")
        .eq("organization_id", org).eq("is_active", true).is("default_value", null).is("linked_field_key", null);
      if (error) throw new Error(error.message);
      return ((data ?? []) as { variable_key: string; label: string; description: string | null; prompt_type: string | null }[]).map((v) => ({
        key: String(v.variable_key || "").replace(/^\{\{|\}\}$/g, "").trim(),
        label: v.label, description: v.description,
        promptType: v.prompt_type === "textarea" || v.prompt_type === "number" || v.prompt_type === "date" ? v.prompt_type : "text",
      }));
    },
  });
}
