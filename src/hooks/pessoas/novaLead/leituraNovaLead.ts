// As leituras de apoio do diálogo «Nova lead» de Pessoas: campanhas, origens, formulários, campos da campanha e distritos. Cópia de
// AnewLeads.tsx:1626-1658, 2110-2153 e 4441-4516 e de DynamicFormField.tsx:41-91. Só select; a organização em cada pedido que a tem.
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import type { DefinicaoCampo } from "./fluxoNovaLead";

type Linha = Record<string, any>;
const db = (): { from: (t: string) => any } => supabase as unknown as { from: (t: string) => any };

export interface CampanhaLida { id: string; name: string; form_id: string | null }
export interface OrigemLida { id: string; name: string; icon: string | null; color: string | null }
export interface FormularioLido { id: string; name: string; is_primary: boolean }
export interface DistritoLido { id: string; name: string }

async function ler(consulta: PromiseLike<{ data: unknown; error?: unknown }>): Promise<{ data: Linha[]; error: unknown }> {
  const { data, error } = await consulta;
  return { data: Array.isArray(data) ? (data as Linha[]) : [], error: error ?? null };
}

/** Uma falha de leitura: reporta-se e lança. Devolver «vazio» fazia uma falha passar por «não há nada» (e deixava criar a lead sem os campos). */
function falhou(erro: unknown): never {
  captureFlowError(erro, "campaign-lead-intake");
  throw erro instanceof Error ? erro : new Error(String((erro as { message?: unknown } | null)?.message ?? "falha a ler"));
}

/** As campanhas ativas da organização. Uma falha lança (o ecrã di-lo e deixa repetir; a lead pode criar-se sem campanha). */
export async function lerCampanhas(organizationId: string): Promise<CampanhaLida[]> {
  const { data, error } = await ler(db().from("campaigns").select("id, name, status, form_id").eq("organization_id", organizationId).eq("status", "active").order("name"));
  if (error) falhou(error);
  return data.map((c) => ({ id: c.id, name: c.name, form_id: c.form_id ?? null }));
}

/** As origens ativas: as da organização e as globais. */
export async function lerOrigens(organizationId: string): Promise<OrigemLida[]> {
  const { data, error } = await ler(db().from("lead_sources").select("id, name, icon, color").eq("is_active", true)
    .or(`organization_id.eq.${organizationId},organization_id.is.null`).order("name"));
  if (error) falhou(error);
  return data.map((s) => ({ id: s.id, name: s.name, icon: s.icon ?? null, color: s.color ?? null }));
}

/** Os formulários de leads da organização e os das suas campanhas, sem repetir. */
export async function lerFormularios(organizationId: string): Promise<FormularioLido[]> {
  const [formularios, campanhas] = await Promise.all([
    ler(db().from("forms").select("id, name, is_primary").eq("organization_id", organizationId).eq("is_active", true).eq("form_type", "lead")
      .order("is_primary", { ascending: false })),
    ler(db().from("campaigns").select("form_id, forms!campaigns_form_id_fkey(id, name, is_primary)").eq("organization_id", organizationId).not("form_id", "is", null)),
  ]);
  const todos: FormularioLido[] = formularios.data.map((f) => ({ id: f.id, name: f.name, is_primary: Boolean(f.is_primary) }));
  for (const c of campanhas.data) {
    const f = c.forms as Linha | null;
    if (f && !todos.some((x) => x.id === f.id)) todos.push({ id: f.id, name: f.name, is_primary: Boolean(f.is_primary) });
  }
  return todos;
}

/**
 * Os campos extra de uma campanha (uma falha lança: sem eles a lead sairia sem os campos obrigatórios): do formulário dela (`form_fields`) ou, sem formulário, das definições de campo da campanha.
 * Conserva as regras de validação (padrão, tamanhos): sem elas um «-» solto passava por código postal válido.
 */
export async function lerCamposDaCampanha(campanhaId: string | null): Promise<{ formId: string; campos: DefinicaoCampo[] }> {
  if (!campanhaId) return { formId: "", campos: [] };
  const { data: campanha, error: erroCampanha } = await db().from("campaigns").select("form_id").eq("id", campanhaId).single();
  if (erroCampanha) falhou(erroCampanha);
  const formId: string = (campanha?.form_id as string | null | undefined) ?? "";
  if (!formId) {
    const { data, error } = await ler(db().from("lead_field_definitions").select("*").eq("campaign_id", campanhaId).eq("is_active", true).order("sort_order"));
    if (error) falhou(error);
    return { formId: "", campos: data as unknown as DefinicaoCampo[] };
  }
  const { data, error } = await ler(db().from("form_fields").select("*").eq("form_id", formId).eq("is_active", true).order("step_number").order("sort_order"));
  if (error) falhou(error);
  const campos = data.map((f): DefinicaoCampo => ({
    id: f.id, field_key: f.field_key, field_label: f.field_label, field_type: f.field_type, is_required: Boolean(f.is_required),
    options: f.options ?? null, contact_field_mapping: f.contact_field_mapping ?? null, client_field_mapping: f.client_field_mapping ?? null,
    placeholder: f.placeholder ?? null, help_text: f.help_text ?? null, display_style: f.display_style ?? null,
    pattern: f.pattern ?? null, pattern_message: f.pattern_message ?? null, min_length: f.min_length ?? null, max_length: f.max_length ?? null,
  }));
  return { formId, campos };
}

const semRepetidos = (distritos: DistritoLido[]): DistritoLido[] =>
  distritos.reduce<DistritoLido[]>((acc, d) => (acc.some((x) => x.name === d.name) ? acc : [...acc, d]), []);

/** Os distritos de um campo «distrito»: os da campanha, ou, sem eles, os distritos de Portugal. */
export async function lerDistritos(campanhaId: string | null): Promise<DistritoLido[]> {
  if (campanhaId) {
    const { data } = await ler(db().from("campaign_districts").select("district_id, administrative_divisions!district_id (id, name)").eq("campaign_id", campanhaId));
    const daCampanha = data.filter((cd) => cd.administrative_divisions).map((cd) => ({ id: cd.administrative_divisions.id as string, name: cd.administrative_divisions.name as string }))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (daCampanha.length > 0) return semRepetidos(daCampanha);
  }
  const { data } = await ler(db().from("administrative_divisions").select("id, name").eq("admin_level", 1).eq("country_code", "PT").order("name"));
  return semRepetidos(data.map((d) => ({ id: d.id, name: d.name })));
}
