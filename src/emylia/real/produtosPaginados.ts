// 16/11 (migration 20270118500000): o Catálogo de Produtos por páginas. Com 14 328 produtos (Mudelar) ler tudo de uma vez dava timeout; agora a lista vem de
// 50 em 50 do servidor, com as contagens à parte, e os atributos de cada produto lêem-se quando a ficha abre. Os nomes das funções da base ficam todos aqui.
//   cat_ler_produtos_pagina(p_org, p_q, p_categoria, p_subcategoria, p_modelo, p_marca, p_sem_categoria, p_limite, p_pagina)
//   cat_ler_produtos_contagens(p_org, p_q, p_marca)
//   cat_ler_atributos_produto(p_org, p_produto)      cat_ler_atributos_definicoes(p_org)
import { erroAmigavel, rpcLivre, type Res } from "../fichaProdutoDados";
import type { AtributoProduto } from "../v2/catalogoModelo";
import { atributosDeValores, type LinhaValorAtributo } from "./catalogoReal";

export const POR_PAGINA_SERVIDOR = 50;

/** Uma linha de cat_ler_produtos_pagina (as chaves são as da base). */
export interface LinhaPaginaProduto {
  id: string; nome: string; sku: string | null; sku_gerado: boolean | null; marca: string | null;
  categoria_id: string | null; categoria: string | null; subcategoria_id: string | null; subcategoria: string | null;
  modelo_id: string | null; modelo: string | null; modelo_numero: number | null;
  unidade: string | null; custo: number | null; pvp: number | null; fornecedor: string | null; ativo: boolean | null; imagem: string | null; atributos_resumo: string | null;
}
export interface PaginaProdutos { total: number; pagina: number; limite: number; paginas: number; produtos: LinhaPaginaProduto[] }
/** As contagens por id (de product_categories e de product_models) e as do resumo. */
export interface ContagensProdutos {
  total: number; porCategoria: Record<string, number>; porSubcategoria: Record<string, number>; porModelo: Record<string, number>;
  semReferencia: number; semCategoria: number; semMarca: number;
}
/** O que o ecrã filtra (os ids de categoria e subcategoria são os de product_categories). */
export interface FiltroServidor { q: string; categoria: string; subcategoria: string; modelo: string; marca: string; semCategoria: boolean }
export const SEM_FILTRO_SERVIDOR: FiltroServidor = { q: "", categoria: "", subcategoria: "", modelo: "", marca: "", semCategoria: false };
/** O modelo de um produto, como Produto.modeloId/modelo/modeloNumero. */
export interface ModeloDoProduto { modeloId: string; modelo: string; modeloNumero: number }

const num = (v: unknown, omissao = 0) => (typeof v === "number" && Number.isFinite(v) ? v : Number.isFinite(Number(v)) && v != null && v !== "" ? Number(v) : omissao);
const nulo = (s: string) => { const t = s.trim(); return t ? t : null; };
const mensagem = (e: unknown, omissao: string) => (e instanceof Error && e.message ? e.message : omissao);

/** Os argumentos de cat_ler_produtos_pagina. «Sem categoria» (p_sem_categoria) exclui a categoria e a subcategoria. */
export function argsPagina(org: string, f: FiltroServidor, pagina: number, limite = POR_PAGINA_SERVIDOR): Record<string, unknown> {
  return {
    p_org: org, p_q: nulo(f.q), p_categoria: f.semCategoria ? null : nulo(f.categoria), p_subcategoria: f.semCategoria ? null : nulo(f.subcategoria),
    p_modelo: nulo(f.modelo), p_marca: nulo(f.marca), p_sem_categoria: f.semCategoria, p_limite: limite, p_pagina: pagina,
  };
}

/** A resposta de cat_ler_produtos_pagina; null se não for uma página (sem a lista dos produtos). */
export function paginaDe(r: unknown): PaginaProdutos | null {
  if (!r || typeof r !== "object" || !Array.isArray((r as Record<string, unknown>).produtos)) return null;
  const o = r as Record<string, unknown>;
  const produtos = (o.produtos as unknown[]).filter((x): x is LinhaPaginaProduto => !!x && typeof x === "object" && typeof (x as { id?: unknown }).id === "string");
  return { total: num(o.total, produtos.length), pagina: num(o.pagina, 1), limite: num(o.limite, POR_PAGINA_SERVIDOR), paginas: num(o.paginas, 1), produtos };
}

