import { useCallback, useEffect, useRef, useState } from "react";

interface UseSentinelInViewOptions {
  /** Chamado quando a sentinela esta mesmo visivel e nao ha carregamento a decorrer. */
  onVisible: () => void;
  /** Falso quando ja nao ha mais nada para carregar. */
  enabled: boolean;
  /** Enquanto for verdadeiro o observador fica desligado. */
  isLoading: boolean;
  /** Margem para comecar a carregar um pouco antes de chegar ao fim. */
  rootMargin?: string;
}

/**
 * Scroll infinito baseado em IntersectionObserver.
 *
 * Existe porque `useInfiniteScroll` decide pela GEOMETRIA do primeiro
 * antepassado com `overflow: auto|scroll`, e em /proposals esse antepassado
 * nao e o que rola. A tabela rola dentro de
 * `overflow-auto max-h-[calc(100vh-320px)]`, mas a sentinela estava fora dessa
 * caixa, num contentor cujo conteudo nunca excede a propria altura. O calculo
 * `scrollHeight - scrollTop - clientHeight` dava sempre ~0, ou seja abaixo do
 * limiar, e a cada carregamento o hook voltava a disparar: medido em producao,
 * 21 chamadas encadeadas a get_proposals_list_page no primeiro paint, 522
 * linhas na tabela em vez de 25, e o payload a subir de 1,57 MB para 3,45 MB.
 *
 * Um IntersectionObserver nao tem esse modo de falhar: pergunta ao browser se
 * o elemento esta realmente visivel, e o browser ja tem em conta o recorte de
 * TODOS os antepassados, seja qual for o que rola.
 *
 * Termina sozinho: enquanto a sentinela continuar visivel depois de carregar
 * (primeira pagina curta demais para encher o contentor), volta a pedir; assim
 * que o conteudo passa a tapa-la, para. O `isLoading` desliga o observador
 * durante o pedido, e ao voltar a ligar o browser reentrega o estado de
 * intersecao atual -- e o que fecha o ciclo sem timers nem contadores.
 */
export function useSentinelInView({
  onVisible,
  enabled,
  isLoading,
  rootMargin = "200px",
}: UseSentinelInViewOptions) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const onVisibleRef = useRef(onVisible);

  useEffect(() => {
    onVisibleRef.current = onVisible;
  }, [onVisible]);

  useEffect(() => {
    if (!node || !enabled || isLoading) return;
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onVisibleRef.current();
        }
      },
      { rootMargin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [node, enabled, isLoading, rootMargin]);

  const sentinelRef = useCallback((element: HTMLElement | null) => {
    setNode(element);
  }, []);

  return { sentinelRef };
}
