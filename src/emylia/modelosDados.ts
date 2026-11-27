// 16/11: os dados dos MODELOS do Catálogo (Categoria › Subcategoria › Modelo). O modelo define o NNNN do SKU (SORTY 0001, STONE PLUS 0002…); a marca só
// identifica e filtra. Chama as funções cat_* de 20270118300000_catalogo_modelos_e_sku_por_modelo.sql (POR APLICAR: até lá respondem «Ainda não disponível
// nesta base»). Quem decide é a base (número automático, subcategoria e número fixos depois de criado); aqui só se chama e se traduz.
import { chamar, type ResG } from "./atributosGestao";
import { lerCategoriasGestao } from "./categoriasMarcasGestao";
import { resolverCategoria } from "./skuDados";
import { modelo3dDeLeitura } from "./modelo3dDados";

export interface RamoModelo { id: string; nome: string; sigla: string | null }
/** `usados`: produtos vivos que o usam. `subcategoria.ativo`: um modelo numa subcategoria desativada não se reativa.
 *  `modelo3d`: o modelo 3D escolhido neste Modelo (null: herda da subcategoria; também null se a migração ainda não está aplicada). */
export interface ModeloGestao {
  id: string; nome: string; numero: number; ativo: boolean; usados: number;
  subcategoria: RamoModelo & { ativo: boolean }; categoria: RamoModelo | null; modelo3d: string | null;
}

type Bruto = Record<string, unknown>;
const texto = (x: unknown): string => (typeof x === "string" ? x : "");
const sigla = (x: unknown): string | null => texto(x).trim() || null;
const inteiro = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);

/** O NNNN do SKU: sempre 4 dígitos. */
export const numeroSku = (n: number): string => String(n).padStart(4, "0");
/** «0001 · SORTY». */
export const rotuloModelo = (m: { numero: number; nome: string }): string => `${numeroSku(m.numero)} · ${m.nome}`;

function modeloDe(m: Bruto): ModeloGestao {
  const s = (m.subcategoria && typeof m.subcategoria === "object" ? m.subcategoria : {}) as Bruto;
  const c = m.categoria && typeof m.categoria === "object" ? (m.categoria as Bruto) : null;
  return {
    id: texto(m.id), nome: texto(m.nome), numero: inteiro(m.numero), ativo: m.ativo !== false, usados: inteiro(m.usados),
    subcategoria: { id: texto(s.id), nome: texto(s.nome), sigla: sigla(s.sigla), ativo: s.ativo !== false },
    categoria: c ? { id: texto(c.id), nome: texto(c.nome), sigla: sigla(c.sigla) } : null,
    modelo3d: modelo3dDeLeitura(m.modelo3d),
  };
}

export async function lerModelosGestao(org: string): Promise<ResG<ModeloGestao[]>> {
  const r = await chamar("cat_ler_modelos_gestao", { p_org: org }, "Não foi possível ler os modelos.");
  if (!r.ok) return r;
  const lista = (r.v as { modelos?: unknown }).modelos;
  if (!Array.isArray(lista)) return { ok: false, erro: "Não foi possível ler os modelos." };
  return { ok: true, v: (lista as Bruto[]).map(modeloDe) };
}

/** Cria (id null: `subcategoria` obrigatória; `numero` null = o seguinte) ou renomeia (id; a subcategoria e o número não mudam). */
export function guardarModelo(org: string, o: { id: string | null; subcategoria: string | null; nome: string; numero: number | null }): Promise<ResG<unknown>> {
  return chamar("cat_guardar_modelo", { p_org: org, p_id: o.id, p_subcategoria: o.subcategoria, p_nome: o.nome, p_numero: o.numero }, "Não foi possível guardar o modelo.");
}

export function estadoModelo(org: string, id: string, ativo: boolean): Promise<ResG<unknown>> {
  return chamar("cat_estado_modelo", { p_org: org, p_id: id, p_ativo: ativo }, "Não foi possível mudar o estado do modelo.");
}

/** Liga (ou, com null, desliga) um produto a um modelo da subcategoria dele. Não gera o SKU: chamar cat_gerar_sku_produto a seguir. */
export function guardarProdutoModelo(org: string, produto: string, modelo: string | null): Promise<ResG<unknown>> {
  return chamar("cat_guardar_produto_modelo", { p_org: org, p_produto: produto, p_modelo: modelo }, "Não foi possível ligar o produto ao modelo.");
}

/** O que se escolheu para o modelo de um produto que já existe: um modelo (id), nenhum (id «» e sem nome) ou um novo (`novo`: só o nome). */
export interface EscolhaModelo { id: string; novo: string | null }

/** Na ficha: liga o produto ao modelo escolhido (ou, sem modelo, desliga-o). Um modelo novo cria-se primeiro, na subcategoria do produto (achada pelos nomes,
 *  que já têm de estar gravados) e com o número automático. Devolve o id do modelo ligado (null = nenhum). Não gera a referência. */
export async function ligarModeloAoProduto(org: string, produto: string, escolha: EscolhaModelo, ramo: { categoria: string | null; subcategoria: string | null }): Promise<ResG<string | null>> {
  let modelo: string | null = escolha.id || null;
  if (escolha.novo) {
    if (!ramo.categoria || !ramo.subcategoria) return { ok: false, erro: "Escolha a subcategoria antes de criar o modelo." };
    const l = await lerCategoriasGestao(org);
    if (!l.ok) return l;
    const r = resolverCategoria(l.v, ramo.categoria, ramo.subcategoria);
    if (r.k === "ambiguo") return { ok: false, erro: "Há categorias com o mesmo nome: não se sabe onde criar o modelo." };
    if (r.k !== "ok" || !r.subcategoria) return { ok: false, erro: "A subcategoria ainda não existe na base: guarde primeiro a classificação." };
    const c = await guardarModelo(org, { id: null, subcategoria: r.subcategoria, nome: escolha.novo, numero: null });
    if (!c.ok) return c;
    const id = (c.v as { modelo?: { id?: unknown } }).modelo?.id;
    if (typeof id !== "string") return { ok: false, erro: "Não foi possível criar o modelo." };
    modelo = id;
  }
  const g = await guardarProdutoModelo(org, produto, modelo);
  return g.ok ? { ok: true, v: modelo } : g;
}
