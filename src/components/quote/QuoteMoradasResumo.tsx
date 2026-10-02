import { useEffect, useState } from "react";
import { fetchMoradaFiscal, textoMoradaFiscal } from "@/lib/quotes/quoteMoradas";

export interface QuoteMoradasResumoProps {
  quoteId: string;
  /** quotes.obra_endereco — texto da morada de entrega gravada. */
  obraEndereco: string | null | undefined;
}

/**
 * Morada fiscal e morada de entrega no detalhe do orçamento (só leitura). A
 * fiscal é lida pela permissão de ver o orçamento (rpc_get_morada_fiscal com
 * p_quote_id); a de entrega é o texto gravado no próprio orçamento.
 */
export const QuoteMoradasResumo = ({ quoteId, obraEndereco }: QuoteMoradasResumoProps) => {
  const [fiscal, setFiscal] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

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
        <label className="text-xs font-medium text-muted-foreground">Morada de entrega / da obra</label>
        <p className="text-sm" data-testid="quote-detalhe-morada-entrega">{entrega || "—"}</p>
      </div>
    </>
  );
};
