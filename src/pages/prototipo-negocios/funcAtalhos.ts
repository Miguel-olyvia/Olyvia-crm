// Os atalhos de teclado da V2 funcional, sem React: que ação faz cada tecla, conforme o sítio do foco. Nunca disparam num campo de texto,
// num select, num separador (Tabs) nem dentro de um popover marcado como sem atalhos, nem com Ctrl, Cmd ou Alt.
export type ContextoAtalho = "lista" | "painel";
export type AcaoAtalho = "seguinte" | "anterior" | "abrir" | "pesquisa" | "ajuda" | "esc" | "pessoaAnterior" | "pessoaSeguinte";

/** A tecla carregada (o que interessa do KeyboardEvent). */
export interface Tecla { key: string; ctrl?: boolean; meta?: boolean; alt?: boolean }

/** O elemento com o foco, descrito sem o DOM. */
export interface Alvo {
  /** O nome da etiqueta em maiúsculas ("INPUT", "BUTTON"...). */
  tag: string;
  /** O tipo de um input ("text", "checkbox"...). */
  tipo?: string;
  /** contenteditable. */
  editavel?: boolean;
  /** O role ("tab"...). */
  papel?: string | null;
  /** O foco está numa linha (ou cartão) da lista. */
  linha?: boolean;
  /** O foco está dentro de um diálogo, menu, lista de opções ou popover (menos o painel da ficha) que tem as suas próprias teclas. */
  bloqueado?: boolean;
}

/** Os inputs que não são de escrever. */
// radio e range não estão aqui: usam as setas para mudar de valor.
const NAO_TEXTO: readonly string[] = ["checkbox", "button", "submit", "reset", "color", "file", "image"];

/** O foco está num sítio onde as teclas são de quem lá está (escrever, escolher, mudar de separador). */
export function emCampo(a: Alvo): boolean {
  if (a.editavel || a.bloqueado) return true;
  if (a.tag === "TEXTAREA" || a.tag === "SELECT") return true;
  if (a.tag === "INPUT") return !NAO_TEXTO.includes((a.tipo ?? "text").toLowerCase());
  return a.papel === "tab" || a.papel === "combobox" || a.papel === "textbox" || a.papel === "option" || a.papel === "menuitem" || a.papel === "menuitemcheckbox" || a.papel === "menuitemradio";
}

const LISTA: Record<string, AcaoAtalho> = { ArrowDown: "seguinte", j: "seguinte", ArrowUp: "anterior", k: "anterior", "/": "pesquisa", "?": "ajuda", Escape: "esc" };
const PAINEL: Record<string, AcaoAtalho> = { ArrowLeft: "pessoaAnterior", "[": "pessoaAnterior", ArrowRight: "pessoaSeguinte", "]": "pessoaSeguinte" };

/** A ação de uma tecla, ou `null` quando a tecla não é um atalho ali. Enter só abre quando o foco está numa linha. */
export function acaoDaTecla(t: Tecla, a: Alvo, ctx: ContextoAtalho): AcaoAtalho | null {
  if (t.ctrl || t.meta || t.alt || emCampo(a)) return null;
  if (ctx === "painel") return PAINEL[t.key] ?? null;
  if (t.key === "Enter") return a.linha ? "abrir" : null;
  return LISTA[t.key] ?? null;
}

/** A posição seguinte numa lista de `total` linhas, sem dar a volta. Sem nenhuma com foco (-1), a primeira (ou a última, a subir). */
export function indiceSeguinte(atual: number, total: number, passo: 1 | -1): number {
  if (total <= 0) return -1;
  if (atual < 0) return passo === 1 ? 0 : total - 1;
  return Math.min(total - 1, Math.max(0, atual + passo));
}

/** A ajuda "Atalhos". */
export const ATALHOS: readonly { teclas: string; o: string }[] = [
  { teclas: "↓ ou j", o: "Linha seguinte" }, { teclas: "↑ ou k", o: "Linha anterior" }, { teclas: "Enter", o: "Abrir a ficha (ou o negócio)" },
  { teclas: "/", o: "Ir para a pesquisa" }, { teclas: "Esc", o: "Fechar o painel ou limpar a pesquisa" }, { teclas: "?", o: "Ver estes atalhos" },
  { teclas: "← ou [", o: "No painel: pessoa anterior" }, { teclas: "→ ou ]", o: "No painel: pessoa seguinte" },
];
