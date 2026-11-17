// 17/11: as leituras LEVES da página de Produtos do Catálogo. Em vez de cat_ler_catalogo (30 MB, ~6 s) e cat_ler_produtos_tabelas (8,6 MB), a página lê
//   cat_ler_referencias_produtos(p_org)   a árvore dos produtos, as marcas, as unidades, a regra «exige» e os modelos (sem a lista de produtos)
//   cat_ler_atributos_definicoes(p_org)   as definições dos atributos
//   cat_ler_produto(p_org, p_produto)     UM produto, para a ficha (com o estado, o modelo e os valores já calculados)
// e a lista continua em cat_ler_produtos_pagina. Daqui sai um Catálogo «leve» (K.produtos vazio) com o mesmo formato que o ecrã já conhece.
import { AINDA_NAO, erroAmigavel, rpcLivre, type Res } from "../fichaProdutoDados";
import { catalogo0, type Catalogo, type Produto } from "../v2/catalogoModelo";
import { normal } from "../catalogo";
import { juntarAtributos, juntarModelos, juntarTabelas, linhasDe } from "./lerCatalogo";
import { montarCatalogo } from "./catalogoReal";
import { SEM_FILTRO_SERVIDOR, lerProdutosPagina, type LinhaPaginaProduto } from "./produtosPaginados";

const mensagem = (e: unknown, omissao: string) => (e instanceof Error && e.message ? e.message : omissao);
const eObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** O que a página leve lê ao abrir. `erroAtributos`: as definições dos atributos não se leram (a lista e a ficha funcionam; Criar fica bloqueado, para não criar sem os atributos). */
export interface CatalogoLeve { K: Catalogo; margens: { min: number; alvo: number }; erroAtributos: string | null }
/** Sem parâmetros (null: técnico, ou organização sem eles) valem as margens de arranque, como em montarCatalogo. */
export const MARGENS_OMISSAO = { min: 28, alvo: 35 };
const margensDe = (p: unknown): { min: number; alvo: number } =>
  eObjeto(p) ? { min: Number(p.margem_minima) || 0, alvo: Number(p.margem_alvo) || 0 } : MARGENS_OMISSAO;
const lerComErro = async (fn: string, org: string) => rpcLivre(fn, { p_org: org }).catch((e: unknown) => ({ data: null as unknown, error: { message: mensagem(e, "Falhou a leitura.") } }));

/** O Catálogo leve: a árvore dos produtos, os modelos, as marcas, as unidades, os atributos e as margens (cat_ler_parametros_catalogo); sem produtos. */
export async function lerCatalogoLeve(org: string): Promise<Res<CatalogoLeve>> {
  try {
    const [refs, defs, par] = await Promise.all([
      rpcLivre("cat_ler_referencias_produtos", { p_org: org }),
      lerComErro("cat_ler_atributos_definicoes", org),
      lerComErro("cat_ler_parametros_catalogo", org),
    ]);
    // sem a função dos parâmetros (base antiga) valem as margens de arranque; qualquer outra falha diz-se
    if (par.error && erroAmigavel(par.error) !== AINDA_NAO) return { ok: false, erro: erroAmigavel(par.error, "Não foi possível ler as margens do Catálogo.") };
    const erroAtributos = defs.error && erroAmigavel(defs.error) !== AINDA_NAO ? erroAmigavel(defs.error, "Não foi possível ler os atributos.") : null;
    if (refs.error) return { ok: false, erro: /^CT00\d$/.test(refs.error.code ?? "") && refs.error.message ? refs.error.message : erroAmigavel(refs.error, "Não foi possível ler as referências dos produtos.") };
    if (!eObjeto(refs.data) || !Array.isArray(refs.data.categoriasProduto)) return { ok: false, erro: "A base respondeu num formato que não se percebe (referências)." };
    // as 4 primeiras chaves são as de cat_ler_produtos_tabelas, sem o array dos produtos
    let L = juntarTabelas(linhasDe(null), { ...refs.data, produtos: [] });
    L = juntarAtributos(L, defs.error ? null : defs.data);
    L = juntarModelos(L, refs.data, null);
    return { ok: true, v: { K: montarCatalogo(L, catalogo0(), {}).K, margens: par.error ? MARGENS_OMISSAO : margensDe(par.data), erroAtributos } };
  } catch (e) {
    return { ok: false, erro: mensagem(e, "Não foi possível ler as referências dos produtos.") };
  }
}

const texto = (v: unknown): string => (typeof v === "string" ? v : "");
const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const ESTADOS = new Set(["draft", "active", "discontinued"]);

