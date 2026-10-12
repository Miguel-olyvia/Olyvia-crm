// Atalhos de teclado do Quadro e da Lista de "Negócio e metas", sem React: que
// ação faz cada tecla e para onde vai o foco. Nunca disparam num campo de texto,
// num select, num separador, dentro de um diálogo ou popover, nem com Ctrl, Cmd ou Alt.
export type AcaoTecla = "seguinte" | "anterior" | "esquerda" | "direita" | "pesquisa" | "ajuda";

export interface Tecla { key: string; ctrl?: boolean; meta?: boolean; alt?: boolean }

/** O elemento com o foco, descrito sem o DOM. */
export interface AlvoTecla {
  /** O nome da etiqueta em maiúsculas. */
  tag: string;
  /** O tipo de um input. */
  tipo?: string;
  editavel?: boolean;
  papel?: string | null;
  /** O foco está dentro de um diálogo, menu ou popover, que têm as suas teclas. */
  bloqueado?: boolean;
}

/** Posição de um cartão (ou linha) no Quadro: a coluna e o lugar dentro dela. */
export interface PosCartao { coluna: number; pos: number }

const TECLAS: Record<string, AcaoTecla> = {
  ArrowDown: "seguinte", j: "seguinte", ArrowUp: "anterior", k: "anterior",
  ArrowLeft: "esquerda", ArrowRight: "direita", "/": "pesquisa", "?": "ajuda",
};
const PAPEIS_PROPRIOS = ["tab", "combobox", "textbox", "option", "menuitem", "menuitemcheckbox", "menuitemradio", "slider"];
const INPUTS_SEM_TEXTO = ["checkbox", "button", "submit", "reset", "color", "file", "image"];

function emCampo(a: AlvoTecla): boolean {
  if (a.editavel || a.bloqueado) return true;
  if (a.tag === "TEXTAREA" || a.tag === "SELECT") return true;
  if (a.tag === "INPUT") return !INPUTS_SEM_TEXTO.includes((a.tipo ?? "text").toLowerCase());
  return !!a.papel && PAPEIS_PROPRIOS.includes(a.papel);
}

/** A ação de uma tecla, ou `null` quando não é um atalho ali. */
export function acaoDaTecla(t: Tecla, a: AlvoTecla): AcaoTecla | null {
  if (t.ctrl || t.meta || t.alt || emCampo(a)) return null;
  return TECLAS[t.key] ?? null;
}

/**
 * O índice (em `itens`) para onde o foco vai. Cima e baixo ficam dentro da coluna
 * e não dão a volta; esquerda e direita saltam as colunas vazias e procuram a
 * mesma posição (ou a última da coluna, se for mais curta). Sem foco (-1), baixo
 * e os lados vão ao primeiro e cima ao último. `-1` quando não há itens.
 */
export function proximoFoco(itens: readonly PosCartao[], atual: number, acao: AcaoTecla): number {
  if (itens.length === 0) return -1;
  if (atual < 0 || atual >= itens.length) return acao === "anterior" ? itens.length - 1 : 0;
  const { coluna, pos } = itens[atual];
  if (acao === "seguinte" || acao === "anterior") {
    const alvo = itens.findIndex((i) => i.coluna === coluna && i.pos === pos + (acao === "seguinte" ? 1 : -1));
    return alvo >= 0 ? alvo : atual;
  }
  if (acao !== "esquerda" && acao !== "direita") return atual;
  const passo = acao === "direita" ? 1 : -1;
  const colunas = [...new Set(itens.map((i) => i.coluna))].filter((c) => (c - coluna) * passo > 0);
  if (colunas.length === 0) return atual;
  const vizinha = passo === 1 ? Math.min(...colunas) : Math.max(...colunas);
  const daColuna = itens.filter((i) => i.coluna === vizinha);
  const lugar = Math.min(pos, Math.max(...daColuna.map((i) => i.pos)));
  return itens.findIndex((i) => i.coluna === vizinha && i.pos === lugar);
}
