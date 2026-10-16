// A rolagem da barra de abas da ficha (painel lateral de ~640 px, com 7 abas): diz se há abas escondidas de cada lado e
// traz a aba ativa sempre à vista. Sem `ResizeObserver` ou `scrollIntoView` (jsdom) não faz nada, em vez de rebentar.
import { useCallback, useEffect, useState, type RefObject } from "react";

export interface RolagemAbas {
  haAnteriores: boolean;
  haSeguintes: boolean;
  /** Rola cerca de meia barra para o lado pedido. */
  rolar: (lado: "anterior" | "seguinte") => void;
}

const MARGEM_PX = 2;
const FRACAO_POR_CLIQUE = 0.6;

const lista = (raiz: RefObject<HTMLElement>): HTMLElement | null => raiz.current?.querySelector<HTMLElement>('[role="tablist"]') ?? null;
const semAnimacao = (): boolean => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function useRolagemAbas(raiz: RefObject<HTMLElement>, abaAtiva: string): RolagemAbas {
  const [estado, setEstado] = useState({ haAnteriores: false, haSeguintes: false });

  const medir = useCallback(() => {
    const el = lista(raiz);
    if (!el) return;
    const haAnteriores = el.scrollLeft > MARGEM_PX;
    const haSeguintes = el.scrollLeft + el.clientWidth < el.scrollWidth - MARGEM_PX;
    setEstado((antes) => (antes.haAnteriores === haAnteriores && antes.haSeguintes === haSeguintes ? antes : { haAnteriores, haSeguintes }));
  }, [raiz]);

  useEffect(() => {
    const el = lista(raiz);
    if (!el) return undefined;
    medir();
    el.addEventListener("scroll", medir, { passive: true });
    const observador = typeof ResizeObserver === "function" ? new ResizeObserver(medir) : null;
    observador?.observe(el);
    return () => {
      el.removeEventListener("scroll", medir);
      observador?.disconnect();
    };
  }, [raiz, medir]);

  // A aba ativa vem sempre à vista (clique, setas do teclado, ou um link que abre logo no Custo).
  useEffect(() => {
    const ativa = lista(raiz)?.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
    ativa?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: semAnimacao() ? "auto" : "smooth" });
  }, [raiz, abaAtiva]);

  const rolar = useCallback(
    (lado: "anterior" | "seguinte") => {
      const el = lista(raiz);
      if (!el) return;
      const passo = el.clientWidth * FRACAO_POR_CLIQUE * (lado === "anterior" ? -1 : 1);
      el.scrollBy?.({ left: passo, behavior: semAnimacao() ? "auto" : "smooth" });
    },
    [raiz],
  );

  return { ...estado, rolar };
}
