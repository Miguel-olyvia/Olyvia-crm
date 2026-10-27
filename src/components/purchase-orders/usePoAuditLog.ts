import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPoAuditLog, type PoAuditRow } from "./poHistory";

export interface PoAuditState {
  orderId: string | null;
  rows: PoAuditRow[];
  names: Map<string, string>;
  loading: boolean;
  error: boolean;
}

const EMPTY: PoAuditState = { orderId: null, rows: [], names: new Map(), loading: false, error: false };

/**
 * Registo de auditoria da PO aberta na folha (Histórico e datas da linha de etapas).
 * Volta a ler quando `reloadSignal` muda (ex.: a lista recarregou depois de uma ação).
 * Respostas de outra PO são descartadas; em erro fica vazio (a folha nunca parte).
 */
export function usePoAuditLog(orderId: string | null | undefined, reloadSignal: unknown) {
  const [state, setState] = useState<PoAuditState>(EMPTY);
  const requestRef = useRef(0);

  const reload = useCallback(async () => {
    const requestId = ++requestRef.current;
    if (!orderId) {
      setState(EMPTY);
      return;
    }
    setState((s) => (s.orderId === orderId ? { ...s, loading: true, error: false } : { ...EMPTY, orderId, loading: true }));
    try {
      const { rows, names } = await fetchPoAuditLog(orderId);
      if (requestId !== requestRef.current) return;
      setState({ orderId, rows, names, loading: false, error: false });
    } catch {
      if (requestId !== requestRef.current) return;
      setState({ ...EMPTY, orderId, error: true });
    }
  }, [orderId]);

  useEffect(() => {
    void reload();
  }, [reload, reloadSignal]);

  return { audit: state.orderId === orderId ? state : { ...EMPTY, orderId: orderId ?? null }, reloadAudit: reload };
}
