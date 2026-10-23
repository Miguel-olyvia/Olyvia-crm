import { supabase } from "@/integrations/supabase/client";
import { formatDeliveryAddress } from "@/lib/addresses/entityDeliveryAddresses";

// Moradas do orçamento (migração 20261207100000_orcamento_moradas):
//   • morada fiscal  — morada principal da entidade do orçamento (lead ou
//     cliente: partilham a entidade). Só leitura aqui.
//   • morada de entrega — quotes.site_address_id (anew_addresses.id) +
//     quotes.obra_endereco (texto), gravadas por rpc_set_quote_morada_entrega.
// As RPCs ainda não estão em src/integrations/supabase/types.ts (gerado), por
// isso a chamada passa por este cliente com tipo mínimo.

export interface MoradaFiscal {
  entity_id: string;
  entity_address_id: string;
  address_id: string;
  street: string | null;
  number: string | null;
  floor: string | null;
  unit: string | null;
  postal_code: string | null;
  city: string | null;
  formatted: string | null;
}

export interface SetQuoteMoradaEntregaResult {
  quote_id: string;
  site_address_id: string | null;
  obra_endereco: string | null;
}

type RpcResult<T> = Promise<{ data: T | null; error: { message: string; code?: string } | null }>;
const rpc = <T>(name: string, args: Record<string, unknown>): RpcResult<T> =>
  (supabase.rpc as unknown as (n: string, a: Record<string, unknown>) => RpcResult<T>)(name, args);

/**
 * Morada fiscal: com `quoteId` usa a permissão de ver o orçamento (detalhe do
 * orçamento); sem ele, a de ver a ficha da entidade (construtor, antes de
 * gravar). Se a leitura pela entidade for recusada e houver orçamento, tenta
 * pelo orçamento (ex.: a editar um orçamento de uma lead de um colega).
 * null = a entidade não tem morada.
 */
export const fetchMoradaFiscal = async (args: {
  entityId?: string | null;
  quoteId?: string | null;
}): Promise<MoradaFiscal | null> => {
  const { entityId, quoteId } = args;
  if (!entityId && !quoteId) return null;

  const porOrcamento = async () => {
    const { data, error } = await rpc<MoradaFiscal[]>("rpc_get_morada_fiscal", { p_quote_id: quoteId });
    if (error) throw error;
    return data?.[0] ?? null;
  };

  if (!entityId) return porOrcamento();

  const { data, error } = await rpc<MoradaFiscal[]>("rpc_get_morada_fiscal", { p_entity_id: entityId });
  if (!error) return data?.[0] ?? null;
  if (quoteId && error.code === "42501") {
    const viaQuote = await porOrcamento();
    // Só serve se o orçamento (gravado) é da mesma entidade que está escolhida.
    if (!viaQuote || viaQuote.entity_id === entityId) return viaQuote;
  }
  throw error;
};

/** Grava a morada de entrega do orçamento (null limpa). */
export const setQuoteMoradaEntrega = async (
  quoteId: string,
  addressId: string | null,
): Promise<SetQuoteMoradaEntregaResult> => {
  const { data, error } = await rpc<SetQuoteMoradaEntregaResult>("rpc_set_quote_morada_entrega", {
    p_quote_id: quoteId,
    p_address_id: addressId,
  });
  if (error) throw error;
  return data as SetQuoteMoradaEntregaResult;
};

/** Texto da morada fiscal (com andar e fração, como a de entrega). */
export const textoMoradaFiscal = (m: MoradaFiscal | null | undefined): string =>
  m ? formatDeliveryAddress(m) || m.formatted || "" : "";
