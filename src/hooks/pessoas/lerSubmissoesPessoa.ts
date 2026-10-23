// A leitura das submissões de formulário de uma pessoa, como o separador «Formulários» do detalhe da lead (AnewLeads.tsx) as lê: as leads da
// entidade com campos submetidos e `form_submissions`, os rótulos de cada campanha (o mesmo resolvedor) e os distritos por nome. Sob RLS, e
// com a organização em todas as consultas às tabelas dela (a página de Leads confia só na RLS nas leads; aqui não).
import { supabase } from "@/integrations/supabase/client";
import {
  createSupabaseLeadDialogFieldDefinitionResolverClient, resolveLeadDialogFieldDefinitions, type LeadDialogFieldDefinition,
} from "@/lib/leads/fieldDefinitions";
import {
  adaptarSubmissoes, CHAVE_SEM_CAMPANHA, type ContextoSubmissoes, type LinhaLeadSubmetida, type LinhaSubmissaoDb, type SubmissaoFicha,
} from "./adaptarSubmissoes";

const LIMITE = 20;
const COLUNAS_LEAD = "id, campaign_id, field_values, source, status, created_at, campaigns(id, name)";
const COLUNAS_SUBMISSAO = "id, campaign_id, field_values, status, resolution, resolved_at, created_at, entity_id, campaigns(id, name)";

/** Os campos base da lead que um formulário pode mapear: os mesmos de Leads (`GENERAL_FIELDS` em AnewLeadEditDialog.tsx). */
const CAMPOS_BASE_DA_LEAD: ReadonlySet<string> = new Set(["first_name", "last_name", "email", "phone", "company_name", "address", "postal_code", "city", "vat"]);

const resolvedorDeRotulos = createSupabaseLeadDialogFieldDefinitionResolverClient(supabase);

async function lerLeads(organizationId: string, entityId: string): Promise<LinhaLeadSubmetida[]> {
  const { data, error } = await supabase
    .from("anew_leads").select(COLUNAS_LEAD).eq("entity_id", entityId).eq("organization_id", organizationId)
    .is("deleted_at", null).not("field_values", "is", null).order("created_at", { ascending: false }).limit(LIMITE);
  if (error) throw error;
  return (data ?? []) as unknown as LinhaLeadSubmetida[];
}

/** `conflicting_entity_id` só existe a partir de uma migration recente: sem ela repete-se a leitura em vez de deixar a lista vazia. */
function faltaAColunaDoConflito(erro: { code?: string; message?: string }): boolean {
  return erro.code === "42703" || erro.code === "PGRST204" || /conflicting_entity_id/.test(erro.message ?? "");
}

async function lerSubmissoes(organizationId: string, entityId: string): Promise<LinhaSubmissaoDb[]> {
  const ler = (colunas: string) => (supabase as any)
    .from("form_submissions").select(colunas).eq("entity_id", entityId).eq("organization_id", organizationId)
    .is("deleted_at", null).order("created_at", { ascending: false }).limit(LIMITE);
  const comConflito = await ler(`${COLUNAS_SUBMISSAO}, conflicting_entity_id`);
  if (!comConflito.error) return (comConflito.data ?? []) as LinhaSubmissaoDb[];
  if (!faltaAColunaDoConflito(comConflito.error)) throw comConflito.error;
  const semConflito = await ler(COLUNAS_SUBMISSAO);
  if (semConflito.error) throw semConflito.error;
  return (semConflito.data ?? []) as LinhaSubmissaoDb[];
}

const idsDeCampanha = (linhas: { campaign_id: string | null }[]): string[] => Array.from(new Set(linhas.map((l) => l.campaign_id).filter((id): id is string => !!id)));

async function lerRotulos(organizationId: string, linhas: { campaign_id: string | null }[]): Promise<Record<string, LeadDialogFieldDefinition[]>> {
  const porCampanha: Record<string, LeadDialogFieldDefinition[]> = {};
  const semCampanha = linhas.some((l) => !l.campaign_id);
  await Promise.all([
    ...idsDeCampanha(linhas).map(async (campaignId) => {
      porCampanha[campaignId] = await resolveLeadDialogFieldDefinitions({ campaignId, organizationId }, resolvedorDeRotulos);
    }),
    semCampanha ? (async () => { porCampanha[CHAVE_SEM_CAMPANHA] = await resolveLeadDialogFieldDefinitions({ organizationId }, resolvedorDeRotulos); })() : Promise.resolve(),
  ]);
  return porCampanha;
}

async function lerDistritos(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from("administrative_divisions").select("id, name").eq("admin_level", 1);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((d: { id: string; name: string }) => [d.id, d.name]));
}

async function lerNomesDasEntidades(submissoes: LinhaSubmissaoDb[]): Promise<Record<string, string>> {
  const ids = Array.from(new Set(submissoes.flatMap((s) => (s.conflicting_entity_id ? [s.entity_id, s.conflicting_entity_id] : [])).filter((id): id is string => !!id)));
  if (ids.length === 0) return {};
  const { data, error } = await supabase.from("anew_entities").select("id, display_name").in("id", ids);
  if (error) throw error;
  return Object.fromEntries((data ?? []).flatMap((e: { id: string; display_name: string | null }) => (e.display_name ? [[e.id, e.display_name]] : [])));
}

/** Os cartões de formulário da pessoa, do mais recente para o mais antigo. Lança o erro da base (a ficha diz que não carregou). */
export async function lerSubmissoesPessoa(organizationId: string, entityId: string): Promise<SubmissaoFicha[]> {
  if (!organizationId || !entityId) return [];
  const [leads, submissoes] = await Promise.all([lerLeads(organizationId, entityId), lerSubmissoes(organizationId, entityId)]);
  const comCampos = [...leads, ...submissoes].filter((l) => Object.keys(l.field_values ?? {}).some((k) => k !== "_meta"));
  const definicoes = await lerRotulos(organizationId, comCampos);
  const todas = Object.values(definicoes).flat();
  const chavesDistrito = new Set(todas.filter((d) => d.field_type === "ref_district").map((d) => d.field_key));
  const [distritoPorId, nomePorEntidade] = await Promise.all([
    chavesDistrito.size > 0 ? lerDistritos() : Promise.resolve({}),
    lerNomesDasEntidades(submissoes),
  ]);
  const rotulosPorCampanha = Object.fromEntries(
    Object.entries(definicoes).map(([campanha, defs]) => [campanha, Object.fromEntries(defs.map((d) => [d.field_key, d.field_label]))]),
  );
  const chavesMapeadasPorCampanha = Object.fromEntries(
    Object.entries(definicoes).map(([campanha, defs]) => [
      campanha, new Set(defs.filter((d) => d.contact_field_mapping && CAMPOS_BASE_DA_LEAD.has(d.contact_field_mapping)).map((d) => d.field_key)),
    ]),
  );
  const contexto: ContextoSubmissoes = { rotulosPorCampanha, chavesDistrito, distritoPorId, nomePorEntidade, chavesMapeadasPorCampanha };
  return adaptarSubmissoes(leads, submissoes, contexto);
}
