// Custos das linhas de orçamento (quote_lines) — 20270109100000/20270109110000.
//
// As colunas de custo de quote_lines (custo do material e da mão de obra, markup, cost_price e os custos do Negócio)
// já não se leem da tabela: o SELECT delas foi revogado a `authenticated`. Quem lê linhas escolhe as colunas sem custo
// (QUOTE_LINE_COLUNAS_SEM_CUSTO) e, quando precisa do custo, pede-o a rpc_quote_lines_custos, que só o devolve a quem
// tem quotes.view_costs ou quotes.manage na organização do orçamento (ou o Papel no Negócio, ou admin de sistema).
//
// Quem edita SEM ver custos continua a editar: a RPC devolve a todos o preço unitário que o ecrã calcularia a partir
// do custo, antes da intermediação (preco_base_un = custo × (1 + markup)). O construtor guarda na linha um custo «de
// fachada» igual a esse valor, sem markup (custosSinteticos), que dá exatamente o mesmo preço e marca-a (CustosOcultosMarca). Ao gravar, uma linha que continua como foi recebida vai com
// `custos_ocultos: true` e o id, e o rpc_save_quote grava o custo VERDADEIRO da linha guardada, não o de fachada.
import { supabase } from "@/integrations/supabase/client";

/** As colunas de custo de quote_lines (sem SELECT para `authenticated`). */
export const QUOTE_LINE_COLUNAS_CUSTO = [
  "cost_price",
  "custo_material_unit",
  "custo_mao_obra_unit",
  "margem_percent",
  "custo_un_exato",
  "custo_un_origem",
  "mao_obra_congelada",
] as const;

/** As colunas de quote_lines que o navegador pode ler (as do tipo gerado, sem as de custo). */
export const QUOTE_LINE_COLUNAS_SEM_CUSTO =
  "id, quote_id, catalog_item_id, categoria, descricao_snapshot, qt, iva_percent, int_percent, total_sem_iva, total_com_iva, total_com_desconto, ordem, created_at, product_id, service_id, selected_attributes, discount_percent, section_name, item_description, unidade, bundle_id, item_supplier_id, retail_price_unit, visible_to_client, source_deal_need_item_id, source_deal_need_id, uom_id, units_per_uom";

export interface QuoteLineCustos {
  id: string;
  quote_id: string;
  pode_ver_custos: boolean;
  cost_price: number | null;
  custo_material_unit: number | null;
  custo_mao_obra_unit: number | null;
  margem_percent: number | null;
  custo_un_exato: number | null;
  custo_un_origem: number | null;
  mao_obra_congelada: number | null;
  /** custo × (1 + markup/100), em float como getLineUnitPrice: o preço unitário antes da intermediação. */
  preco_base_un: number | null;
}

/** Máximo de orçamentos por pedido (a RPC recusa mais de 500). */
export const CUSTOS_LINHAS_LOTE = 200;

