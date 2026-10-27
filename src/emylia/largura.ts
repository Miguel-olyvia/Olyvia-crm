// A largura que um bloco tem de facto (27/10/2026). O orçamento e o plano vivem em colunas de largura muito diferente (o
// telemóvel, a coluna do meio do computador, o ecrã largo), por isso adaptam-se ao espaço que têm e não ao tamanho da janela.
import { useEffect, useRef, useState, type RefObject } from "react";

/** A largura do elemento (atualiza quando muda). `inicial`: até medir (nos testes, sem ResizeObserver, fica esta). */
export function useLargura<T extends HTMLElement>(inicial = 800): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(inicial);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}
