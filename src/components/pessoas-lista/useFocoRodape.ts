import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { ListaPessoas } from "@/hooks/pessoas/useListaPessoas";

interface Alvos {
  botaoMais: RefObject<HTMLButtonElement>;
  repetir: RefObject<HTMLButtonElement>;
  tabela: RefObject<HTMLElement>;
}

/**
 * O foco acompanha o «Carregar mais» quando é o utilizador a usá-lo (e só então):
 * - a carregar: fica no botão (que não desmonta);
 * - erro ao carregar mais: vai para «Tentar de novo»;
 * - repetir: volta ao botão; no fim da lista (já não há mais páginas) passa à tabela, sem rolar.
 * Devolve a função que o botão chama ao ser usado.
 */
export function useFocoRodape(lista: ListaPessoas, alvos: Alvos): () => void {
  const pedido = useRef(false);
  const { haMais, aMostrarAnterior, isFetchingMore, erroAoCarregarMais } = lista;
  const { botaoMais, repetir, tabela } = alvos;
  useEffect(() => {
    if (!pedido.current) return;
    if (erroAoCarregarMais) {
      repetir.current?.focus();
      pedido.current = false;
    } else if (haMais && !aMostrarAnterior) {
      botaoMais.current?.focus();
      if (!isFetchingMore) pedido.current = false;
    } else if (!isFetchingMore) {
      tabela.current?.focus({ preventScroll: true });
      pedido.current = false;
    }
  }, [haMais, aMostrarAnterior, isFetchingMore, erroAoCarregarMais, botaoMais, repetir, tabela]);
  return useCallback(() => { pedido.current = true; }, []);
}
