/**
 * Argumentos partilhados pelas RPCs da listagem de Propostas.
 *
 * A listagem, os cartoes de KPI e as barras de alerta leem todos do mesmo
 * ambito e dos mesmos filtros. Se cada um construisse os seus argumentos, um
 * filtro novo entrava num sitio e nao no outro e os numeros divergiam da lista
 * sem ninguem perceber. Por isso ha uma unica funcao que os monta, aqui, do
 * lado do TypeScript -- que e tambem onde continua a viver a decisao de
 * autorizacao (ver `ProposalsScope`).
 *
 * Contrapartida em SQL: supabase/migrations/20261113070000_proposals_list_pagination_and_metrics_rpcs.sql
 */

export const PROPOSALS_PAGE_SIZE = 25;

/**
 * Kanban e dashboard sao vistas de conjunto: mostram todas as propostas do
 * filtro, nao uma pagina. Continuam por isso a carregar tudo, com um tecto,
 * e a paginacao aplica-se a vista de lista (a que abre por omissao).
 */
export const PROPOSALS_FULL_VIEW_LIMIT = 2000;

/** Tecto da leitura magra que alimenta as barras de alerta. */
export const PROPOSALS_ALERT_FEED_LIMIT = 2000;

/**
 * Quantos ids cabem num `.in()` de um GET do PostgREST sem arriscar o limite
 * de tamanho de URL do gateway (medido: 300 UUIDs passam, 400 rebentam).
 */
export const PROPOSALS_ID_CHUNK = 150;

/**
 * Ambito JA RESOLVIDO, vindo do TypeScript.
 *
 * A resolucao (anew_leads -> deals -> ids, e quem pode ver o que) fica onde
 * sempre esteve e onde esta revista: em Proposals.tsx / usePermissionScope. As
 * RPCs recebem o resultado e aplicam-no; nao ha uma segunda copia da regra de
 * isolamento entre organizacoes escrita em SQL.
 */
export interface ProposalsScope {
  organizationId: string;
  /** 'ORG' = toda a organizacao. 'IDS' = so a uniao dos arrays; falha fechada. */
  mode: "ORG" | "IDS";
  dealIds: string[] | null;
  createdByIds: string[] | null;
  /**
   * Em ambito OWNED o cliente so unia as propostas por `created_by` quando a
   * consulta por `deal_id` nao devolvia nada. Em TEAM unia sempre. A flag
   * transporta essa assimetria em vez de a apagar em silencio.
   */
  createdByFallbackOnly: boolean;
}

export interface ProposalsListFilters {
  /** Id do estado, ou "all". */
  statusFilter: string;
  /** Termo de pesquisa ja aparado; vazio quando tem menos de 3 caracteres. */
  search: string;
  /** Entidades que correspondem a pesquisa, ou null enquanto nao resolvidas. */
  searchEntityIds: string[] | null;
  /** Instantes ja calculados pelo cliente (startOfDay / endOfDay locais). */
  dateFromIso: string | null;
  dateToIso: string | null;
  /** "all" | "none" | id do comercial. */
  comercialFilter: string;
  /** Id do utilizador quando "so os meus" esta ligado, senao null. */
  onlyMineUserId: string | null;
  noResponse: boolean;
  expired: boolean;
  noValidity: boolean;
  followUpDays: number;
}

export interface ProposalsRpcArgs {
  _organization_id: string;
  _scope_mode: "ORG" | "IDS";
  _scope_deal_ids: string[] | null;
  _scope_created_by_ids: string[] | null;
  _created_by_fallback_only: boolean;
  _workflow_stage_ids: string[];
  _stage_filter: string | null;
  _search: string | null;
  _search_entity_ids: string[] | null;
  _date_from: string | null;
  _date_to: string | null;
  _only_mine: string | null;
  _comercial: string | null;
  _comercial_none: boolean;
  _no_response: boolean;
  _expired: boolean;
  _no_validity: boolean;
  _follow_up_days: number;
  _now: string;
  _tz: string;
}

/** Fuso do browser. As RPCs fazem aritmetica de datas em hora local, como o date-fns fazia. */
export const resolveBrowserTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

/**
 * Monta os argumentos das RPCs.
 *
 * `nowIso` e um instante unico por vaga de carregamento, e nao `now()` do
 * servidor: as metricas de "sem resposta" e "tempo medio de fecho" dependem de
 * "agora", e com dois relogios diferentes a lista e os cartoes podiam
 * discordar sobre a mesma proposta.
 */
