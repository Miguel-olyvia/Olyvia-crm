import { supabase } from '@/integrations/supabase/client';

interface NifWriteProxyError {
  message: string;
}

interface NifWriteProxyResult<T> {
  data: T | null;
  error: NifWriteProxyError | null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Erro desconhecido ao invocar nif-write-proxy';
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
      return { data: null, error: { message: getErrorMessage(error) } };
    }

    return { data: data ?? null, error: null };
  } catch (error: unknown) {
    return { data: null, error: { message: getErrorMessage(error) } };
  }
}
