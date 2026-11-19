// A vista do cliente de um negócio (portal_neg_vista), para o documento do template mostrar os blocos da obra. Sem negócio, sem vista
// (o CRM ainda não a gravou) ou com erro, fica null e o documento fica como antes. As tabelas do orçamento (quote_prestacoes,
// quote_prazo, quote_zonas) não são legíveis pela conta de portal: só a vista.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lerVista } from "@/emylia/real/vistaCliente";
import { captureFlowError, type BusinessFlow } from "@/lib/observability/captureFlowError";
import type { VistaDoPortal } from "./dadosObra";

type Rpc = { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };

/** Lê a vista uma vez por negócio. `fluxo` identifica a página nos erros. */
export function useVistaObra(negocioId: string | null | undefined, fluxo: BusinessFlow): VistaDoPortal | null {
  const [vista, setVista] = useState<VistaDoPortal | null>(null);
  useEffect(() => {
    setVista(null);
    if (!negocioId) return;
    let vivo = true;
    void (async () => {
      try {
        const { data, error } = await (supabase as unknown as Rpc).rpc("portal_neg_vista", { p_negocio_id: negocioId });
        if (error) throw new Error(error.message);
        if (vivo) setVista(lerVista(data));
      } catch (e) {
        // sem a vista o documento continua a mostrar-se como antes; o erro fica registado
        captureFlowError(e, fluxo);
      }
    })();
    return () => { vivo = false; };
  }, [negocioId, fluxo]);
  return vista;
}
