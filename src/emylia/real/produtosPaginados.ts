// 16/11 (migration 20270118500000): o Catálogo de Produtos por páginas. Com 14 328 produtos (Mudelar) ler tudo de uma vez dava timeout; agora a lista vem de
// 50 em 50 do servidor, com as contagens à parte, e os atributos de cada produto lêem-se quando a ficha abre. Os nomes das funções da base ficam todos aqui.
//   cat_ler_produtos_pagina(p_org, p_q, p_categoria, p_subcategoria, p_modelo, p_marca, p_sem_categoria, p_limite, p_pagina)
//   cat_ler_produtos_contagens(p_org, p_q, p_marca)
//   cat_ler_atributos_produto(p_org, p_produto)      cat_ler_atributos_definicoes(p_org)
//   cat_ler_marcas_do_filtro(p_org, p_q, p_categoria, p_subcategoria, p_modelo, p_sem_categoria)  (22/01, 20270122200000)
import { erroAmigavel, rpcLivre, type Res } from "../fichaProdutoDados";
import { funcaoNomeadaEmFalta } from "./lerCatalogo";
import type { AtributoProduto } from "../v2/catalogoModelo";
import { atributosDeValores, type LinhaValorAtributo } from "./catalogoReal";

export const POR_PAGINA_SERVIDOR = 50;

/** Uma linha de cat_ler_produtos_pagina (as chaves são as da base). */
export interface LinhaPaginaProduto {
  id: string; nome: string; sku: string | null; sku_gerado: boolean | null; marca: string | null;
  categoria_id: string | null; categoria: string | null; subcategoria_id: string | null; subcategoria: string | null;
  modelo_id: string | null; modelo: string | null; modelo_numero: number | null;
  unidade: string | null; custo: number | null; pvp: number | null;
  /** 19/01 (20270119700000): os preços grossista e distribuidor; null = sem preço (ou quem lê não vê custo e PVP). */
  grossista: number | null; distribuidor: number | null; fornecedor: string | null; ativo: boolean | null; imagem: string | null; atributos_resumo: string | null;
  /** 17/11 (20270120900000): 'draft' | 'active' | 'discontinued'. Em falta numa base antiga. */
  estado?: string | null;
  /** 22/01 (cat_pesquisar_produtos, 20270122000000): o serviço que o produto traz e quantas unidades do serviço traz uma unidade dele. Só vêm da pesquisa por serviço. */
  servico_id?: string | null; fator_servico?: number | null;
}
export interface PaginaProdutos { total: number; pagina: number; limite: number; paginas: number; produtos: LinhaPaginaProduto[]; /** o que quem mostra a lista deve dizer (a pesquisa por serviço não existe na base: a lista não está filtrada) */ aviso?: string }
/** As contagens por id (de product_categories e de product_models) e as do resumo. */
export interface ContagensProdutos {
  total: number; porCategoria: Record<string, number>; porSubcategoria: Record<string, number>; porModelo: Record<string, number>;
  semReferencia: number; semCategoria: number; semMarca: number;
  /** 18/11: produtos sem preço nenhum. `undefined` quando a base ainda tem a função antiga (sem a chave `sem_preco`): o resumo esconde a linha. */
  semPreco: number | undefined;
}
/** O que o ecrã filtra (os ids de categoria e subcategoria são os de product_categories). */
export interface FiltroServidor {
  q: string; categoria: string; subcategoria: string; modelo: string; marca: string; semCategoria: boolean;
  /** products.servico_id: só os produtos que trazem este serviço (passa a leitura para cat_pesquisar_produtos). */
  servico?: string;
}
export const SEM_FILTRO_SERVIDOR: FiltroServidor = { q: "", categoria: "", subcategoria: "", modelo: "", marca: "", semCategoria: false };
/** O modelo de um produto, como Produto.modeloId/modelo/modeloNumero. */
export interface ModeloDoProduto { modeloId: string; modelo: string; modeloNumero: number }

const num = (v: unknown, omissao = 0) => (typeof v === "number" && Number.isFinite(v) ? v : Number.isFinite(Number(v)) && v != null && v !== "" ? Number(v) : omissao);
/** Um preço da base: número finito tal como vem; qualquer outra coisa (null, falta numa base antiga) = null. */
const precoOuNulo = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const nulo = (s: string) => { const t = s.trim(); return t ? t : null; };
const mensagem = (e: unknown, omissao: string) => (e instanceof Error && e.message ? e.message : omissao);

/** Os argumentos de cat_ler_produtos_pagina. «Sem categoria» (p_sem_categoria) exclui a categoria e a subcategoria. */
export function argsPagina(org: string, f: FiltroServidor, pagina: number, limite = POR_PAGINA_SERVIDOR): Record<string, unknown> {
  return {
    p_org: org, p_q: nulo(f.q), p_categoria: f.semCategoria ? null : nulo(f.categoria), p_subcategoria: f.semCategoria ? null : nulo(f.subcategoria),
    p_modelo: nulo(f.modelo), p_marca: nulo(f.marca), p_sem_categoria: f.semCategoria, p_limite: limite, p_pagina: pagina,
  };
}

