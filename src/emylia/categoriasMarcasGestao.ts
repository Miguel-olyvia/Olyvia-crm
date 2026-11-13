// 13/11: os dados do ecrã de gestão das categorias, subcategorias e marcas dos produtos do Catálogo (GestaoCategorias.tsx, GestaoMarcas.tsx).
// Chama as funções cat_* de 20270117700000_catalogo_categorias_marcas_gestao.sql. Os nomes e os argumentos das funções ficam todos aqui.
// Mesmo padrão de atributosGestao: ResG, erroAmigavel (função ainda sem existir → «Ainda não disponível nesta base»; os erros CT001–CT004
// trazem a mensagem em português da base e mostram-se tal e qual).
import { chamar, type ResG } from "./atributosGestao";

export type { ResG };

/** Uma subcategoria: como a categoria, sem filhos. `global`: partilhada por todas as organizações, só se lê. `usados`: produtos que a usam (null = não se sabe). */
export interface SubcategoriaGestao { id: string; nome: string; ordem: number; ativo: boolean; global: boolean; usados: number | null }
export interface CategoriaGestao extends SubcategoriaGestao { subcategorias: SubcategoriaGestao[] }
export interface MarcaGestao { id: string; nome: string; website: string | null; ativo: boolean; global: boolean; usados: number | null }

type Bruto = Record<string, unknown>;
const texto = (x: unknown): string => (typeof x === "string" ? x : "");
const contagem = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

function subDe(c: Bruto): SubcategoriaGestao {
  return { id: texto(c.id), nome: texto(c.nome), ordem: contagem(c.ordem) ?? 0, ativo: c.ativo !== false, global: c.global === true, usados: contagem(c.usados) };
}
function categoriaDe(c: Bruto): CategoriaGestao {
  return { ...subDe(c), subcategorias: Array.isArray(c.subcategorias) ? (c.subcategorias as Bruto[]).map(subDe) : [] };
}
function marcaDe(m: Bruto): MarcaGestao {
  return { id: texto(m.id), nome: texto(m.nome), website: texto(m.website).trim() || null, ativo: m.ativo !== false, global: m.global === true, usados: contagem(m.usados) };
}

export async function lerCategoriasGestao(org: string): Promise<ResG<CategoriaGestao[]>> {
  const r = await chamar("cat_ler_categorias_gestao", { p_org: org }, "Não foi possível ler as categorias.");
  if (!r.ok) return r;
  const lista = (r.v as { categorias?: unknown }).categorias;
  if (!Array.isArray(lista)) return { ok: false, erro: "Não foi possível ler as categorias." };
  return { ok: true, v: (lista as Bruto[]).map(categoriaDe) };
}

/** Cria (id null) ou renomeia. `pai` null = categoria de topo; um id de categoria = subcategoria. Mudar de pai não se pode. */
export function guardarCategoria(org: string, o: { id: string | null; pai: string | null; nome: string }): Promise<ResG<unknown>> {
  return chamar("cat_guardar_categoria_produto", { p_org: org, p_id: o.id, p_pai: o.pai, p_nome: o.nome }, "Não foi possível guardar a categoria.");
}

/** Desativar uma categoria desativa também as subcategorias ativas dela; reativá-la não reativa as subcategorias. */
export function estadoCategoria(org: string, id: string, ativo: boolean): Promise<ResG<unknown>> {
  return chamar("cat_estado_categoria_produto", { p_org: org, p_id: id, p_ativo: ativo }, "Não foi possível mudar o estado da categoria.");
}

/** `ids` = TODAS as irmãs da organização debaixo de `pai` (null = categorias de topo), na ordem nova; as partilhadas não entram. */
export function reordenarCategorias(org: string, pai: string | null, ids: readonly string[]): Promise<ResG<unknown>> {
  return chamar("cat_reordenar_categorias", { p_org: org, p_pai: pai, p_ids: [...ids] }, "Não foi possível mudar a ordem.");
}

export async function lerMarcasGestao(org: string): Promise<ResG<MarcaGestao[]>> {
  const r = await chamar("cat_ler_marcas_gestao", { p_org: org }, "Não foi possível ler as marcas.");
  if (!r.ok) return r;
  const lista = (r.v as { marcas?: unknown }).marcas;
  if (!Array.isArray(lista)) return { ok: false, erro: "Não foi possível ler as marcas." };
  return { ok: true, v: (lista as Bruto[]).map(marcaDe) };
}

/** Cria (id null) ou renomeia. `website`: null não mexe (ao criar: sem site), «» limpa, senão http(s)://… */
export function guardarMarca(org: string, o: { id: string | null; nome: string; website: string | null }): Promise<ResG<unknown>> {
  return chamar("cat_guardar_marca", { p_org: org, p_id: o.id, p_nome: o.nome, p_website: o.website }, "Não foi possível guardar a marca.");
}

export function estadoMarca(org: string, id: string, ativo: boolean): Promise<ResG<unknown>> {
  return chamar("cat_estado_marca", { p_org: org, p_id: id, p_ativo: ativo }, "Não foi possível mudar o estado da marca.");
}
