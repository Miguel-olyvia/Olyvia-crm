import { useEffect, useState } from "react";
import { fetchMoradaFiscal, textoMoradaFiscal } from "@/lib/quotes/quoteMoradas";
import { listEntityDeliveryAddresses, type EntityDeliveryAddress } from "@/lib/addresses/entityDeliveryAddresses";
import { FichaLocalResumo } from "@/components/addresses/FichaLocalResumo";
import { SugestaoFichaLocalPainel } from "@/components/addresses/SugestaoFichaLocalPainel";
import { needIdsDoOrcamento } from "@/lib/addresses/sugestaoAreas";

export interface QuoteMoradasResumoProps {
  quoteId: string;
  /** quotes.obra_endereco — texto da morada de entrega gravada. */
  obraEndereco: string | null | undefined;
  /** Entidade do orçamento — para ler a ficha do local da morada de entrega. */
  entityId?: string | null;
  /** quotes.site_address_id — a morada de entrega escolhida. */
  siteAddressId?: string | null;
}

/**
 * Morada fiscal e morada de entrega no detalhe do orçamento (só leitura). A
 * fiscal é lida pela permissão de ver o orçamento (rpc_get_morada_fiscal com
 * p_quote_id); a de entrega é o texto gravado no próprio orçamento e, por
 * baixo, o resumo da ficha do local (Exterior / Interior) dessa morada, quando
 * ainda é uma das moradas de entrega da entidade e quem vê pode lê-las
 * (rpc_list_entity_delivery_addresses; sem permissão não se mostra nada).
 */
export const QuoteMoradasResumo = ({ quoteId, obraEndereco, entityId, siteAddressId }: QuoteMoradasResumoProps) => {
  const [fiscal, setFiscal] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [entregaMorada, setEntregaMorada] = useState<EntityDeliveryAddress | null>(null);
  const [needIds, setNeedIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setNeedIds([]);
    needIdsDoOrcamento(quoteId).then((ids) => { if (!cancelled) setNeedIds(ids); });
    return () => { cancelled = true; };
  }, [quoteId]);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setFiscal(null);
    fetchMoradaFiscal({ quoteId })
      .then((m) => {
        if (cancelled) return;
        setFiscal(textoMoradaFiscal(m) || null);
        setState("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("[QuoteMoradasResumo] fiscal load failed:", error, { quoteId });
        setState("error");
      });
    return () => { cancelled = true; };
  }, [quoteId]);

  useEffect(() => {
    let cancelled = false;
    setEntregaMorada(null);
    if (!entityId || !siteAddressId) return;
    listEntityDeliveryAddresses(entityId)
      .then((rows) => {
        if (!cancelled) setEntregaMorada(rows.find((r) => r.address_id === siteAddressId) ?? null);
      })
      .catch(() => {
        // Sem permissão para as moradas da entidade: fica só o texto gravado.
      });
    return () => { cancelled = true; };
  }, [entityId, siteAddressId]);

  const entrega = obraEndereco?.trim() || "";

  return (
    <>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Morada fiscal</label>
        <p className="text-sm" data-testid="quote-detalhe-morada-fiscal">
          {state === "loading" ? "…" : state === "error" ? "Não foi possível carregar" : fiscal || "Sem morada fiscal"}
        </p>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Morada de entrega / do serviço</label>
        <p className="text-sm" data-testid="quote-detalhe-morada-entrega">{entrega || "—"}</p>
        {entregaMorada && (
          <div data-testid="quote-detalhe-ficha-local">
            <FichaLocalResumo ficha={entregaMorada.ficha_tecnica} piso={entregaMorada.floor} className="mt-1" />
          </div>
        )}
        {entregaMorada && (
          <SugestaoFichaLocalPainel
            ficha={entregaMorada.ficha_tecnica}
            piso={entregaMorada.floor}
            needIds={needIds}
            className="mt-2"
          />
        )}
      </div>
    </>
  );
};