/** Os argumentos de cat_pesquisar_produtos (20270122000000). ATENÇÃO: p_pagina vem antes de p_limite. Sem modelo, marca nem «sem categoria». */
export function argsPesquisa(org: string, f: FiltroServidor, pagina: number, limite = POR_PAGINA_SERVIDOR): Record<string, unknown> {
  return { p_org: org, p_q: nulo(f.q), p_servico: nulo(f.servico ?? ""), p_categoria: nulo(f.categoria), p_subcategoria: nulo(f.subcategoria), p_pagina: pagina, p_limite: limite };
}

/** A resposta de cat_ler_produtos_pagina; null se não for uma página (sem a lista dos produtos). */
export function paginaDe(r: unknown): PaginaProdutos | null {
  if (!r || typeof r !== "object" || !Array.isArray((r as Record<string, unknown>).produtos)) return null;
  const o = r as Record<string, unknown>;
  const produtos = (o.produtos as unknown[])
    .filter((x): x is LinhaPaginaProduto => !!x && typeof x === "object" && typeof (x as { id?: unknown }).id === "string")
    .map((x) => ({ ...x, grossista: precoOuNulo(x.grossista), distribuidor: precoOuNulo(x.distribuidor) }));
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
    semPreco: o.sem_preco == null || o.sem_preco === "" ? undefined : num(o.sem_preco),
  };
}

type ResPagina = { ok: true; v: PaginaProdutos } | { ok: false; erro: string; codigo?: string; mensagemBase?: string };
async function lerPaginaDe(fn: "cat_pesquisar_produtos" | "cat_ler_produtos_pagina" | "cat_estudio_procurar_produtos", args: Record<string, unknown>): Promise<ResPagina> {
  try {
    const { data, error } = await rpcLivre(fn, args);
    if (error) return { ok: false, erro: erroAmigavel(error, "Não foi possível ler os produtos."), ...(error.code ? { codigo: error.code } : {}), mensagemBase: error.message ?? "" };
    const p = paginaDe(data);
    return p ? { ok: true, v: p } : { ok: false, erro: "A base respondeu num formato que não se percebe (produtos)." };
  } catch (e) {
    return { ok: false, erro: mensagem(e, "Não foi possível ler os produtos.") };
  }
}

/** 22/01: a pesquisa de cat_pesquisar_produtos (a mesma página que cat_ler_produtos_pagina, e em cada linha o serviço que o produto traz e o fator). Sem modelo, marca nem «sem categoria». */
export async function lerPesquisaProdutos(org: string, f: FiltroServidor, pagina: number): Promise<Res<PaginaProdutos>> {
  const r = await lerPaginaDe("cat_pesquisar_produtos", argsPesquisa(org, f, pagina));
  // M12: sem a função na base (só ESSA função em falta) lê-se a lista de sempre, SEM o filtro de serviço, e avisa-se
  if (r.ok) return r;
  if (!funcaoNomeadaEmFalta({ code: r.codigo, message: r.mensagemBase }, "cat_pesquisar_produtos")) return { ok: false, erro: r.erro };
  const l = await lerPaginaDe("cat_ler_produtos_pagina", argsPagina(org, { ...f, servico: undefined }, pagina));
  return l.ok ? { ok: true, v: { ...l.v, aviso: f.servico ? "A pesquisa por serviço ainda não existe nesta base: a lista não está filtrada pelo serviço." : "A pesquisa de produtos ainda não existe nesta base: a lista é a de sempre." } } : { ok: false, erro: l.erro };
}

/** 23/11 (20270126000000): os argumentos de cat_estudio_procurar_produtos. ATENÇÃO: p_pagina vem antes de p_limite. */
export function argsPesquisaEstudio(org: string, q: string, subcategorias: readonly string[], pagina: number, limite = POR_PAGINA_SERVIDOR): Record<string, unknown> {
  return { p_org: org, p_q: nulo(q), p_subcategorias: subcategorias.length ? [...subcategorias] : null, p_pagina: pagina, p_limite: limite };
}

/** 23/11 (20270126000000): a pesquisa do Estúdio numa só leitura para todas as subcategorias do tipo de peça. Procura também nos
 *  atributos, aceita a referência (SKU, inteira ou parte, com ou sem traços) e devolve os mais parecidos primeiro (a referência, o nome
 *  igual, o texto seguido no nome, todas as palavras no nome, o nome mais curto). Só os produtos à venda (sem rascunhos, inativos nem
 *  sem PVP). `v: null` = a função ainda não existe na base (quem chama lê como antes, por cat_ler_produtos_pagina). */
