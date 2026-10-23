// Contadores do Inventário (pílulas do menu e dos separadores) a partir de
// rpc_inventory_today, com as permissões reais.
//
// API:
//   const counterFor = useInventoryCounters(enabled?);
//   counterFor("purchaseOrders") // → number > 0 | null (null = sem pílula)
// Só pede a RPC com `enabled` e se o utilizador tiver alguma permissão de
// inventário; partilha a cache (inventoryTodayQueryKey) com o Hoje e o menu.
import { useCallback } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import {
  INVENTORY_TODAY_PERMISSIONS,
  getInventoryCounter,
  useInventoryToday,
  type InventoryCounterKey,
} from "@/hooks/useInventoryToday";

export function useInventoryCounters(enabled = true): (key?: InventoryCounterKey) => number | null {
  const { hasPermission, hasAnyPermission } = usePermissions();
  const wants = enabled && hasAnyPermission(INVENTORY_TODAY_PERMISSIONS);
  const { data } = useInventoryToday({ enabled: wants });
  return useCallback(
    (key?: InventoryCounterKey) => {
      if (!key || !wants) return null;
      const value = getInventoryCounter(key, data, hasPermission);
      return value && value > 0 ? value : null;
    },
    [wants, data, hasPermission],
  );
}
