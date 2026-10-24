import { useEffect, useState } from "react";

/** O campo (ou a resposta) de uma pergunta do questionário: o que leva `data-pergunta` com a chave dela. */
function campoDaPergunta(pergunta: string): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-pergunta]")).find((e) => e.dataset.pergunta === pergunta) ?? null;
}

/**
 * Pede o foco para um campo depois de a aba de destino montar (corre num instante a seguir). Devolve duas funções: uma para um campo do
 * formulário (pelo fim do id) e outra para o campo de uma pergunta do questionário (pela chave dela).
 */
export function usePedidoFoco(id: string): [(campo: string) => void, (pergunta: string) => void] {
  const [pedido, setPedido] = useState<{ procurar: () => HTMLElement | null; n: number } | null>(null);
  useEffect(() => {
    if (!pedido) return;
    const espera = setTimeout(() => pedido.procurar()?.focus(), 0);
    return () => clearTimeout(espera);
  }, [pedido]);
  const pedir = (procurar: () => HTMLElement | null) => setPedido((p) => ({ procurar, n: (p?.n ?? 0) + 1 }));
  return [(campo) => pedir(() => document.getElementById(`${id}-${campo}`)), (pergunta) => pedir(() => campoDaPergunta(pergunta))];
}
