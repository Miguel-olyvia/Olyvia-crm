/**
 * O que se gastou, e de onde veio.
 *
 * Três origens possíveis para um custo, por ordem de quanto se sabe sobre ele:
 *
 *  · de uma COMPRA — sabe-se o preço que o fornecedor cobrou;
 *  · do CATÁLOGO — sabe-se o preço de tabela, e emparelha com o orçamento;
 *  · à MÃO — sabe-se o que a pessoa escreveu.
 *
 * A mão de obra não está nesta lista: sai sozinha das sessões de trabalho.
 */

import { supabase } from "./supabase";
import { ErroDeDados, ErroDeEscrita } from "./dados";

function rebentar(contexto: string, error: { message: string } | null): void {
  if (!error) return;
  // eslint-disable-next-line no-console
  console.error(`[Operações] ${contexto}:`, error);
  throw new ErroDeDados(`Não foi possível ${contexto}.`);
}

export interface LinhaDeCusto {
  id: string;
  tipo: string;
  descricao: string;
  quantidade: number;
  valor_unit: number;
  total: number;
  unidade: string | null;
  origem: string;
  catalog_item_id: string | null;
  compra_linha_id: string | null;
  criado_em: string;
}

export async function custosDaOrdem(ordemId: string): Promise<LinhaDeCusto[]> {
  const { data, error } = await supabase
    .from("ops_custo")
    .select(
      "id, tipo, descricao, quantidade, valor_unit, total, unidade, origem, " +
        "catalog_item_id, compra_linha_id, criado_em"
    )
    .eq("ordem_id", ordemId)
    .order("tipo")
    .order("criado_em");
  // Sem `operations.costs.view` a RLS devolve vazio, e isso não é um erro:
  // é a resposta certa para quem não pode ver números.
  if (error) return [];
  return (data ?? []) as unknown as LinhaDeCusto[];
}

export interface ItemDeCatalogo {
  id: string;
  codigo: string;
  descricao: string;
  categoria: string | null;
  custo_material: number;
  custo_mao_obra: number;
  custo_total: number;
}

export async function listarCatalogo(orgId: string): Promise<ItemDeCatalogo[]> {
  const { data, error } = await supabase
    .from("ops_v_catalogo")
    .select("id, codigo, descricao, categoria, custo_material, custo_mao_obra, custo_total")
    .eq("organization_id", orgId)
    .order("descricao")
    .limit(500);
  rebentar("carregar o catálogo", error);
  return (data ?? []) as unknown as ItemDeCatalogo[];
}

export interface LinhaDeCompra {
  id: string;
  numero: string;
  data: string | null;
  descricao: string;
  sku: string | null;
  quantidade: number;
  preco_unit: number;
  total: number;
  ja_atribuido: number;
}

/**
 * As linhas de compra que ainda têm quantidade por atribuir.
 *
 * As que já foram todas lançadas noutra obra não aparecem — mostrar uma linha
 * que a base vai recusar é fazer perder tempo a quem a escolhe.
 */
export async function listarComprasPorAtribuir(orgId: string): Promise<LinhaDeCompra[]> {
  const { data, error } = await supabase
    .from("ops_v_compra_linha")
    .select("id, numero, data, descricao, sku, quantidade, preco_unit, total, ja_atribuido")
    .eq("organization_id", orgId)
    .order("data", { ascending: false, nullsFirst: false })
    .limit(300);
  rebentar("carregar as compras", error);
  const linhas = (data ?? []) as unknown as LinhaDeCompra[];
  return linhas.filter((l) => Number(l.quantidade) - Number(l.ja_atribuido) > 0);
}

export async function lancarCusto(c: {
  ordemId: string;
  tipo: string;
  descricao?: string | null;
  quantidade: number;
  valorUnit?: number | null;
  unidade?: string | null;
  catalogItemId?: string | null;
  compraLinhaId?: string | null;
}): Promise<{ ok: boolean; id: string; total: number; origem: string }> {
  const { data, error } = await supabase.rpc("rpc_ops_lancar_custo", {
    p_ordem_id: c.ordemId,
    p_tipo: c.tipo,
    p_descricao: c.descricao ?? null,
    p_quantidade: c.quantidade,
    p_valor_unit: c.valorUnit ?? null,
    p_unidade: c.unidade ?? null,
    p_catalog_item_id: c.catalogItemId ?? null,
    p_compra_linha_id: c.compraLinhaId ?? null,
  });
  if (error) throw new ErroDeEscrita(error.message || "Não foi possível lançar o custo.");
  return data as unknown as { ok: boolean; id: string; total: number; origem: string };
}

export async function removerCusto(custoId: string): Promise<void> {
  const { error } = await supabase.rpc("rpc_ops_remover_custo", { p_custo_id: custoId });
  if (error) throw new ErroDeEscrita(error.message || "Não foi possível apagar o custo.");
}

/** Previsto e gasto, emparelhados por item de catálogo. */
export interface ComparacaoPorItem {
  catalog_item_id: string | null;
  descricao: string;
  qt_prevista: number | null;
  previsto: number | null;
  qt_real: number | null;
  real: number | null;
  situacao: "ambos" | "nao_orcamentado" | "nao_gasto";
  desvio: number;
}

export async function comparacaoPorItem(ordemId: string): Promise<ComparacaoPorItem[]> {
  const { data, error } = await supabase
    .from("ops_v_custo_por_item")
    .select("catalog_item_id, descricao, qt_prevista, previsto, qt_real, real, situacao, desvio")
    .eq("ordem_id", ordemId);
  if (error) return [];
  const linhas = (data ?? []) as unknown as ComparacaoPorItem[];
  // O que mais derrapou primeiro. É o que se quer ver sem percorrer a lista.
  return linhas.sort((a, b) => Math.abs(Number(b.desvio)) - Math.abs(Number(a.desvio)));
}
