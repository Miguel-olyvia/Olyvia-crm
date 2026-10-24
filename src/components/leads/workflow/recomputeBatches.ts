/**
 * Recálculo dos buckets das leads, em lotes.
 *
 * O role `authenticated` do Supabase tem `statement_timeout = 8s` e recalcular
 * uma organização inteira (Mudelar: 6120 leads) demora ~23s numa só chamada —
 * rebentava sempre com "canceling statement due to statement timeout".
 * A RPC passou a aceitar `p_limit`/`p_after` e é o cliente que percorre os
 * lotes, cada um bem dentro do timeout.
 *
 * Esta lógica vive num módulo próprio (e não dentro do componente) para ser
 * testável sem render — é exactamente o código que corre em produção.
 */

/** Leads por chamada. Escolhido para cada lote ficar muito abaixo dos 8s. */
export const RECOMPUTE_BATCH_SIZE = 500;

/**
 * Tecto de segurança: 200 lotes = 100 000 leads. Um bug no servidor (por
 * exemplo `last_id` que nunca avança) não pode pôr o browser a chamar a RPC
 * para sempre.
 */
export const RECOMPUTE_MAX_BATCHES = 200;

/**
 * Máximo de ids não resolvidos guardados no TOTAL (não por lote) — o código
 * que a seguir vai buscar os nomes destas leads faz um `.in("id", ids)` e já
 * assume este limite.
 */
export const RECOMPUTE_MAX_UNRESOLVED_IDS = 50;

/** Uma linha devolvida por `recompute_leads_v2_buckets`. */
export interface RecomputeBatchRow {
  /** Leads que MUDARAM de etapa neste lote. */
  updated_count?: number | null;
  /** Leads deste lote que não resolveram para etapa nenhuma. */
  unresolved_count?: number | null;
  /** No máximo 50, deste lote. */
  unresolved_lead_ids?: string[] | null;
  /** Leads EXAMINADAS neste lote (não as que mudaram). */
  processed_count?: number | null;
  /** Maior id examinado; é o `p_after` da chamada seguinte. */
  last_id?: string | null;
}

/** Erro à maneira do Supabase/PostgREST: objecto simples com `message`. */
export interface RecomputeBatchError {
  message?: string | null;
  [key: string]: unknown;
}

/**
 * Faz uma chamada à RPC. Devolve o mesmo `{ data, error }` do Supabase, para
 * que o teste possa substituí-la sem simular o cliente inteiro.
 */
export type RecomputeBatchCaller = (params: {
  limit: number;
  after: string | null;
}) => Promise<{
  data?: RecomputeBatchRow[] | RecomputeBatchRow | null;
  error?: RecomputeBatchError | null;
}>;

export interface RecomputeRunResult {
  /** Soma dos `updated_count` de todos os lotes concluídos. */
  updatedCount: number;
  /** Soma dos `unresolved_count` de todos os lotes concluídos. */
  unresolvedCount: number;
  /** Ids não resolvidos, limitados a `maxUnresolvedIds` no total. */
  unresolvedLeadIds: string[];
  /** Soma dos `processed_count` — o que mostramos como progresso. */
  processedCount: number;
  /** Lotes concluídos com sucesso. */
  batches: number;
  /**
   * `null` quando correu tudo. Caso contrário, o trabalho dos lotes anteriores
   * JÁ ESTÁ GRAVADO (cada lote é a sua própria transação) — os totais acima
   * continuam válidos e o utilizador tem de ser informado disso.
   */
  error: RecomputeBatchError | null;
}

export interface RunRecomputeBatchesOptions {
  batchSize?: number;
  maxBatches?: number;
  maxUnresolvedIds?: number;
  /** Chamado no fim de cada lote, com uma fotografia dos totais até ao momento. */
  onProgress?: (totals: RecomputeRunResult) => void;
}

/** Converte o que vier da BD (number, string numérica, null) num inteiro seguro. */
const toCount = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Percorre a RPC lote a lote até ao fim e devolve os totais acumulados.
 *
 * Pára quando: `processed_count < batchSize`, `processed_count === 0`,
 * `last_id` é nulo, `last_id` repete o da iteração anterior (bug do servidor),
 * ou ao fim de `maxBatches` lotes. Nos dois últimos casos devolve `error`
 * preenchido, sem nunca deixar o ciclo continuar.
 */
export async function runRecomputeBatches(
  callBatch: RecomputeBatchCaller,
  options: RunRecomputeBatchesOptions = {}
): Promise<RecomputeRunResult> {
  const batchSize = options.batchSize ?? RECOMPUTE_BATCH_SIZE;
  const maxBatches = options.maxBatches ?? RECOMPUTE_MAX_BATCHES;
  const maxUnresolvedIds = options.maxUnresolvedIds ?? RECOMPUTE_MAX_UNRESOLVED_IDS;

  const result: RecomputeRunResult = {
    updatedCount: 0,
    unresolvedCount: 0,
    unresolvedLeadIds: [],
    processedCount: 0,
    batches: 0,
    error: null,
  };

  let after: string | null = null;

  for (let batch = 0; batch < maxBatches; batch++) {
    const response = await callBatch({ limit: batchSize, after });

    if (response?.error) {
      // Não continuamos: os lotes já feitos ficam gravados e são reportados.
      result.error = response.error;
      return result;
    }

    const data = response?.data;
    const row = (Array.isArray(data) ? data[0] : data) ?? null;
    // Sem linha não há como saber por onde continuar — tratamos como fim.
    if (!row) return result;

    const processed = toCount(row.processed_count);
    result.updatedCount += toCount(row.updated_count);
    result.unresolvedCount += toCount(row.unresolved_count);
    result.processedCount += processed;
    result.batches += 1;

    for (const id of row.unresolved_lead_ids ?? []) {
      if (result.unresolvedLeadIds.length >= maxUnresolvedIds) break;
      if (typeof id === "string" && !result.unresolvedLeadIds.includes(id)) {
        result.unresolvedLeadIds.push(id);
      }
    }

    options.onProgress?.({ ...result, unresolvedLeadIds: [...result.unresolvedLeadIds] });

    const lastId = row.last_id ?? null;

    // Fim normal: lote incompleto, lote vazio, ou o servidor não deu cursor.
    if (processed === 0 || processed < batchSize || lastId === null) return result;

    // O cursor não avançou: a próxima chamada devolveria exactamente o mesmo.
    if (lastId === after) {
      result.error = {
        message:
          "O recálculo não avançou (o servidor devolveu o mesmo cursor duas vezes). " +
          `Foram recalculadas ${result.updatedCount} leads antes de parar.`,
      };
      return result;
    }

    after = lastId;
  }

  result.error = {
    message:
      `O recálculo excedeu o limite de ${maxBatches} lotes (${maxBatches * batchSize} leads) e foi interrompido. ` +
      `Foram recalculadas ${result.updatedCount} leads. Volte a correr para continuar.`,
  };
  return result;
}
