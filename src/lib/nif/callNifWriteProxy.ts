import { supabase } from '@/integrations/supabase/client';
import { getFriendlyErrorMessage } from '@/utils/friendlyError';

const DEFAULT_ERROR_MESSAGE = 'Erro desconhecido ao invocar nif-write-proxy';

/**
 * Erro real (instância de `Error`) devolvido por `callNifWriteProxy`.
 *
 * É uma subclasse de `Error` — em vez de um objeto simples `{ message }` —
 * para que continue a funcionar com `error instanceof Error` em logging,
 * Sentry, error boundaries, etc.
 */
export class NifWriteProxyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NifWriteProxyError';
  }
}

interface NifWriteProxyResult<T> {
  data: T | null;
  error: NifWriteProxyError | null;
}

/**
 * Extrai a mensagem de erro real de `error`.
 *
 * Reaproveita `getFriendlyErrorMessage` (também usado em `UsersNew.tsx` para
 * `update-user-password`), que sabe ler `error.context` (um `Response`) de um
 * `FunctionsHttpError` do supabase-js via `.json()`/`.text()` assíncrono — a
 * única forma de obter a mensagem real da RPC/Postgres quando a Edge Function
 * responde com um status não-2xx. Sem isto, `error.message` seria sempre a
 * string genérica "Edge Function returned a non-2xx status code".
 */
async function getErrorMessage(error: unknown): Promise<string> {
  return getFriendlyErrorMessage(error, DEFAULT_ERROR_MESSAGE);
}

/**
 * Invoca a Edge Function `nif-write-proxy`, que é o único caminho permitido
 * para o frontend chamar as RPCs de escrita associadas ao NIF
 * (create_contact_with_role, rpc_update_contact, rpc_create_client_manual,
 * rpc_update_client, rpc_create_organization, rpc_update_organization,
 * rpc_create_organization_with_hierarchy, rpc_update_user).
 *
 * Devolve o mesmo formato `{ data, error }` que `supabase.rpc(...)` devolve,
 * para minimizar alterações nos call sites existentes. Nunca lança: erros de
 * rede ou de invocação são normalizados para `{ data: null, error }`.
 *
 * Nota: o parâmetro genérico `T` não é atualmente especializado em nenhum dos
 * call sites existentes (todos ignoram `data` e só usam `error`), pelo que
 * `data` fica sempre `unknown` na prática. Aceite por agora; especializar `T`
 * por call site pode ser feito depois, se algum consumidor passar a precisar
 * de ler `data`.
 */
export async function callNifWriteProxy<T = unknown>(
  rpc: string,
  params: Record<string, unknown>,
  nif?: string | null
): Promise<NifWriteProxyResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke<T>('nif-write-proxy', {
      body: {
        rpc,
        nif: nif ?? null,
        params,
      },
    });

    if (error) {
      return { data: null, error: new NifWriteProxyError(await getErrorMessage(error)) };
    }

    return { data: data ?? null, error: null };
  } catch (error: unknown) {
    return { data: null, error: new NifWriteProxyError(await getErrorMessage(error)) };
  }
}
