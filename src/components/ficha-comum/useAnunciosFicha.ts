// A região de anúncios de uma ficha ou painel: o texto vai para uma região `role="status"` sempre montada. O mesmo
// texto duas vezes seguidas volta a ser lido (alterna-se um espaço no fim) e limpa-se ao fim de uns segundos.
import { useCallback, useEffect, useState } from "react";

/** Quanto tempo o anúncio fica na região antes de ser limpo. */
const MS_ANUNCIO = 5000;

export function useAnunciosFicha(): { texto: string; anunciar: (mensagem: string) => void } {
  const [anuncio, setAnuncio] = useState({ texto: "", n: 0 });
  const anunciar = useCallback((texto: string) => setAnuncio((a) => ({ texto, n: a.n + 1 })), []);
  useEffect(() => {
    if (!anuncio.texto) return undefined;
    const id = setTimeout(() => setAnuncio((a) => ({ ...a, texto: "" })), MS_ANUNCIO);
    return () => clearTimeout(id);
  }, [anuncio]);
  return { texto: anuncio.texto + (anuncio.n % 2 ? " " : ""), anunciar };
}
