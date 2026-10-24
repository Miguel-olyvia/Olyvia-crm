import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useSupplierPortal } from "@/contexts/SupplierPortalContext";
import { isNoSupplierAccess, isSpFunctionMissing, spGetMySupplierData } from "@/lib/supplierPortal/spRpc";

export const SP_MY_SUPPLIER_DATA_QUERY_KEY = "supplier-portal-my-supplier-data";

/**
 * Dados da empresa do fornecedor (sp_get_my_supplier_data), partilhados pelo
 * passo "Confirme os seus dados" e pela página "Os meus dados".
 */
export function useSpMySupplierData(enabled = true) {
  const { account, active, user } = useSupplierPortal();
  const queryClient = useQueryClient();
  const accountId = account?.id ?? null;
  const userId = user?.id ?? null;
  // Utilizador na chave: outra sessão no mesmo separador nunca vê a cache da anterior.
  const queryKey = [SP_MY_SUPPLIER_DATA_QUERY_KEY, accountId, userId];
  const query = useQuery({
    queryKey,
    queryFn: spGetMySupplierData,
    enabled: enabled && !!accountId && !!userId && active,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: (count, err) => !isNoSupplierAccess(err) && !isSpFunctionMissing(err) && count < 1,
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: [SP_MY_SUPPLIER_DATA_QUERY_KEY] }),
    [queryClient],
  );

  return { ...query, invalidate };
}
