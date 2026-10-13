import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * O diálogo do workflow: estado em useState e ?workflow=1 no endereço (sem entrada nova no histórico), para
 * se poder abrir por ligação. O antigo ?separador=workflow abre o mesmo diálogo e nada mais.
 * O ?open=<id> tem prioridade, como no Quadro: enquanto houver um negócio aberto, o diálogo não abre.
 */
export function useAbrirWorkflow(): [boolean, (abrir: boolean) => void] {
  const [params, setParams] = useSearchParams();
  const temOpen = Boolean(params.get("open"));
  const pedido = params.get("workflow") === "1" || params.get("separador") === "workflow";
  const [aberto, setAberto] = useState(pedido);
  // Uma ligação nova com (ou sem) o pedido, já com a página aberta, também abre (ou fecha).
  useEffect(() => { setAberto(pedido); }, [pedido]);

  const mudar = useCallback((abrir: boolean) => {
    setAberto(abrir);
    setParams((atual) => {
      const p = new URLSearchParams(atual);
      if (abrir) p.set("workflow", "1");
      else p.delete("workflow");
      if (p.get("separador") === "workflow") p.delete("separador");
      return p;
    }, { replace: true });
  }, [setParams]);

  return [aberto && !temOpen, mudar];
}
