import { supabase } from '@/integrations/supabase/client';
import { getFriendlyErrorMessage } from '@/utils/friendlyError';

const DEFAULT_ERROR_MESSAGE = 'Erro desconhecido ao invocar fiscal-entity-resolve';

/**
 * Erro real (instância de `Error`) devolvido por `callFiscalEntityResolve`.
 *
 * É uma subclasse de `Error` — em vez de um objeto simples `{ message }` —
 * para que continue a funcionar com `error instanceof Error` em logging,
 * Sentry, error boundaries, etc.
 */
export class FiscalEntityResolveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FiscalEntityResolveError';
  }
}

export interface FiscalEntityResolveParams {
  nif: string;
  countryCode?: string;
  commercialName?: string | null;
  entityType?: 'individual' | 'company' | null;
}

export interface FiscalEntityResolveData {
  fiscalEntityId: string;
  existed: boolean;
}

interface FiscalEntityResolveResult {
  data: FiscalEntityResolveData | null;
  error: FiscalEntityResolveError | null;
}

async function getErrorMessage(error: unknown): Promise<string> {
  return getFriendlyErrorMessage(error, DEFAULT_ERROR_MESSAGE);
}

/**
 * Invoca a Edge Function `fiscal-entity-resolve`, que é o único caminho
 * permitido para o frontend "encontrar ou criar" uma `fiscal_entity` por NIF.
 * A função corre com `service_role` (bypass RLS) e devolve apenas um id
 * opaco — o browser nunca recebe `nif`, `nif_hash` nem `nif_encrypted`.
 *
 * Nunca lança: erros de rede ou de invocação são normalizados para
 * `{ data: null, error }`.
 */
export async function callFiscalEntityResolve(
  params: FiscalEntityResolveParams
): Promise<FiscalEntityResolveResult> {
  try {
    const { data, error } = await supabase.functions.invoke<{
      success: boolean;
      data?: FiscalEntityResolveData;
      error?: string;
      code?: string;
    }>('fiscal-entity-resolve', {
      body: {
        nif: params.nif,
        countryCode: params.countryCode ?? 'PT',
        commercialName: params.commercialName ?? null,
        entityType: params.entityType ?? null,
      },
    });

    if (error) {
      return { data: null, error: new FiscalEntityResolveError(await getErrorMessage(error)) };
    }

    if (!data?.success || !data.data) {
      return {
        data: null,
        error: new FiscalEntityResolveError(await getErrorMessage(data?.error ?? null)),
      };
    }

    return { data: data.data, error: null };
  } catch (error: unknown) {
    return { data: null, error: new FiscalEntityResolveError(await getErrorMessage(error)) };
  }
}
