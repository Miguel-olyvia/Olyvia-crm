import { supabase } from '@/integrations/supabase/client';
import { getFriendlyErrorMessage } from '@/utils/friendlyError';

const DEFAULT_ERROR_MESSAGE = 'Erro desconhecido ao invocar nif-reveal';

/**
 * Erro real (instância de `Error`) devolvido por `callNifReveal`.
 *
 * É uma subclasse de `Error` — em vez de um objeto simples `{ message }` —
 * para que continue a funcionar com `error instanceof Error` em logging,
 * Sentry, error boundaries, etc.
 */
export class NifRevealError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NifRevealError';
  }
}

export interface NifRevealData {
  /** fiscal_entity_id -> NIF em claro, apenas para os ids autorizados. */
  revealed: Record<string, string>;
  /** ids pedidos que não existem ou o chamador não está autorizado a ver. */
  denied: string[];
}

interface NifRevealResult {
  data: NifRevealData | null;
  error: NifRevealError | null;
}

async function getErrorMessage(error: unknown): Promise<string> {
  return getFriendlyErrorMessage(error, DEFAULT_ERROR_MESSAGE);
}

/**
 * Invoca a Edge Function `nif-reveal`, que é o único caminho permitido para
 * o frontend obter o NIF em claro de uma ou mais `fiscal_entities`. A função
 * decifra `nif_encrypted` apenas para os `fiscal_entity_id`s que o chamador
 * está autorizado a ver (via `filter_visible_entity_ids`); os restantes vêm
 * listados em `denied`, sem distinguir "não existe" de "sem permissão".
 *
 * Nunca lança: erros de rede ou de invocação são normalizados para
 * `{ data: null, error }`.
 */
export async function callNifReveal(
  fiscalEntityIds: readonly string[]
): Promise<NifRevealResult> {
  if (fiscalEntityIds.length === 0) {
    return { data: { revealed: {}, denied: [] }, error: null };
  }

  try {
    const { data, error } = await supabase.functions.invoke<{
      success: boolean;
      data?: NifRevealData;
      error?: string;
    }>('nif-reveal', {
      body: { fiscal_entity_ids: Array.from(new Set(fiscalEntityIds)) },
    });

    if (error) {
      return { data: null, error: new NifRevealError(await getErrorMessage(error)) };
    }

    if (!data?.success || !data.data) {
      return {
        data: null,
        error: new NifRevealError(await getErrorMessage(data?.error ?? null)),
      };
    }

    return { data: data.data, error: null };
  } catch (error: unknown) {
    return { data: null, error: new NifRevealError(await getErrorMessage(error)) };
  }
}

/**
 * Conveniência para o caso mais comum: revelar o NIF de uma única
 * `fiscal_entity`. Devolve `null` se não existir, o chamador não tiver
 * permissão, ou a chamada falhar (falha silenciosa, tal como os `maybeSingle`
 * que este helper substitui — quem chama decide se precisa de tratar o erro).
 */
export async function callNifRevealSingle(
  fiscalEntityId: string | null | undefined
): Promise<string | null> {
  if (!fiscalEntityId) return null;

  const { data } = await callNifReveal([fiscalEntityId]);
  return data?.revealed[fiscalEntityId] ?? null;
}
