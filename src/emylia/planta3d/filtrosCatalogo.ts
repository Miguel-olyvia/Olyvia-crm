// Protótipo (visualizador 3D): a lógica PURA dos filtros do passo «Escolher produtos» (sem React, sem DOM): índice de pesquisa, filtros combinados (E), facetas com
// contagem (marca e categoria), chips dos filtros ativos, «ver parecidos» e os produtos já agrupados noutras famílias. Só lê o catálogo.
// Campos do produto usados: `marca` (texto), `no` (o nó da árvore: «ofício › sub»), `sub` e `sku` (só para a pesquisa), `custo`/`pvp` (via refDoProduto, para «só com preço»).
import type { No, Produto } from "../v2/catalogoModelo";
import { sem } from "./catalogo3d";
import { refDoProduto, type FamiliaCfg } from "./configurador";

/** O máximo de produtos que «Selecionar os N resultados» junta de uma vez; acima disto avisa-se e afina-se. */
export const MAX_SELECAO = 200;
const SEM_MARCA = "Sem marca", SEM_CATEGORIA = "Sem categoria", SEPARADOR = " › ";

export interface FiltrosCatalogo {
  q: string;
  /** chaves de marca (sem acentos nem maiúsculas; «» = sem marca) */
  marcas: readonly string[];
  /** ids de nó da árvore («» = sem categoria) */
  categorias: readonly string[];
  soComPreco: boolean; semFamilia: boolean; soEscolhidos: boolean;
}
export interface ContextoFiltros { /** produtos já noutras famílias da sessão */ ocupados: ReadonlySet<string>; escolhidos: ReadonlySet<string> }
export interface ItemIndexado { p: Produto; texto: string; marca: string; categoria: string; comPreco: boolean }
export interface IndiceCatalogo { itens: readonly ItemIndexado[]; marcas: ReadonlyMap<string, string>; categorias: ReadonlyMap<string, string> }
export interface Faceta { valor: string; rotulo: string; n: number; marcada: boolean }
export interface ChipFiltro { id: string; grupo: string; texto: string }

export const filtrosIniciais = (): FiltrosCatalogo => ({ q: "", marcas: [], categorias: [], soComPreco: false, semFamilia: false, soEscolhidos: false });
const termosDe = (q: string): string[] => sem(q.trim()).split(/\s+/).filter(Boolean);

/** O caminho «Ofício › Sub» de um nó (com guarda contra ciclos). */
function caminhoDoNo(id: string, nos: ReadonlyMap<string, No>): string {
  const partes: string[] = [];
  const visto = new Set<string>();
  for (let n = nos.get(id); n && !visto.has(n.id); n = n.pai ? nos.get(n.pai) : undefined) { visto.add(n.id); partes.unshift(n.n); }
  return partes.join(SEPARADOR);
}

/** O texto de pesquisa, a marca, a categoria e o «tem preço» de cada produto, calculados uma vez por catálogo. */
export function indexarCatalogo(produtos: readonly Produto[], arvore: readonly No[]): IndiceCatalogo {
  const nos = new Map(arvore.map((n) => [n.id, n] as const));
  const marcas = new Map<string, string>(), categorias = new Map<string, string>(), caminhos = new Map<string, string>();
  const itens = produtos.map((p): ItemIndexado => {
    const rotuloMarca = p.marca?.trim() ?? "", marca = sem(rotuloMarca);
    if (!marcas.has(marca)) marcas.set(marca, rotuloMarca || SEM_MARCA);
    const categoria = p.no && nos.has(p.no) ? p.no : "";
    if (!categorias.has(categoria)) categorias.set(categoria, categoria ? (caminhos.get(categoria) ?? caminhoDoNo(categoria, nos)) : SEM_CATEGORIA);
    const caminho = categoria ? categorias.get(categoria) ?? "" : "";
    return { p, marca, categoria, comPreco: refDoProduto(p).preco > 0, texto: sem(`${p.n} ${rotuloMarca} ${p.sku ?? ""} ${p.sub ?? ""} ${caminho}`) };
  });
  return { itens, marcas, categorias };
}

type Ignorar = "marcas" | "categorias" | undefined;
function passa(x: ItemIndexado, f: FiltrosCatalogo, ctx: ContextoFiltros, termos: readonly string[], ignorar: Ignorar): boolean {
  if (termos.length > 0 && !termos.every((t) => x.texto.includes(t))) return false;
  if (ignorar !== "marcas" && f.marcas.length > 0 && !f.marcas.includes(x.marca)) return false;
  if (ignorar !== "categorias" && f.categorias.length > 0 && !f.categorias.includes(x.categoria)) return false;
  if (f.soComPreco && !x.comPreco) return false;
  if (f.semFamilia && ctx.ocupados.has(x.p.id)) return false;
  if (f.soEscolhidos && !ctx.escolhidos.has(x.p.id)) return false;
  return true;
}

/** Os produtos que passam em TODOS os filtros e na pesquisa, pela ordem do catálogo. */
export function aplicarFiltros(indice: IndiceCatalogo, f: FiltrosCatalogo, ctx: ContextoFiltros): ItemIndexado[] {
  const termos = termosDe(f.q);
  return indice.itens.filter((x) => passa(x, f, ctx, termos, undefined));
}

