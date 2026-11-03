import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSupplierPortal } from "@/contexts/SupplierPortalContext";
import { isNoSupplierAccess, isSpFunctionMissing } from "@/lib/supplierPortal/spRpc";
import { SP_CONTRACTS_QUERY_KEY, spContractKeys, spContractsRpc } from "@/lib/supplierContracts/portal";

const retry = (count: number, err: unknown) => !isNoSupplierAccess(err) && !isSpFunctionMissing(err) && count < 1;

/**
 * Contratos do fornecedor no portal (sp_supplier_contracts_list). Partilhado
 * pelo layout (modal/banner/contador) e pela página Contrato: a mesma chave,
 * um só pedido. Em erro o layout ignora (nunca bloqueia o portal).
 */
export function useSpContractsList(enabled = true) {
  const { account, active, user } = useSupplierPortal();
  const accountId = account?.id ?? null;
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: spContractKeys.list(accountId, userId),
    queryFn: spContractsRpc.list,
    enabled: enabled && active && !!accountId && !!userId,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry,
  });
}

export function useSpContractDetail(contractId: string | null) {
  const { active, user } = useSupplierPortal();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: spContractKeys.detail(contractId, userId),
    queryFn: () => spContractsRpc.get(contractId as string),
    enabled: active && !!contractId && !!userId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry,
  });
}

export function useSpMyPhone(enabled = true) {
  const { active, user } = useSupplierPortal();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: spContractKeys.phone(userId),
    queryFn: spContractsRpc.getMyPhone,
    enabled: enabled && active && !!userId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry,
  });
}

/** Depois de assinar/recusar/anexar/mudar o telemóvel: lista, detalhe e telemóvel. */
export function useInvalidateSpContracts() {
  const queryClient = useQueryClient();
  return useCallback(() => queryClient.invalidateQueries({ queryKey: [SP_CONTRACTS_QUERY_KEY] }), [queryClient]);
}
