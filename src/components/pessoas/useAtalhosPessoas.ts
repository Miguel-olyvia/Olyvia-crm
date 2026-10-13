// Atalhos de teclado da lista de pessoas, só com o foco dentro da raiz da lista: j/k e as
// setas movem o foco entre as linhas, "o" abre a ficha, "/" vai à pesquisa e "?" abre a
// ajuda. Enter abre a ficha porque o nome da pessoa é um botão. A decisão de cada tecla é de
// `acaoDaTecla` (nunca dispara em campos de texto, menus ou diálogos); o foco anda com
// `proximoFoco`. A tecla premida repete só o movimento.
import type { KeyboardEvent, RefObject } from "react";
import { acaoDaTecla, proximoFoco, type AcaoTecla, type AlvoTecla } from "@/components/negocio-metas/atalhosQuadro";

/** Marca o botão do nome de cada linha; o valor é o id da pessoa. */
export const LINHA_PESSOA = "data-linha-pessoa";
const PROPRIOS = '[role="dialog"], [role="menu"], [role="listbox"], [role="alertdialog"]';
const MOVER: readonly AcaoTecla[] = ["seguinte", "anterior"];

interface AcoesPessoas {
  pesquisa: () => void;
  ajuda: () => void;
  abrir: (id: string) => void;
}

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

const linhaComFoco = (): HTMLElement | null => {
  const el = document.activeElement;
  return el instanceof HTMLElement ? el.closest<HTMLElement>(`[${LINHA_PESSOA}]`) : null;
};

/** Move o foco; só age quando o foco já está numa linha (senão a seta continua a fazer scroll). */
function mover(raiz: HTMLElement | null, acao: AcaoTecla): boolean {
  const atual = linhaComFoco();
  if (!raiz || !atual || !MOVER.includes(acao)) return false;
  const linhas = [...raiz.querySelectorAll<HTMLElement>(`[${LINHA_PESSOA}]`)];
  const i = proximoFoco(linhas.map((_, pos) => ({ coluna: 0, pos })), linhas.indexOf(atual), acao);
  if (i >= 0) linhas[i].focus();
  return true;
}

function executar(acao: AcaoTecla, raiz: HTMLElement | null, acoes: AcoesPessoas): boolean {
  if (acao === "pesquisa") acoes.pesquisa();
  else if (acao === "ajuda") acoes.ajuda();
  else if (acao === "abrir") {
    const id = linhaComFoco()?.getAttribute(LINHA_PESSOA);
    if (!id) return false;
    acoes.abrir(id);
  } else return mover(raiz, acao);
  return true;
}

/** Devolve o `onKeyDown` da raiz da lista. */
export function useAtalhosPessoas(raiz: RefObject<HTMLElement>, acoes: AcoesPessoas): (e: KeyboardEvent<HTMLElement>) => void {
  return (e) => {
    if (e.defaultPrevented) return;
    const acao = acaoDaTecla({ key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey }, alvoDe(e.target as Element));
    if (!acao || (e.repeat && !MOVER.includes(acao))) return;
    if (executar(acao, raiz.current, acoes)) e.preventDefault();
  };
}