type Rpc = (nome: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
const rpc: Rpc = (nome, args) => (supabase as unknown as { rpc: Rpc }).rpc(nome, args);

const numOuNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Custos (e o preço calculado) de todas as linhas visíveis dos orçamentos pedidos, por id da linha. Lança o erro da base. */
export async function lerCustosDasLinhas(quoteIds: string[]): Promise<Map<string, QuoteLineCustos>> {
  const out = new Map<string, QuoteLineCustos>();
  const ids = [...new Set(quoteIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += CUSTOS_LINHAS_LOTE) {
    const { data, error } = await rpc("rpc_quote_lines_custos", { p_quote_ids: ids.slice(i, i + CUSTOS_LINHAS_LOTE) });
    if (error) throw error;
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      out.set(String(r.id), {
        id: String(r.id),
        quote_id: String(r.quote_id),
        pode_ver_custos: r.pode_ver_custos === true,
        cost_price: numOuNull(r.cost_price),
        custo_material_unit: numOuNull(r.custo_material_unit),
        custo_mao_obra_unit: numOuNull(r.custo_mao_obra_unit),
        margem_percent: numOuNull(r.margem_percent),
        custo_un_exato: numOuNull(r.custo_un_exato),
        custo_un_origem: numOuNull(r.custo_un_origem),
        mao_obra_congelada: numOuNull(r.mao_obra_congelada),
        preco_base_un: numOuNull(r.preco_base_un),
      });
    }
  }
  return out;
}

export interface CustosDaLinha {
  cost_price?: number | null;
  custo_material_unit?: number | null;
  custo_mao_obra_unit?: number | null;
  margem_percent?: number | null;
}

/**
 * Junta às linhas os custos de quem os pode ver. As linhas sem permissão (ou que a base não devolveu) ficam como
 * vieram, sem custo — os ecrãs tratam-nas como «sem dados de custo».
 */
export function juntarCustos<T extends { id: string }>(linhas: T[], custos: Map<string, QuoteLineCustos>): Array<T & CustosDaLinha> {
  return linhas.map((l) => {
    const c = custos.get(l.id);
    if (!c || !c.pode_ver_custos) return { ...l };
    return {
      ...l,
      cost_price: c.cost_price,
      custo_material_unit: c.custo_material_unit,
      custo_mao_obra_unit: c.custo_mao_obra_unit,
      margem_percent: c.margem_percent,
    };
  });
}

/** Lê os custos e junta-os (atalho para os ecrãs que só mostram). */
export async function lerLinhasComCustos<T extends { id: string; quote_id: string }>(linhas: T[]): Promise<Array<T & CustosDaLinha>> {
  if (linhas.length === 0) return [];
  const custos = await lerCustosDasLinhas(linhas.map((l) => l.quote_id));
  return juntarCustos(linhas, custos);
}

/** A marca de uma linha recebida sem custos: o custo de fachada e o artigo com que veio. */
export interface CustosOcultosMarca {
  custo_material_unit: number;
  product_id: string | null;
  service_id: string | null;
  bundle_id: string | null;
  item_supplier_id: string | null;
}

/**
 * Custo «de fachada» para uma linha que o ecrã não pode ver: o material é o preço antes da intermediação
 * (preco_base_un), sem mão de obra, sem markup e sem cost_price. getLineUnitPrice faz custo × (1 + markup) × (1 + int):
 * com markup 0 dá exatamente o mesmo número que o custo verdadeiro, também se a intermediação da linha mudar.
 */
export function custosSinteticos(precoBaseUn: number | null): {
  custo_material_unit: number;
  custo_mao_obra_unit: number;
  margem_percent: number;
  cost_price: number;
} {
  return {
    custo_material_unit: Number(precoBaseUn) || 0,
    custo_mao_obra_unit: 0,
    margem_percent: 0,
    cost_price: 0,
  };
}

const idOuNull = (v: string | null | undefined): string | null => (v ? v : null);

export function marcaCustosOcultos(linha: {
  custo_material_unit: number;
  product_id?: string | null;
  service_id?: string | null;
  bundle_id?: string | null;
  item_supplier_id?: string | null;
}): CustosOcultosMarca {
  return {
    custo_material_unit: linha.custo_material_unit,
    product_id: idOuNull(linha.product_id),
    service_id: idOuNull(linha.service_id),
    bundle_id: idOuNull(linha.bundle_id),
    item_supplier_id: idOuNull(linha.item_supplier_id),
  };
}

/**
 * A linha continua como foi recebida sem custos? (mesmo artigo e o mesmo custo de fachada; a margem não conta porque
 * mudar o preço à mão recalcula-a a partir do custo de fachada — o servidor recalcula-a a partir do verdadeiro.)
 * Se sim, vai para o rpc_save_quote com `custos_ocultos: true` e o servidor grava o custo verdadeiro.
 */
export function linhaComCustosOcultos(linha: {
  id?: string;
  custos_ocultos?: CustosOcultosMarca | null;
  custo_material_unit: number;
  custo_mao_obra_unit: number;
  cost_price?: number | null;
  product_id?: string | null;
  service_id?: string | null;
  bundle_id?: string | null;
  item_supplier_id?: string | null;
}): boolean {
  const m = linha.custos_ocultos;
  if (!m || !linha.id) return false;
  return (
    linha.custo_material_unit === m.custo_material_unit &&
    (Number(linha.custo_mao_obra_unit) || 0) === 0 &&
    (Number(linha.cost_price) || 0) === 0 &&
    idOuNull(linha.product_id) === m.product_id &&
    idOuNull(linha.service_id) === m.service_id &&
    idOuNull(linha.bundle_id) === m.bundle_id &&
    idOuNull(linha.item_supplier_id) === m.item_supplier_id
  );
}
