// Liga os atalhos de teclado do Quadro e da Lista: a decisão de cada tecla é de
// atalhosQuadro.ts; aqui só se lê o foco, se move entre os cartões (elementos com
// data-cartao, data-coluna e data-pos dentro da raiz) e se chamam as ações da página.
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { acaoDaTecla, proximoFoco, type AlvoTecla } from "./atalhosQuadro";

export const CARTAO = "data-cartao";
const PROPRIOS = '[role="dialog"], [role="menu"], [role="listbox"], [role="alertdialog"]';

function alvoDe(el: Element | null): AlvoTecla {
  if (!(el instanceof HTMLElement)) return { tag: "BODY" };
  return {
    tag: el.tagName,
    tipo: el instanceof HTMLInputElement ? el.type : undefined,
    editavel: el.isContentEditable,
    papel: el.getAttribute("role"),
    bloqueado: !!el.closest(PROPRIOS),
  };
}

function moverFoco(raiz: HTMLElement | null, acao: "seguinte" | "anterior" | "esquerda" | "direita"): void {
  if (!raiz) return;
  const els = [...raiz.querySelectorAll<HTMLElement>(`[${CARTAO}]`)];
  const itens = els.map((e) => ({ coluna: Number(e.dataset.coluna ?? 0), pos: Number(e.dataset.pos ?? 0) }));
  const atual = els.findIndex((e) => e === document.activeElement);
  const i = proximoFoco(itens, atual, acao);
  if (i >= 0) els[i].focus();
}

interface Acoes { pesquisa: () => void; ajuda: () => void }

/** Setas e j/k movem o foco entre cartões; "/" vai à pesquisa; "?" mostra a ajuda. */
export function useAtalhosQuadro(raiz: RefObject<HTMLElement>, acoes: Acoes): void {
  const atuais = useRef(acoes);
  useLayoutEffect(() => { atuais.current = acoes; });
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent): void => {
      if (e.defaultPrevented) return;
      const acao = acaoDaTecla({ key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey }, alvoDe(document.activeElement));
      if (!acao) return;
      if (acao === "pesquisa") atuais.current.pesquisa();
      else if (acao === "ajuda") atuais.current.ajuda();
      else moverFoco(raiz.current, acao);
      e.preventDefault();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [raiz]);
}
