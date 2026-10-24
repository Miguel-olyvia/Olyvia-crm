// As submissões de formulário de uma pessoa, adaptadas como a página de Leads as lê (separador «Formulários» do detalhe da lead, em
// AnewLeads.tsx): um cartão por submissão, de DUAS fontes (as leads da entidade com campos submetidos e `form_submissions`), com os rótulos da
// campanha, os distritos por nome e a razão de a submissão não ter criado lead nova. Função pura: não lê a base nem o relógio.
import { humanizeFormFieldKey } from "@/lib/leads/fieldLabels";
import { sanitizeFieldValue } from "@/utils/sanitize";

/** Estado de revisão de uma linha de form_submissions (o mesmo da página de submissões pendentes). */
export type RevisaoSubmissao = "pending" | "merged" | "new_lead" | "resolved";

/** As fases do funil de uma lead (o `statusToStageMap` de Leads): têm tradução; qualquer outro estado mostra-se como veio. */
export const ETAPAS_DO_FUNIL = ["novo", "contactado", "qualificado", "proposta", "ganho", "perdido"] as const;
const ETAPA_POR_ESTADO: Readonly<Record<string, (typeof ETAPAS_DO_FUNIL)[number]>> = {
  new: "novo", contacted: "contactado", qualified: "qualificado", proposal_sent: "proposta", converted: "ganho", won: "ganho", lost: "perdido",
  rejected: "perdido", callback_scheduled: "contactado", visit_scheduled: "contactado", negotiation: "proposta", no_answer: "contactado", incomplete: "novo",
};

/** A chave dos rótulos de uma submissão sem campanha (os da organização). */
export const CHAVE_SEM_CAMPANHA = "__org__";

type CamposDb = Record<string, unknown> | null;
type CampanhaDb = { id: string; name: string | null } | null;

/** Uma lead da entidade com campos submetidos (`anew_leads`). */
export interface LinhaLeadSubmetida {
  id: string;
  campaign_id: string | null;
  field_values: CamposDb;
  source: string | null;
  status: string | null;
  created_at: string | null;
  campaigns?: CampanhaDb;
}

/** Uma submissão que não gerou lead nova (`form_submissions`). */
export interface LinhaSubmissaoDb {
  id: string;
  campaign_id: string | null;
  field_values: CamposDb;
  status?: string | null;
  resolution: string | null;
  resolved_at: string | null;
  created_at: string | null;
  entity_id: string | null;
  /** Só existe a partir de uma migration recente: pode faltar. */
  conflicting_entity_id?: string | null;
  campaigns?: CampanhaDb;
}

/** O que se lê à parte para dar nome ao que as linhas trazem em bruto. */
export interface ContextoSubmissoes {
  /** Os rótulos por campanha (`CHAVE_SEM_CAMPANHA` para as submissões sem campanha). */
  rotulosPorCampanha: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** As chaves dos campos que guardam um id de distrito. */
  chavesDistrito: ReadonlySet<string>;
  distritoPorId: Readonly<Record<string, string>>;
  nomePorEntidade: Readonly<Record<string, string>>;
  /**
   * As chaves que o formulário declara como campo base da lead (`contact_field_mapping`), por campanha (`CHAVE_SEM_CAMPANHA` sem campanha): o mesmo critério
   * com que Leads separa esses campos dos «Campos do Formulário». Sem isto nenhum campo conta como mapeado.
   */
  chavesMapeadasPorCampanha?: Readonly<Record<string, ReadonlySet<string>>>;
}

export interface CampoSubmissao {
  chave: string;
  rotulo: string;
  valor: string;
  /** O formulário mapeia este campo para um campo base da lead (nome, email, telefone...). Ausente: campo sem mapeamento. */
  mapeado?: true;
}

/** O que coincidiu com um registo que já existia (a razão de não ter criado lead nova). */
export interface CoincidenciaSubmissao {
  por: "email" | "telefone" | "ambos" | "conflito";
  registo: "cliente" | "lead";
  email: string | null;
  telefone: string | null;
}

export interface SubmissaoFicha {
  /** Único entre as duas fontes: os ids vivem em tabelas diferentes. */
  chave: string;
  tipo: "lead" | "submissao";
  id: string;
  criadoEm: string | null;
  campanha: string | null;
  /** Só nas leads: de onde entrou (web, api, importação...). */
  origem: string | null;
  /** Só nas leads: a fase do funil (uma das `ETAPAS_DO_FUNIL`, ou o estado tal como veio). */
  etapa: string | null;
  /** Só nas submissões. */
  revisao: RevisaoSubmissao | null;
  /** Num conflito, as duas entidades candidatas (a da submissão primeiro); `nome` a null quando não se conhece. */
  conflito: { id: string; nome: string | null }[] | null;
  /** Dado novo que NUNCA foi gravado na ficha da pessoa. */
  emailNaoGravado: string | null;
  telefoneNaoGravado: string | null;
  coincidencia: CoincidenciaSubmissao | null;
  campos: CampoSubmissao[];
}

const textoOuNull = (valor: unknown): string | null => (typeof valor === "string" && valor.trim() !== "" ? valor : null);

function temCamposSubmetidos(valores: CamposDb): boolean {
  return Object.keys(valores ?? {}).some((chave) => chave !== "_meta");
}

