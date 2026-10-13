// A navegação entre pessoas dentro da ficha: quem é a anterior e a seguinte na lista visível, e que tecla ([ e ])
// as escolhe. Funções puras. Não reutiliza `acaoDaTecla` da lista, porque a ficha é um diálogo.
import type { AlvoTecla, Tecla } from "@/components/negocio-metas/atalhosQuadro";

export interface Vizinhas {
  anterior: string | null;
  seguinte: string | null;
  /** A posição (a partir de 1) na lista; 0 quando a pessoa não está na lista visível. */
  posicao: number;
  total: number;
}

/** A pessoa anterior e a seguinte de `atual` em `ids`. Sem dar a volta; fora da lista, sem vizinhas e posição 0. */
export function vizinhas(ids: readonly string[], atual: string): Vizinhas {
  const i = ids.indexOf(atual);
  if (i < 0) return { anterior: null, seguinte: null, posicao: 0, total: ids.length };
  return { anterior: ids[i - 1] ?? null, seguinte: ids[i + 1] ?? null, posicao: i + 1, total: ids.length };
}

export type TeclaNavegacao = "anterior" | "seguinte";
/** `altGraph`: o estado da tecla AltGr (`getModifierState("AltGraph")`). */
export type EventoTecla = Tecla & { repeat?: boolean; altGraph?: boolean };

const NAVEGACAO: Record<string, TeclaNavegacao> = { "[": "anterior", "]": "seguinte" };
const PAPEIS_PROPRIOS = [
  "menu", "menuitem", "menuitemcheckbox", "menuitemradio", "listbox", "option", "combobox", "textbox", "tab", "radio", "slider",
  "switch", "spinbutton",
];

function emCampoOuMenu(a: AlvoTecla): boolean {
  if (a.editavel || a.bloqueado) return true;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(a.tag)) return true;
  return !!a.papel && PAPEIS_PROPRIOS.includes(a.papel);
}

/**
 * "[" vai à anterior e "]" à seguinte; nada num campo de texto, num menu ou lista, com modificadores ou repetida. Num
 * teclado português "[" e "]" escrevem-se com AltGr, que no Windows chega como Ctrl mais Alt: isso não é um modificador de
 * atalho, por isso Ctrl com Alt (ou AltGr declarado) passa; Ctrl ou Alt sozinhos, e Cmd, não.
 */
export function teclaNavegacao(e: EventoTecla, alvo: AlvoTecla): TeclaNavegacao | null {
  const altGr = !!e.altGraph || (!!e.ctrl && !!e.alt);
  if (e.meta || (!altGr && (e.ctrl || e.alt)) || e.repeat || emCampoOuMenu(alvo)) return null;
  return NAVEGACAO[e.key] ?? null;
}