export async function lerPesquisaDoEstudio(org: string, q: string, subcategorias: readonly string[], pagina: number): Promise<Res<PaginaProdutos | null>> {
  const r = await lerPaginaDe("cat_estudio_procurar_produtos", argsPesquisaEstudio(org, q, subcategorias, pagina));
  if (r.ok) return r;
  if (funcaoNomeadaEmFalta({ code: r.codigo, message: r.mensagemBase }, "cat_estudio_procurar_produtos")) return { ok: true, v: null };
  return { ok: false, erro: r.erro };
}

/** A página da lista; com `servico` no filtro é a pesquisa por serviço (cat_pesquisar_produtos). */
export const lerProdutosPagina = async (org: string, f: FiltroServidor, pagina: number): Promise<Res<PaginaProdutos>> => {
  if (f.servico) return lerPesquisaProdutos(org, f, pagina);
  const r = await lerPaginaDe("cat_ler_produtos_pagina", argsPagina(org, f, pagina));
  return r.ok ? r : { ok: false, erro: r.erro };
};

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

/** 22/01 (20270122200000): as marcas que existem no que o filtro já escolheu (sem a própria marca), com o nº de produtos de cada uma. `id` é o da marca na base (ou null); `nome` é o texto de p_marca. */
export interface MarcaDoFiltro { id: string | null; nome: string; n: number }
export interface MarcasDoFiltro { marcas: MarcaDoFiltro[]; semMarca: number; total: number }

/** A resposta de cat_ler_marcas_do_filtro; null se não trouxer a lista de marcas. As marcas sem nome ignoram-se. */
export function marcasDoFiltroDe(r: unknown): MarcasDoFiltro | null {
  if (!r || typeof r !== "object" || !Array.isArray((r as Record<string, unknown>).marcas)) return null;
  const o = r as Record<string, unknown>;
  const marcas = (o.marcas as unknown[]).flatMap((x): MarcaDoFiltro[] => {
    if (!x || typeof x !== "object") return [];
    const m = x as { id?: unknown; marca?: unknown; n?: unknown };
    const nome = typeof m.marca === "string" ? m.marca.trim() : "";
    return nome ? [{ id: typeof m.id === "string" ? m.id : null, nome, n: num(m.n) }] : [];
  });
  return { marcas, semMarca: num(o.sem_marca), total: num(o.total) };
}

/** Os argumentos de cat_ler_marcas_do_filtro: os da lista, sem a marca e sem página. */
export function argsMarcasDoFiltro(org: string, f: FiltroServidor): Record<string, unknown> {
  const { p_org, p_q, p_categoria, p_subcategoria, p_modelo, p_sem_categoria } = argsPagina(org, f, 1);
  return { p_org, p_q, p_categoria, p_subcategoria, p_modelo, p_sem_categoria };
}

/** `v: null` = a função ainda não existe na base (o ecrã fica com as marcas do arranque); qualquer outro erro é erro. */
export async function lerMarcasDoFiltro(org: string, f: FiltroServidor): Promise<Res<MarcasDoFiltro | null>> {
  try {
    const { data, error } = await rpcLivre("cat_ler_marcas_do_filtro", argsMarcasDoFiltro(org, f));
    if (error) {
      if (funcaoNomeadaEmFalta({ code: error.code, message: error.message }, "cat_ler_marcas_do_filtro")) return { ok: true, v: null };
      return { ok: false, erro: erroAmigavel(error, "Não foi possível ler as marcas.") };
    }
    const m = marcasDoFiltroDe(data);
    return m ? { ok: true, v: m } : { ok: false, erro: "A base respondeu num formato que não se percebe (marcas)." };
  } catch (e) {
    return { ok: false, erro: mensagem(e, "Não foi possível ler as marcas.") };
  }
}

/** 18/11: o contador por cima da lista. «Página X de Y · produtos 51–100 de 120»; um só produto «produtos 1 de 1»; vazio «0 produtos». O intervalo sai do limite e do total da própria página (sem pedir nada à base); números sem separador de milhares. */
export function textoEstadoPagina(d: Pick<PaginaProdutos, "pagina" | "paginas" | "total" | "limite">): string {
  if (d.total <= 0) return "0 produtos";
  const limite = d.limite > 0 ? d.limite : POR_PAGINA_SERVIDOR;
  const paginas = Math.max(d.paginas, 1), pagina = Math.min(Math.max(d.pagina, 1), paginas); // nunca «Página 0» nem «Página 5 de 2»
  const inicio = Math.min((pagina - 1) * limite + 1, d.total), fim = Math.min(pagina * limite, d.total);
  const quais = d.total === 1 ? "produtos 1 de 1" : `produtos ${inicio}–${fim} de ${d.total}`;
  return `Página ${pagina} de ${paginas} · ${quais}`;
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
