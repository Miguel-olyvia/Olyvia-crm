// A posição de rolagem da página (o <main> do layout) quando a ficha toma o lugar do quadro ou da lista: esconder o conteúdo faz o browser limitar a rolagem,
// por isso guarda-se enquanto o conteúdo está à vista (a rolagem vai sendo registada) e repõe-se quando volta. A ficha abre sempre no topo.
// Sem <main> à volta (nos testes de componentes soltos) não faz nada.
import { useLayoutEffect, useRef, type RefObject } from "react";

export function useScrollAoVoltar(fichaVisivel: boolean, referencia: RefObject<HTMLElement>): void {
  const guardado = useRef(0);
  const antes = useRef(false);
  useLayoutEffect(() => {
    const main = referencia.current?.closest("main") ?? null;
    if (!main) {
      antes.current = fichaVisivel;
      return undefined;
    }
    if (fichaVisivel && !antes.current) main.scrollTop = 0;
    if (!fichaVisivel && antes.current) main.scrollTop = guardado.current;
    antes.current = fichaVisivel;
    if (fichaVisivel) return undefined;
    const aoRolar = () => { guardado.current = main.scrollTop; };
    main.addEventListener("scroll", aoRolar, { passive: true });
    return () => main.removeEventListener("scroll", aoRolar);
  }, [fichaVisivel, referencia]);
}
