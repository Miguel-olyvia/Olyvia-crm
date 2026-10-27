import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPoPortalShipments, type PoShipment } from "./poPortalShipments";

/**
 * Expedições do portal ainda por receber, por PO (fetchPoPortalShipments: uma leitura em lote).
 * Volta a ler sempre que `reloadSignal` muda (ex.: a lista de POs recarregou), como usePoPublications.
 * Em erro fica vazio — a lista nunca parte e "Receber" volta ao diálogo de sempre.
 */
export function usePoPortalShipments(organizationId: string | null | undefined, reloadSignal: unknown) {
  const [byPo, setByPo] = useState<Map<string, PoShipment>>(new Map());
  const requestRef = useRef(0);

  const reload = useCallback(async () => {
    const requestId = ++requestRef.current;
    if (!organizationId) {
      setByPo(new Map());
      return;
    }
    try {
      const map = await fetchPoPortalShipments(organizationId);
      if (requestId !== requestRef.current) return;
      setByPo(map);
    } catch {
      if (requestId !== requestRef.current) return;
      setByPo(new Map());
    }
  }, [organizationId]);

  useEffect(() => {
    void reload();
  }, [reload, reloadSignal]);

  return { shipments: byPo, reloadShipments: reload };
}