/** O valor de um campo, em texto e sem marcas HTML (como a página de Leads). Listas juntam-se; objetos vão em JSON. */
function valorEmTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (Array.isArray(valor)) return sanitizeFieldValue(valor.map((v) => valorEmTexto(v)).filter(Boolean).join(", "));
  if (typeof valor === "object") return sanitizeFieldValue(JSON.stringify(valor));
  return sanitizeFieldValue(valor);
}

function camposDe(valores: CamposDb, campanhaId: string | null, ctx: ContextoSubmissoes): CampoSubmissao[] {
  const rotulos = ctx.rotulosPorCampanha[campanhaId ?? CHAVE_SEM_CAMPANHA] ?? {};
  const mapeadas = ctx.chavesMapeadasPorCampanha?.[campanhaId ?? CHAVE_SEM_CAMPANHA];
  return Object.entries(valores ?? {})
    .filter(([chave]) => chave !== "_meta")
    .map(([chave, valor]) => {
      const bruto = ctx.chavesDistrito.has(chave) && typeof valor === "string" ? ctx.distritoPorId[valor] ?? valor : valor;
      return { chave, rotulo: rotulos[chave] || humanizeFormFieldKey(chave), valor: valorEmTexto(bruto), ...(mapeadas?.has(chave) ? { mapeado: true as const } : {}) };
    });
}

function revisaoDe(linha: LinhaSubmissaoDb): RevisaoSubmissao {
  if (!linha.resolved_at) return "pending";
  return linha.resolution === "merged" || linha.resolution === "new_lead" ? linha.resolution : "resolved";
}

/** O que a deteção de duplicados deixou em `field_values._meta.dedup`; `null` quando não há nada (submissões antigas). */
function coincidenciaDe(dedup: Record<string, unknown> | null): CoincidenciaSubmissao | null {
  const por = dedup?.por;
  if (por !== "email" && por !== "telefone" && por !== "ambos" && por !== "conflito") return null;
  return { por, registo: dedup?.registo === "client" ? "cliente" : "lead", email: textoOuNull(dedup?.email_igual), telefone: textoOuNull(dedup?.telefone_igual) };
}

function dedupDe(valores: CamposDb): Record<string, unknown> | null {
  const meta = valores?._meta;
  const dedup = typeof meta === "object" && meta !== null ? (meta as Record<string, unknown>).dedup : null;
  return typeof dedup === "object" && dedup !== null ? (dedup as Record<string, unknown>) : null;
}

function cartaoDaLead(l: LinhaLeadSubmetida, ctx: ContextoSubmissoes): SubmissaoFicha {
  return {
    chave: `lead:${l.id}`, tipo: "lead", id: l.id, criadoEm: l.created_at ?? null, campanha: l.campaigns?.name ?? null, origem: l.source ?? null,
    etapa: (l.status ? ETAPA_POR_ESTADO[l.status] ?? l.status : null), revisao: null, conflito: null, emailNaoGravado: null, telefoneNaoGravado: null,
    coincidencia: null, campos: camposDe(l.field_values, l.campaign_id, ctx),
  };
}

function cartaoDaSubmissao(s: LinhaSubmissaoDb, ctx: ContextoSubmissoes): SubmissaoFicha {
  const dedup = dedupDe(s.field_values);
  const outra = s.conflicting_entity_id ?? null;
  const nome = (id: string | null): string | null => (id ? ctx.nomePorEntidade[id] ?? null : null);
  const limpo = (v: unknown): string | null => { const t = textoOuNull(v); return t === null ? null : sanitizeFieldValue(t); };
  return {
    chave: `submissao:${s.id}`, tipo: "submissao", id: s.id, criadoEm: s.created_at ?? null, campanha: s.campaigns?.name ?? null, origem: null, etapa: null,
    revisao: revisaoDe(s),
    conflito: outra && s.entity_id ? [{ id: s.entity_id, nome: nome(s.entity_id) }, { id: outra, nome: nome(outra) }] : null,
    emailNaoGravado: limpo(dedup?.novo_email), telefoneNaoGravado: limpo(dedup?.novo_telefone), coincidencia: coincidenciaDe(dedup),
    campos: camposDe(s.field_values, s.campaign_id, ctx),
  };
}

const instante = (c: SubmissaoFicha): number => (c.criadoEm ? new Date(c.criadoEm).getTime() : 0);

/** Os cartões da pessoa, do mais recente para o mais antigo. Uma linha sem nenhum campo submetido não conta. */
export function adaptarSubmissoes(
  leads: readonly LinhaLeadSubmetida[] | null | undefined,
  submissoes: readonly LinhaSubmissaoDb[] | null | undefined,
  ctx: ContextoSubmissoes,
): SubmissaoFicha[] {
  const cartoes = [
    ...(leads ?? []).filter((l) => temCamposSubmetidos(l.field_values)).map((l) => cartaoDaLead(l, ctx)),
    ...(submissoes ?? []).filter((s) => temCamposSubmetidos(s.field_values)).map((s) => cartaoDaSubmissao(s, ctx)),
  ];
  // A chave composta protege contra um id repetido dentro da mesma fonte.
  return Array.from(new Map(cartoes.map((c) => [c.chave, c])).values()).sort((a, b) => instante(b) - instante(a));
}
