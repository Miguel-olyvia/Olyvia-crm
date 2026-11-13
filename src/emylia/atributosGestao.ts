// 13/11: os dados do ecrã de gestão dos atributos do Catálogo (GestaoAtributos.tsx). Chama as funções cat_* de
// 20270117600000_atributos_gestao_catalogo.sql (ler, guardar atributo, editar opção, reordenar) (a opção nova usa criarOpcaoAtributo, de fichaProdutoDados).
// Mesmo padrão de fichaProdutoDados: Res<T>, erroAmigavel (função ainda não existe → «Ainda não disponível nesta base»; os erros
// CT001–CT004 trazem a mensagem em português da base e mostram-se tal e qual).
import { erroAmigavel, rpcLivre } from "./fichaProdutoDados";

/** Como Res, mas a falha pode trazer o código da base (CT001 = sem permissão). */
export type ResG<T> = { ok: true; v: T } | { ok: false; erro: string; codigo?: string };

export interface OpcaoGestao { id: string; valor: string; nome: string; hex: string | null; ordem: number; ativo: boolean; usados: number | null }
export interface AtributoGestao {
  id: string; codigo: string; nome: string; tipo: "lista" | "medida"; temHex: boolean; ordem: number; ativo: boolean;
  usados: number | null; opcoes: OpcaoGestao[];
}

type Bruto = Record<string, unknown>;
const texto = (x: unknown): string => (typeof x === "string" ? x : "");
const contagem = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

function opcaoDe(o: Bruto): OpcaoGestao {
  return {
    id: texto(o.id), valor: texto(o.valor), nome: texto(o.nome) || texto(o.valor), hex: texto(o.hex) || null,
    ordem: contagem(o.ordem) ?? 0, ativo: o.ativo !== false, usados: contagem(o.usados),
  };
}
function atributoDe(a: Bruto): AtributoGestao {
  return {
    id: texto(a.id), codigo: texto(a.codigo), nome: texto(a.nome), tipo: a.tipo === "medida" ? "medida" : "lista", temHex: a.tem_hex === true,
    ordem: contagem(a.ordem) ?? 0, ativo: a.ativo !== false, usados: contagem(a.usados),
    opcoes: Array.isArray(a.opcoes) ? (a.opcoes as Bruto[]).map(opcaoDe) : [],
  };
}

/** Corre uma função da base e devolve o resultado; qualquer falha (erro da base ou da rede) volta como texto para mostrar. */
async function chamar(fn: string, args: Record<string, unknown>, omissao: string): Promise<ResG<unknown>> {
  try {
    const { data, error } = await rpcLivre(fn, args);
    if (error || data == null) return { ok: false, erro: erroAmigavel(error, omissao), codigo: error?.code };
    return { ok: true, v: data };
  } catch (e) {
    return { ok: false, erro: (e as Error).message || omissao };
  }
}

export async function lerAtributosGestao(org: string): Promise<ResG<AtributoGestao[]>> {
  const r = await chamar("cat_ler_atributos_gestao", { p_org: org }, "Não foi possível ler os atributos.");
  if (!r.ok) return r;
  const lista = (r.v as { atributos?: unknown }).atributos;
  if (!Array.isArray(lista)) return { ok: false, erro: "Não foi possível ler os atributos." };
  return { ok: true, v: (lista as Bruto[]).map(atributoDe) };
}

/** Cria (atributo null) ou renomeia. Ao renomear o tipo e a cor não se mexem (null). */
export function guardarAtributo(org: string, o: { atributo: string | null; nome: string; tipo: "lista" | "medida" | null; temHex: boolean | null }): Promise<ResG<unknown>> {
  return chamar("cat_guardar_atributo", { p_org: org, p_atributo: o.atributo, p_nome: o.nome, p_tipo: o.tipo, p_tem_hex: o.temHex }, "Não foi possível guardar o atributo.");
}

/** null deixa o campo como está; hex '' limpa a cor. */
export function editarOpcao(org: string, opcao: string, o: { nome: string | null; hex: string | null; ativo: boolean | null }): Promise<ResG<unknown>> {
  return chamar("cat_editar_opcao", { p_org: org, p_opcao: opcao, p_nome: o.nome, p_hex: o.hex, p_ativo: o.ativo }, "Não foi possível guardar a opção.");
}

/** `ids` = TODAS as opções do atributo, na ordem nova. */
export function reordenarOpcoes(org: string, atributo: string, ids: readonly string[]): Promise<ResG<unknown>> {
  return chamar("cat_reordenar_opcoes", { p_org: org, p_atributo: atributo, p_ids: [...ids] }, "Não foi possível mudar a ordem.");
}
