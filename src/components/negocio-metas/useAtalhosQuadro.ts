// Liga os atalhos de teclado do Quadro e da Lista: a decisão de cada tecla é de
// atalhosQuadro.ts; aqui só se lê o foco, se move entre os cartões (elementos com
// data-cartao, data-coluna e data-pos dentro da raiz) e se chamam as ações da página.
// x, c e o agem no negócio com o foco: o elemento com data-negocio-id que contém o foco
// (o cartão ou a linha, para valer também quando o foco está nos botões de ação).
// Os atalhos só existem com o foco dentro da raiz do quadro (é nela que se liga `aoTeclar`),
// nunca na página toda. As setas e j/k só agem com o foco num cartão ou linha (senão não fazem nada
// e a seta continua a fazer scroll); a tecla premida repete-as, mas não repete x, c, o, ? nem /.
import type { KeyboardEvent, RefObject } from "react";
import { acaoDaTecla, proximoFoco, type AcaoTecla, type AlvoTecla } from "./atalhosQuadro";

export const CARTAO = "data-cartao";
/** Marca o cartão (ou a linha) de um negócio; o valor é o id do negócio. */
export const ID_NEGOCIO = "data-negocio-id";
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

/** O elemento de negócio (cartão ou linha) que contém o foco, mesmo que o foco esteja num botão de ação ou na caixa de seleção. */
function itemComFoco(): HTMLElement | null {
  const el = document.activeElement;
  return el instanceof HTMLElement ? el.closest<HTMLElement>(`[${ID_NEGOCIO}]`) : null;
}

/** Move o foco entre cartões; só age (e devolve `true`) quando o foco já está num negócio, senão deixa a tecla em paz (scroll). */
function moverFoco(raiz: HTMLElement | null, acao: "seguinte" | "anterior" | "esquerda" | "direita"): boolean {
  const item = itemComFoco();
  if (!raiz || !item) return false;
  const els = [...raiz.querySelectorAll<HTMLElement>(`[${CARTAO}]`)];
  const itens = els.map((e) => ({ coluna: Number(e.dataset.coluna ?? 0), pos: Number(e.dataset.pos ?? 0) }));
  const atual = els.findIndex((e) => e.closest(`[${ID_NEGOCIO}]`) === item);
  const i = proximoFoco(itens, atual, acao);
  if (i >= 0) els[i].focus();
  return true;
}

interface Acoes {
  pesquisa: () => void;
  ajuda: () => void;
  selecionar: (id: string) => void;
  comparar: () => void;
  abrir: (id: string) => void;
}

/** O id do negócio que tem o foco (ele ou um botão dentro do seu cartão); `null` se o foco está fora. */
const negocioComFoco = (): string | null => itemComFoco()?.getAttribute(ID_NEGOCIO) ?? null;

/** Corre a ação da tecla; devolve se a tecla foi tratada (e então o evento não segue). */
function executar(acao: AcaoTecla, raiz: HTMLElement | null, acoes: Acoes): boolean {
  if (acao === "selecionar" || acao === "abrir") {
    const id = negocioComFoco();
    if (id === null) return false;
    acoes[acao](id);
  } else if (acao === "comparar") acoes.comparar();
  else if (acao === "pesquisa") acoes.pesquisa();
  else if (acao === "ajuda") acoes.ajuda();
  else return moverFoco(raiz, acao);
  return true;
}

const TECLAS_DE_MOVER: readonly AcaoTecla[] = ["seguinte", "anterior", "esquerda", "direita"];

/**
 * Setas e j/k movem o foco entre cartões; "/" pesquisa; "?" ajuda; x seleciona, c compara
 * e o abre o negócio com o foco. Devolve o `onKeyDown` da raiz do quadro.
 */
export function useAtalhosQuadro(raiz: RefObject<HTMLElement>, acoes: Acoes): (e: KeyboardEvent<HTMLElement>) => void {
  return (e) => {
    if (e.defaultPrevented) return;
    const acao = acaoDaTecla({ key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey }, alvoDe(e.target as Element));
    // Tecla premida: o foco continua a andar; as outras ações (x, c, o, ?, /) correm uma vez só.
    if (!acao || (e.repeat && !TECLAS_DE_MOVER.includes(acao))) return;
    if (executar(acao, raiz.current, acoes)) e.preventDefault();
  };
}