function contar(indice: IndiceCatalogo, f: FiltrosCatalogo, ctx: ContextoFiltros, qual: "marcas" | "categorias"): Faceta[] {
  const termos = termosDe(f.q), n = new Map<string, number>(), marcadas = f[qual], rotulos = indice[qual];
  for (const x of indice.itens) if (passa(x, f, ctx, termos, qual)) { const v = qual === "marcas" ? x.marca : x.categoria; n.set(v, (n.get(v) ?? 0) + 1); }
  for (const v of marcadas) if (!n.has(v)) n.set(v, 0);
  return [...n.entries()].map(([valor, c]) => ({ valor, rotulo: rotulos.get(valor) ?? valor, n: c, marcada: marcadas.includes(valor) }))
    .sort((a, b) => b.n - a.n || a.rotulo.localeCompare(b.rotulo, "pt"));
}
/** As facetas de marca e de categoria: cada uma conta com os OUTROS filtros e a pesquisa (não com o dela própria, para se poder trocar de valor). */
export const facetasDe = (indice: IndiceCatalogo, f: FiltrosCatalogo, ctx: ContextoFiltros): { marcas: Faceta[]; categorias: Faceta[] } =>
  ({ marcas: contar(indice, f, ctx, "marcas"), categorias: contar(indice, f, ctx, "categorias") });

/** Um chip por filtro ativo (a pesquisa só de espaços não conta). */
export function chipsDe(indice: IndiceCatalogo, f: FiltrosCatalogo): ChipFiltro[] {
  const c: ChipFiltro[] = [];
  if (f.q.trim()) c.push({ id: "q", grupo: "Pesquisa", texto: `Pesquisa: ${f.q.trim()}` });
  for (const m of f.marcas) c.push({ id: `marca:${m}`, grupo: "Marca", texto: `Marca: ${indice.marcas.get(m) ?? (m || SEM_MARCA)}` });
  for (const k of f.categorias) c.push({ id: `categoria:${k}`, grupo: "Categoria", texto: `Categoria: ${indice.categorias.get(k) ?? (k || SEM_CATEGORIA)}` });
  if (f.soComPreco) c.push({ id: "preco", grupo: "Preço", texto: "Só com preço de venda" });
  if (f.semFamilia) c.push({ id: "semFamilia", grupo: "Família", texto: "Ainda sem família" });
  if (f.soEscolhidos) c.push({ id: "escolhidos", grupo: "Escolha", texto: "Só os escolhidos" });
  return c;
}
export const contarFiltrosAtivos = (f: FiltrosCatalogo): number => (f.q.trim() ? 1 : 0) + f.marcas.length + f.categorias.length + Number(f.soComPreco) + Number(f.semFamilia) + Number(f.soEscolhidos);

/** Os filtros sem o do chip `id` (não muta). */
export function semChip(f: FiltrosCatalogo, id: string): FiltrosCatalogo {
  if (id === "q") return { ...f, q: "" };
  if (id === "preco") return { ...f, soComPreco: false };
  if (id === "semFamilia") return { ...f, semFamilia: false };
  if (id === "escolhidos") return { ...f, soEscolhidos: false };
  if (id.startsWith("marca:")) return { ...f, marcas: f.marcas.filter((m) => m !== id.slice(6)) };
  if (id.startsWith("categoria:")) return { ...f, categorias: f.categorias.filter((k) => k !== id.slice(10)) };
  return f;
}

/** Uma medida («40», «60x45x80», «86cm», «34cm»), sozinha. */
const MEDIDA = /^\d+([.,]\d+)?([x×]\d+([.,]\d+)?)*(cm|mm|m)?$/i;
/** O nome sem a medida, as dimensões, as «cubas» e o acabamento depois do último « - »: serve para juntar os produtos da mesma família. */
export function nomeBase(nome: string): string {
  const texto = nome.replace(/\s+/g, " ").trim();
  if (!texto) return "";
  const partes = texto.split(/\s+[-–—]\s+/), inicio = partes.length > 1 ? partes.slice(0, -1).join(" - ") : texto;
  const palavras = inicio.split(" ").filter((w) => !MEDIDA.test(w) && !/^cm$/i.test(w) && !/^cubas?$/i.test(w));
  return palavras.join(" ") || texto;
}
/** Os filtros de «ver parecidos»: só a pesquisa pelo nome-base (os outros filtros saem, para não esconderem os irmãos). */
export const comParecidos = (nome: string): FiltrosCatalogo => ({ ...filtrosIniciais(), q: nomeBase(nome) });

/** Os produtos que já estão em famílias da sessão (menos a que se está a editar). */
export function idsEmFamilias(familias: readonly FamiliaCfg[], exceto?: string | null): Set<string> {
  const ids = new Set<string>();
  for (const f of familias) if (f.id !== exceto) for (const c of Object.values(f.celulas)) if (c.produtoId) ids.add(c.produtoId);
  return ids;
}