export function buildProposalsRpcArgs(
  scope: ProposalsScope,
  filters: ProposalsListFilters,
  workflowStageIds: string[],
  nowIso: string,
  timeZone: string,
): ProposalsRpcArgs {
  const term = filters.search.trim();
  const isSpecificComercial =
    filters.comercialFilter !== "all" && filters.comercialFilter !== "none";

  return {
    _organization_id: scope.organizationId,
    _scope_mode: scope.mode,
    _scope_deal_ids: scope.dealIds,
    _scope_created_by_ids: scope.createdByIds,
    _created_by_fallback_only: scope.createdByFallbackOnly,
    _workflow_stage_ids: workflowStageIds,
    _stage_filter: filters.statusFilter === "all" ? null : filters.statusFilter,
    // Menos de 3 caracteres nunca filtrou nada, tal como no cliente.
    _search: term.length >= 3 ? term : null,
    _search_entity_ids: filters.searchEntityIds,
    _date_from: filters.dateFromIso,
    _date_to: filters.dateToIso,
    _only_mine: filters.onlyMineUserId,
    _comercial: isSpecificComercial ? filters.comercialFilter : null,
    _comercial_none: filters.comercialFilter === "none",
    _no_response: filters.noResponse,
    _expired: filters.expired,
    _no_validity: filters.noValidity,
    _follow_up_days: filters.followUpDays,
    _now: nowIso,
    _tz: timeZone,
  };
}

/** Metricas dos cartoes de KPI, tal como a RPC as devolve. */
export interface ProposalsListMetrics {
  total: number;
  totalValue: number;
  totalValueExVat: number;
  wonValue: number;
  wonValueExVat: number;
  acceptedCount: number;
  sentOrLaterCount: number;
  conversionRate: number;
  avgCloseTime: number;
  noResponseCount: number;
  noResponseValue: number;
  noResponseValueExVat: number;
  noValidityCount: number;
  expiredCount: number;
  stageCounts: Record<string, number>;
  stageValues: Record<string, number>;
  stageValuesExVat: Record<string, number>;
}

export const EMPTY_PROPOSALS_METRICS: ProposalsListMetrics = {
  total: 0,
  totalValue: 0,
  totalValueExVat: 0,
  wonValue: 0,
  wonValueExVat: 0,
  acceptedCount: 0,
  sentOrLaterCount: 0,
  conversionRate: 0,
  avgCloseTime: 0,
  noResponseCount: 0,
  noResponseValue: 0,
  noResponseValueExVat: 0,
  noValidityCount: 0,
  expiredCount: 0,
  stageCounts: {},
  stageValues: {},
  stageValuesExVat: {},
};

const num = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const numMap = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    out[key] = num(raw);
  }
  return out;
};

/**
 * `numeric` chega do PostgREST como string quando excede o que um double
 * representa com seguranca, por isso tudo passa por Number() em vez de se
 * confiar no tipo.
 */
export function mapProposalsListMetrics(row: unknown): ProposalsListMetrics {
  if (!row || typeof row !== "object") return EMPTY_PROPOSALS_METRICS;
  const r = row as Record<string, unknown>;
  return {
    total: num(r.total),
    totalValue: num(r.total_value),
    totalValueExVat: num(r.total_value_ex_vat),
    wonValue: num(r.won_value),
    wonValueExVat: num(r.won_value_ex_vat),
    acceptedCount: num(r.accepted_count),
    sentOrLaterCount: num(r.sent_or_later_count),
    conversionRate: num(r.conversion_rate),
    avgCloseTime: num(r.avg_close_time),
    noResponseCount: num(r.no_response_count),
    noResponseValue: num(r.no_response_value),
    noResponseValueExVat: num(r.no_response_value_ex_vat),
    noValidityCount: num(r.no_validity_count),
    expiredCount: num(r.expired_count),
    stageCounts: numMap(r.stage_counts),
    stageValues: numMap(r.stage_values),
    stageValuesExVat: numMap(r.stage_values_ex_vat),
  };
}

/** Linha da leitura magra que alimenta ProposalsAlertBars. */
export interface ProposalAlertFeedRow {
  id: string;
  title: string;
  value: number;
  status: string;
  stage_name?: string;
  valid_until: string | null;
  created_at: string;
  sent_at?: string | null;
  updated_at?: string;
  contract_id?: string | null;
}

export function mapProposalAlertFeed(rows: unknown): ProposalAlertFeedRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((raw) => {
    const r = raw as Record<string, unknown>;
    return {
      id: String(r.id),
      title: (r.title as string) ?? "",
      value: num(r.value),
      status: (r.status as string) ?? "",
      stage_name: (r.stage_name as string | null) ?? undefined,
      valid_until: (r.valid_until as string | null) ?? null,
      created_at: (r.created_at as string) ?? "",
      sent_at: (r.sent_at as string | null) ?? null,
      updated_at: (r.updated_at as string | null) ?? undefined,
      contract_id: (r.contract_id as string | null) ?? null,
    };
  });
}

/** Parte um array de ids em pedacos que caibam num URL de GET. */
export function chunkIds<T>(ids: T[], size = PROPOSALS_ID_CHUNK): T[][] {
  if (ids.length <= size) return ids.length > 0 ? [ids] : [];
  const chunks: T[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks;
}
