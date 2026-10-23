// Devolve o foco a um botão DEPOIS de um diálogo fechar (o diálogo não o devolve quando fecha por ter gravado). O adiamento de um ciclo deixa o
// diálogo largar o foco primeiro; cancela-se se o componente desmontar e um pedido novo substitui o anterior, para não darem foco a nada que já
// não está no ecrã.
import { useCallback, useEffect, useRef, type RefObject } from "react";

export function useFocoDepois(): (alvo: RefObject<HTMLElement | null>) => void {
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelar = useCallback(() => {
    if (temporizador.current !== null) clearTimeout(temporizador.current);
    temporizador.current = null;
  }, []);
  useEffect(() => cancelar, [cancelar]);
  return useCallback((alvo) => {
    cancelar();
    temporizador.current = setTimeout(() => {
      temporizador.current = null;
      alvo.current?.focus();
    }, 0);
  }, [cancelar]);
}