const contar = (v: unknown): Record<string, number> => {
  const m: Record<string, number> = {};
  if (Array.isArray(v)) for (const x of v as { id?: unknown; n?: unknown }[]) if (x && typeof x.id === "string") m[x.id] = num(x.n);
  return m;
};
/** A resposta de cat_ler_produtos_contagens; null se não tiver o total. */
export function contagensDe(r: unknown): ContagensProdutos | null {
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  if (typeof o.total !== "number") return null;
  return {
    total: o.total, porCategoria: contar(o.por_categoria), porSubcategoria: contar(o.por_subcategoria), porModelo: contar(o.por_modelo),
    semReferencia: num(o.sem_referencia), semCategoria: num(o.sem_categoria), semMarca: num(o.sem_marca),
  };
}

export async function lerProdutosPagina(org: string, f: FiltroServidor, pagina: number): Promise<Res<PaginaProdutos>> {
  try {
    const { data, error } = await rpcLivre("cat_ler_produtos_pagina", argsPagina(org, f, pagina));
    if (error) return { ok: false, erro: erroAmigavel(error, "Não foi possível ler os produtos.") };
    const p = paginaDe(data);
    return p ? { ok: true, v: p } : { ok: false, erro: "A base respondeu num formato que não se percebe (produtos)." };
  } catch (e) {
    return { ok: false, erro: mensagem(e, "Não foi possível ler os produtos.") };
  }
}

export async function lerProdutosContagens(org: string, q: string, marca: string): Promise<Res<ContagensProdutos>> {
  try {
    const { data, error } = await rpcLivre("cat_ler_produtos_contagens", { p_org: org, p_q: nulo(q), p_marca: nulo(marca) });
    if (error) return { ok: false, erro: erroAmigavel(error, "Não foi possível ler as contagens.") };
    const c = contagensDe(data);
    return c ? { ok: true, v: c } : { ok: false, erro: "A base respondeu num formato que não se percebe (contagens)." };
  } catch (e) {
    return { ok: false, erro: mensagem(e, "Não foi possível ler as contagens.") };
  }
}

/** Os atributos de um produto (a ficha). */
export async function lerAtributosProduto(org: string, produto: string): Promise<Res<AtributoProduto[]>> {
  try {
    const { data, error } = await rpcLivre("cat_ler_atributos_produto", { p_org: org, p_produto: produto });
    if (error) return { ok: false, erro: erroAmigavel(error, "Não foi possível ler os atributos.") };
    const v = (data as { valores?: unknown } | null)?.valores;
    return Array.isArray(v) ? { ok: true, v: atributosDeValores(v as LinhaValorAtributo[]) } : { ok: false, erro: "A base respondeu num formato que não se percebe (atributos)." };
  } catch (e) {
    return { ok: false, erro: mensagem(e, "Não foi possível ler os atributos.") };
  }
}

/** O modelo do produto da ficha aberta pelo endereço (?produto=…), sem ter passado pela lista: procura-o pelo nome e fica com a linha do mesmo id.
 *  `v`: o modelo; null = o produto veio e não tem modelo; undefined = a procura não o trouxe (não se sabe: nome repetido em mais de 50 produtos). */
export async function lerModeloDoProduto(org: string, id: string, nome: string): Promise<Res<ModeloDoProduto | null | undefined>> {
  const r = await lerProdutosPagina(org, { ...SEM_FILTRO_SERVIDOR, q: nome }, 1);
  if (!r.ok) return r;
  const l = r.v.produtos.find((x) => x.id === id);
  if (!l) return { ok: true, v: undefined };
  return { ok: true, v: l.modelo_id ? { modeloId: l.modelo_id, modelo: l.modelo ?? "", modeloNumero: l.modelo_numero ?? 0 } : null };
}
