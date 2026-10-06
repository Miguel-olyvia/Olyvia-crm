import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCamposEmpresa } from "@/hooks/useCamposEmpresa";
import { lerExtraLocal } from "@/lib/campos/api";
import type { ValoresExtra } from "@/lib/campos/definicoes";

export const chaveExtraLocal = (entityId: string | null | undefined, org: string | null | undefined) =>
  ["local-extra", entityId ?? null, org ?? null] as const;

/**
 * Valores dos campos da empresa nas moradas de entrega de uma entidade
 * ({ address_id: valores }). Só carrega quando a empresa tem campos na ficha
 * do local (`ativo`) — sem configuração não há pedido.
 */
export function useExtraLocal(entityId: string | null | undefined, org: string | null | undefined, ativo = true) {
  const q = useQuery<Record<string, ValoresExtra>>({
    queryKey: chaveExtraLocal(entityId, org),
    queryFn: () => lerExtraLocal(entityId!, org!),
    enabled: !!entityId && !!org && ativo,
    staleTime: 60 * 1000,
  });
  return { porMorada: q.data ?? {}, carregando: q.isLoading && ativo };
}

export function useInvalidarExtraLocal() {
  const qc = useQueryClient();
  return (entityId: string | null | undefined, org: string | null | undefined) =>
    qc.invalidateQueries({ queryKey: chaveExtraLocal(entityId, org) });
}

/**
 * Para os resumos da ficha do local: a configuração da empresa ativa e os
 * valores extra das moradas da entidade. `config` só vem quando a empresa
 * configurou a ficha (senão o resumo fica exatamente como sempre).
 */
export function useFichaLocalEmpresa(entityId: string | null | undefined) {
  const campos = useCamposEmpresa();
  const config = campos.fichas.local.configurada ? campos.fichas.local : undefined;
  const { porMorada } = useExtraLocal(entityId, campos.org, !!config && config.extra.length > 0);
  return { config, extraDe: (addressId: string | null | undefined) => (addressId ? porMorada[addressId] : undefined) };
}
