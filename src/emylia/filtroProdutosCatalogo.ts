// 16/11: os filtros da lista de PRODUTOS do Catálogo (Categoria, Subcategoria, Marca). Só de produtos: o «Ofício» dos serviços já não entra.
// O modelo guarda o produto num só nó da árvore (Produto.no; ramoProduto.ts: categoria → subcategoria). As categorias e subcategorias oferecidas vêm
// da árvore dos produtos da organização (K.categoriasProduto, de product_categories), TODAS as ativas, mesmo sem produtos (a Mudelar tem 0 produtos),
// por sort_order e nome. Uma desativada só aparece se algum produto ainda a tem («X (desativada)»). Sem K.categoriasProduto (protótipo sem «real», base
// sem as tabelas) o filtro cai nos ramos dos produtos que existem e, sem produtos classificados, nos ofícios, como antes.
// «Sem categoria de produto» (SEM_CATEGORIA_PRODUTO) apanha os produtos que não estão em nenhuma categoria de produto: sem nó, ou só com o ofício
// dos serviços (catalogo_categoria_id, sem category_id nem subcategory_id). Nota: um ofício dos serviços com o MESMO NOME de uma categoria de produto
// é o mesmo nó (a árvore junta-as pelo nome), por isso conta como essa categoria.
import { oficios, type Catalogo, type CategoriaProdutoK, type Produto } from "./v2/catalogoModelo";
import { ramoDe } from "./ramoProduto";

export interface FiltroProdutos { cat: string; sub: string; marca: string }
export const SEM_FILTRO_PRODUTOS: FiltroProdutos = { cat: "", sub: "", marca: "" };
/** O valor do filtro Categoria para «Sem categoria de produto» (nunca é um id de nó). */
export const SEM_CATEGORIA_PRODUTO = "__sem_categoria_produto__";
/** Um ramo oferecido num filtro. `inativa`: desativada na base, mas ainda com produtos. */
export interface RamoFiltro { id: string; n: string; inativa?: true }
type Modelo = Pick<Catalogo, "arvore" | "produtos" | "categoriasProduto">;

/** Os ramos (categoria e subcategoria) onde há produtos. */
function ramosComProdutos(K: Pick<Catalogo, "arvore" | "produtos">): { cats: Set<string>; subs: Set<string> } {
  const cats = new Set<string>(), subs = new Set<string>();
  for (const p of K.produtos) {
    const r = ramoDe(K.arvore, p.no);
    if (r.cat) cats.add(r.cat);
    if (r.sub) subs.add(r.sub);
  }
  return { cats, subs };
}
const porOrdem = (a: CategoriaProdutoK, b: CategoriaProdutoK) => a.ordem - b.ordem || a.n.localeCompare(b.n, "pt");
/** Por sort_order e nome, sem ids repetidos (duas categorias de nome igual juntam-se no mesmo nó): fica a primeira e só é desativada se todas o forem. */
function semRepetidos(L: readonly CategoriaProdutoK[]): CategoriaProdutoK[] {
  const m = new Map<string, CategoriaProdutoK>();
  for (const c of [...L].sort(porOrdem)) {
    const antes = m.get(c.id);
    if (!antes) m.set(c.id, c);
    else if (antes.inativa && !c.inativa) m.set(c.id, { id: antes.id, n: antes.n, pai: antes.pai, ordem: antes.ordem });
  }
  return [...m.values()];
}
const ramo = (c: CategoriaProdutoK): RamoFiltro => ({ id: c.id, n: c.n, ...(c.inativa ? { inativa: true as const } : {}) });

/** As categorias de produtos (topo). Sem a árvore dos produtos: as dos produtos que existem; sem produtos classificados, os ofícios. */
export function categoriasDeProdutos(K: Modelo): RamoFiltro[] {
  const { cats } = ramosComProdutos(K);
  if (K.categoriasProduto) return semRepetidos(K.categoriasProduto).filter((c) => c.pai == null && (!c.inativa || cats.has(c.id))).map(ramo);
  return (cats.size ? K.arvore.filter((x) => x.pai == null && cats.has(x.id)) : oficios(K.arvore)).map((x) => ({ id: x.id, n: x.n }));
}

/** As subcategorias de uma categoria (vazio sem categoria). */
export function subcategoriasDeProdutos(K: Modelo, cat: string): RamoFiltro[] {
  if (!cat) return [];
  const { subs } = ramosComProdutos(K);
  if (K.categoriasProduto) return semRepetidos(K.categoriasProduto).filter((c) => c.pai === cat && (!c.inativa || subs.has(c.id))).map(ramo);
  return K.arvore.filter((x) => x.pai === cat && subs.has(x.id)).map((x) => ({ id: x.id, n: x.n }));
}

/** O produto não está em nenhuma categoria de produto (sem nó, ou com um nó que não é da árvore dos produtos). */
const semCategoria = (ids: ReadonlySet<string> | null, p: Produto) => !p.no || (ids != null && !ids.has(p.no));
const idsDeCategorias = (K: Pick<Catalogo, "categoriasProduto">) => (K.categoriasProduto ? new Set(K.categoriasProduto.map((c) => c.id)) : null);
/** Há produtos para «Sem categoria de produto»? Só então a opção se oferece. */
export function haProdutosSemCategoria(K: Pick<Catalogo, "produtos" | "categoriasProduto">): boolean {
  const ids = idsDeCategorias(K);
  return K.produtos.some((p) => semCategoria(ids, p));
}

/** A marca compara-se sem espaços de fora nem maiúsculas. */
export const normalizarMarca = (m: string) => m.trim().toLowerCase();

/** Os produtos que passam os três filtros; um filtro vazio não filtra. Escolher a categoria inclui as subcategorias dela. */
export function filtrarProdutosCatalogo(K: Pick<Catalogo, "arvore" | "categoriasProduto">, produtos: readonly Produto[], f: FiltroProdutos): Produto[] {
  if (!f.cat && !f.sub && !f.marca) return [...produtos];
  const marca = normalizarMarca(f.marca);
  const ids = f.cat === SEM_CATEGORIA_PRODUTO ? idsDeCategorias(K) : null;
  const porId = new Map(K.arvore.map((x) => [x.id, x]));
  return produtos.filter((p) => {
    if (marca && normalizarMarca(p.marca) !== marca) return false;
    if (f.cat === SEM_CATEGORIA_PRODUTO) return semCategoria(ids, p);
    if (!f.cat && !f.sub) return true;
    const x = p.no ? porId.get(p.no) : undefined;
    if (!x) return false;
    const filho = x.pai != null && porId.has(x.pai); // é subcategoria
    const cat = filho ? x.pai : x.id, sub = filho ? x.id : "";
    return (!f.cat || cat === f.cat) && (!f.sub || sub === f.sub);
  });
}
