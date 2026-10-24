// O hook dos atalhos de teclado da V2 funcional (Hoje e Lista de Pessoas, Hoje e Quadro de Negócios). A decisão de cada tecla é de funcAtalhos.ts;
// aqui só se lê o foco, se move entre as linhas (os elementos com data-linha-func dentro da raiz) e se chamam as ações da página.
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { acaoDaTecla, indiceSeguinte, type AcaoAtalho, type Alvo, type ContextoAtalho } from "./funcAtalhos";

/** Marca os popovers e diálogos da V2 funcional cujas teclas são deles (as setas não mudam de pessoa lá dentro). */
export const SEM_ATALHOS = "data-func-sem-atalhos";
export const LINHA_FUNC = "data-linha-func";
/** Marca o painel da ficha: é um [role=dialog], mas aceita ← → [ ] (o resto dos diálogos e menus não deixa passar atalhos). */
export const PAINEL_FICHA = "data-ficha-painel";
const CONTENTORES = `[role="dialog"], [role="menu"], [role="listbox"], [role="alertdialog"], [${SEM_ATALHOS}]`;

/** O foco está dentro de um contentor com teclas próprias; o contentor mais próximo manda (um menu dentro do painel bloqueia, o painel não). */
const estaBloqueado = (el: HTMLElement): boolean => {
  const c = el.closest(CONTENTORES);
  return !!c && !c.hasAttribute(PAINEL_FICHA);
};

export function alvoDe(el: Element | null): Alvo {
  if (!(el instanceof HTMLElement)) return { tag: "BODY" };
  return {
    tag: el.tagName, tipo: el instanceof HTMLInputElement ? el.type : undefined, editavel: el.isContentEditable, papel: el.getAttribute("role"),
    linha: el.hasAttribute(LINHA_FUNC), bloqueado: estaBloqueado(el),
  };
}

export type Acoes = Partial<Record<AcaoAtalho, () => void>>;

/** Move o foco para a linha seguinte (ou anterior) dentro da raiz. */
function moverFoco(raiz: HTMLElement | null, passo: 1 | -1): void {
  if (!raiz) return;
  // As linhas de uma lista ou coluna recolhida (dentro de [hidden]) ficam de fora.
  const linhas = [...raiz.querySelectorAll<HTMLElement>(`[${LINHA_FUNC}]`)].filter((l) => !l.closest("[hidden]"));
  const atual = linhas.findIndex((l) => l === document.activeElement || l.contains(document.activeElement));
  const i = indiceSeguinte(atual, linhas.length, passo);
  if (i >= 0) linhas[i].focus();
}

/** Liga os atalhos enquanto `ativo`. As setas e j/k movem o foco entre as linhas; Enter carrega na linha; as outras ações vêm de `acoes`. */
export function useAtalhos(ativo: boolean, contexto: ContextoAtalho, raiz: RefObject<HTMLElement>, acoes: Acoes): void {
  const atuais = useRef(acoes);
  useLayoutEffect(() => { atuais.current = acoes; });
  useEffect(() => {
    if (!ativo) return;
    const aoTeclar = (e: KeyboardEvent): void => {
      if (e.defaultPrevented) return;
      const acao = acaoDaTecla({ key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey }, alvoDe(document.activeElement), contexto);
      if (!acao) return;
      const fn = atuais.current[acao];
      if (acao === "seguinte" || acao === "anterior") moverFoco(raiz.current, acao === "seguinte" ? 1 : -1);
      else if (acao === "abrir") (document.activeElement as HTMLElement | null)?.click();
      else if (fn) fn();
      else return;
      e.preventDefault();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [ativo, contexto, raiz]);
}
