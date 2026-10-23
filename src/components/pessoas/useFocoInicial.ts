import { useEffect, useRef, type RefObject } from "react";

/** Foca o elemento quando o painel se torna o ativo (e ao montar, se já o for). */
export function useFocoInicial<T extends HTMLElement>(ativo: boolean): RefObject<T> {
  const ref = useRef<T>(null);
  useEffect(() => { if (ativo) ref.current?.focus(); }, [ativo]);
  return ref;
}
