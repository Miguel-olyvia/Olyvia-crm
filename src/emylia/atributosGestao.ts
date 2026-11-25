// 13/11: os dados do ecrã de gestão dos atributos do Catálogo (GestaoAtributos.tsx). Chama as funções cat_* de
// 20270117600000_atributos_gestao_catalogo.sql (ler, guardar atributo, editar opção, reordenar) (a opção nova usa criarOpcaoAtributo, de fichaProdutoDados).
// Mesmo padrão de fichaProdutoDados: Res<T>, erroAmigavel (função ainda não existe → «Ainda não disponível nesta base»; os erros
// CT001–CT004 trazem a mensagem em português da base e mostram-se tal e qual).
import { erroAmigavel, rpcLivre } from "./fichaProdutoDados";
import { superficieDeLeitura, type Superficie } from "./v2/catalogoModelo";

/** Como Res, mas a falha pode trazer o código da base (CT001 = sem permissão). */
export type ResG<T> = { ok: true; v: T } | { ok: false; erro: string; codigo?: string };

/** `sigla` (20270118000000): o código da opção no SKU (AZ, PZ); null = ainda sem. */
export interface OpcaoGestao {
  id: string; valor: string; nome: string; hex: string | null; ordem: number; ativo: boolean; usados: number | null; sigla: string | null;
  /** A foto (caminho `{org}/{uuid}.webp` no bucket `catalogo-opcoes`); null = sem foto, e também enquanto a base não devolver o campo. */
  foto: string | null;
  /** 25/11: se a opção é de metal e a superfície por omissão dela. Só vêm com o atributo em `temAspeto`; senão false e null. */
  metal: boolean; superficie: Superficie | null;
}
export interface AtributoGestao {
  id: string; codigo: string; nome: string; tipo: "lista" | "medida"; temHex: boolean; ordem: number; ativo: boolean;
  /** O interruptor «Tem foto» (escolhido ao criar o atributo de cor); false enquanto a base não devolver o campo. */
  temFoto: boolean;
  /** 25/11: o interruptor «Tem aspeto» (muda-se a qualquer momento); false enquanto a base não devolver o campo. */
  temAspeto: boolean;
  /** A base devolveu o campo `tem_aspeto` (a migration do aspeto está aplicada): sem isto o ecrã esconde tudo o que é do aspeto. */
  aspetoDisponivel: boolean;
  usados: number | null; opcoes: OpcaoGestao[];
  /** 20270118000000: a posição no SKU (1…n; null = ainda sem) e se o atributo entra no SKU. */
  skuOrdem: number | null; skuEntra: boolean;
}

type Bruto = Record<string, unknown>;
const texto = (x: unknown): string => (typeof x === "string" ? x : "");
const contagem = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

function opcaoDe(o: Bruto): OpcaoGestao {
  return {
    id: texto(o.id), valor: texto(o.valor), nome: texto(o.nome) || texto(o.valor), hex: texto(o.hex) || null,
    ordem: contagem(o.ordem) ?? 0, ativo: o.ativo !== false, usados: contagem(o.usados), sigla: texto(o.sigla).trim() || null, foto: texto(o.foto) || null,
    metal: o.metal === true, superficie: superficieDeLeitura(o.superficie),
  };
}
function atributoDe(a: Bruto): AtributoGestao {
  return {
    id: texto(a.id), codigo: texto(a.codigo), nome: texto(a.nome), tipo: a.tipo === "medida" ? "medida" : "lista", temHex: a.tem_hex === true, temFoto: a.tem_foto === true, temAspeto: a.tem_aspeto === true, aspetoDisponivel: typeof a.tem_aspeto === "boolean",
    ordem: contagem(a.ordem) ?? 0, ativo: a.ativo !== false, usados: contagem(a.usados),
    opcoes: Array.isArray(a.opcoes) ? (a.opcoes as Bruto[]).map(opcaoDe) : [],
    skuOrdem: contagem(a.sku_ordem), skuEntra: a.sku_entra !== false,
  };
}

/** Erros da base que chegam em bruto (nome de constraint) e têm uma frase em português. 23514 + product_attributes_has_photo_check: tirar a cor a um atributo que tem fotos. */
function traduzirErro(e: { code?: string; message?: string } | null | undefined): string | null {
  if (e?.code === "23514" && /product_attributes_has_photo_check/.test(e.message ?? "")) return "Este atributo tem fotos nas opções: remova as fotos antes de tirar a cor.";
  return null;
}

/** Corre uma função da base e devolve o resultado; qualquer falha (erro da base ou da rede) volta como texto para mostrar. */
export async function chamar(fn: string, args: Record<string, unknown>, omissao: string): Promise<ResG<unknown>> {
  try {
    const { data, error } = await rpcLivre(fn, args);
    if (error || data == null) return { ok: false, erro: traduzirErro(error) ?? erroAmigavel(error, omissao), codigo: error?.code };
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
