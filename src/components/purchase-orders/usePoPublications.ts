import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPoPublications, type PoPublicationRow } from "@/components/purchase-orders/poSupplierPortalApi";

/**
 * Publicações ativas no portal do fornecedor, por PO, para a organização.
 * Volta a ler sempre que `reloadSignal` muda (ex.: a lista de POs recarregou).
 * Em erro (p.ex. tabela ainda inexistente) fica vazio — nunca parte a lista.
 */
export function usePoPublications(organizationId: string | null | undefined, reloadSignal: unknown) {
  const [byPo, setByPo] = useState<Map<string, PoPublicationRow>>(new Map());
  const requestRef = useRef(0);

  const reload = useCallback(async () => {
    const requestId = ++requestRef.current;
    if (!organizationId) {
      setByPo(new Map());
      return;
    }
    try {
      const rows = await fetchPoPublications(organizationId);
      if (requestId !== requestRef.current) return;
      setByPo(new Map(rows.map((r) => [r.purchase_order_id, r])));
    } catch {
      if (requestId !== requestRef.current) return;
      setByPo(new Map());
    }
  }, [organizationId]);

  useEffect(() => {
    void reload();
  }, [reload, reloadSignal]);

  return { publications: byPo, reloadPublications: reload };
}