/** Um produto de cat_ler_produto como Produto da ficha. Sem services.view (`ve_valores` false) os valores vêm null e `precosLidos` não se marca. */
export function produtoDeLeitura(r: unknown): Produto | null {
  if (!eObjeto(r) || typeof r.id !== "string" || !r.id) return null;
  const sub = texto(r.subcategory_id), cat = texto(r.category_id);
  const pvp = numero(r.pvp), gros = numero(r.grossista), dist = numero(r.distribuidor), m3 = numero(r.entulho_m3), kg = numero(r.entulho_kg);
  const fotos = Array.isArray(r.image_urls) ? r.image_urls.filter((u): u is string => typeof u === "string" && !!u) : [];
  const modeloId = texto(r.modelo_id);
  return {
    id: r.id, n: texto(r.name), custo: numero(r.custo) ?? 0, un: texto(r.uom) || texto(r.unidade) || "un", marca: texto(r.marca) || texto(r.marca_livre),
    fornecedor: texto(r.fornecedor) || texto(r.fornecedor_livre), data: texto(r.custo_data).slice(0, 10), no: sub || cat || null,
    ...(r.servico_id ? { servico: texto(r.servico_id), fatorServico: numero(r.fator_servico) || 1 } : {}),
    ...(texto(r.sku) ? { sku: texto(r.sku) } : {}), ...(pvp != null && pvp > 0 ? { pvp } : {}),
    ...(r.ve_valores === true ? { precosLidos: true as const } : {}),
    ...(gros != null ? { grossista: gros } : {}), ...(dist != null ? { distribuidor: dist } : {}), ...(texto(r.short_description) ? { desc: texto(r.short_description) } : {}),
    ...(m3 != null ? { entulho: { m3, ...(kg != null ? { kg } : {}) } } : {}), ...(fotos.length ? { fotos } : {}),
    ...(modeloId ? { modeloId, modelo: texto(r.modelo), modeloNumero: numero(r.modelo_numero) ?? 0 } : {}),
    ...(typeof r.estado === "string" && ESTADOS.has(r.estado) ? { estado: r.estado as Produto["estado"] } : {}),
  };
}

/** A ficha: um produto (cat_ler_produto). A base recusa com CT001 (sem permissão) e CT003 (inexistente): a mensagem mostra-se tal como vem. */
export async function lerProdutoFicha(org: string, id: string): Promise<Res<Produto>> {
  try {
    const { data, error } = await rpcLivre("cat_ler_produto", { p_org: org, p_produto: id });
    if (error) return { ok: false, erro: /^CT00\d$/.test(error.code ?? "") && error.message ? error.message : erroAmigavel(error, "Não foi possível ler o produto."), ...(error.code ? { codigo: error.code } : {}) };
    const p = produtoDeLeitura(data);
    return p ? { ok: true, v: p } : { ok: false, erro: "A base respondeu num formato que não se percebe (produto)." };
  } catch (e) {
    return { ok: false, erro: mensagem(e, "Não foi possível ler o produto.") };
  }
}

/** Criar: o nome (ou a referência) já existe? A base já recusa a referência repetida (products_sku_organization_id_key), mas só depois de gravar parte do produto; o nome
 *  repetido não o recusa. Procura-se por esse nome (e referência) com cat_ler_produtos_pagina, sem precisar dos produtos todos. Devolve a frase da recusa, ou null. */
export async function procurarDuplicado(org: string, o: { n: string; sku: string }): Promise<string | null> {
  const nome = o.n.trim(), sku = o.sku.trim();
  if (nome && await existe(org, nome, (p) => normal(p.nome.trim()) === normal(nome))) return `Já existe «${nome}».`;
  if (sku && await existe(org, sku, (p) => !!p.sku && normal(p.sku) === normal(sku))) return `A referência ${sku} já é de outro produto.`;
  return null;
}

/** Máximo de páginas (de 50) percorridas por pesquisa: um nome tão genérico que passe disto não é um duplicado por acaso. */
const MAX_PAGINAS_DUPLICADO = 20;
/** Percorre as páginas da pesquisa até achar um produto que cumpra `igual` ou acabarem. Uma falha de leitura sobe (não se grava sem saber). */
async function existe(org: string, q: string, igual: (p: LinhaPaginaProduto) => boolean): Promise<boolean> {
  for (let pagina = 1; pagina <= MAX_PAGINAS_DUPLICADO; pagina++) {
    const r = await lerProdutosPagina(org, { ...SEM_FILTRO_SERVIDOR, q }, pagina);
    if (!r.ok) throw new Error(r.erro);
    if (r.v.produtos.some(igual)) return true;
    if (pagina >= r.v.paginas) return false;
  }
  return false;
}
