// 29/10: os dados da ficha do produto (FichaProduto.tsx), no Catálogo e custos real: a margem, os fornecedores ligados
// (cat_produto_fornecedores), o preferido (cat_definir_fornecedor_preferido) e a ligação a um artigo do catálogo do fornecedor
// no portal. A ligação usa as mesmas RPCs e os mesmos argumentos que Compras (SupplierPortalCatalogSection.tsx: rpc_supplier_catalog_list
// e rpc_catalog_link, com a unidade resolvida por fetchFreeSupplierRows). Quem decide é a base; isto só não oferece o que ela recusa.
import type { CatalogLinkResult, CrmCatalogItem, CrmCatalogList, FreeSupplierRow, RpcError } from "@/components/supplier-portal-crm/types";
import { precoProduto } from "./fichaServico";
import type { Produto } from "./v2/catalogoModelo";

// o cliente e as funções de Compras carregam-se só quando a ficha os usa (o CatalogoV1 também corre no protótipo e nos testes sem base)
// (uma só promessa: dois imports ao mesmo tempo davam, nos testes, o módulo verdadeiro em vez do simulado)
let pCliente: Promise<typeof import("@/integrations/supabase/client")["supabase"]> | null = null;
const cliente = () => (pCliente ??= import("@/integrations/supabase/client").then((m) => m.supabase, (e) => { pCliente = null; throw e; }));
const compras = () => import("@/components/supplier-portal-crm/types");

/** O que a página real dá à ficha: a organização, se pode mexer (products.edit, como o can_link de Compras) e como relê o Catálogo. */
export interface FichaProdutoReal {
  org: string; podeEditar: boolean;
  /** products.manage_prices: o preferido muda o custo do produto (cat_definir_fornecedor_preferido exige-o). Sem ela a estrela só se vê. */
  podeMudarPrecos: boolean;
  /** inventory.edit: marcar armazéns em lote no Catálogo (na ficha manda o pode_editar de cat_produto_stock). */
  podeStock?: boolean;
  recarregar: () => Promise<void>;
}

/** Uma linha de cat_produto_fornecedores (as chaves são as da base). */
export interface FornecedorLigado {
  item_supplier_id: string; supplier_id: string; supplier_name: string; supplier_sku: string | null;
  purchase_price: number | null; currency: string | null; lead_time_days: number | null; moq: number | null;
  is_preferred: boolean; is_active: boolean; preco_data: string | null; catalog_item_id: string | null;
  catalogo: null | { supplier_ref: string; barcode: string | null; nome: string; base_price: number | null; units_per_pack: number | null; unidade: string | null };
}
export interface ResPreferido { ok: boolean; custo_aplicado: boolean; motivo: string | null }

export type Res<T> = { ok: true; v: T } | { ok: false; erro: string };

export const AINDA_NAO = "Ainda não disponível nesta base";

/** A função ainda não existe nesta base (PostgREST PGRST202, Postgres 42883): frase simpática; o resto, a mensagem da base. */
export function erroAmigavel(e: RpcError | null | undefined, omissao = "Não foi possível."): string {
  if (!e) return omissao;
  if (e.code === "PGRST202" || e.code === "42883" || /could not find the function|function .* does not exist/i.test(e.message ?? "")) return AINDA_NAO;
  return e.message || omissao;
}

export const eUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/** Preço de venda, margem sobre a venda e se o preço vem do PVP ou do custo + alvo. */
export function margemProduto(p: Produto, alvo: number): { venda: number; m: number; semPvp: boolean } {
  const venda = precoProduto(p, alvo);
  return { venda, m: venda > 0 ? (venda - p.custo) / venda : 0, semPvp: p.pvp == null };
}

/** "12,50 €" ou "12,50 USD". */
export function moeda(v: number | null | undefined, currency: string | null | undefined, eur: (x: number) => string): string {
  if (v == null) return "—";
  return `${eur(Number(v))} ${!currency || currency === "EUR" ? "€" : currency}`;
}

// as duas RPCs novas não estão nos tipos gerados
const rpcLivre = async (fn: string, args: Record<string, unknown>) => {
  const sb = await cliente();
  const { data, error } = await sb.rpc(fn as never, args as never);
  return { data: data as unknown, error: (error ?? null) as RpcError | null };
};

export async function lerFornecedoresProduto(productId: string): Promise<Res<FornecedorLigado[]>> {
  try {
    const { data, error } = await rpcLivre("cat_produto_fornecedores", { p_product_id: productId });
    if (error) return { ok: false, erro: erroAmigavel(error, "Não foi possível ler os fornecedores.") };
    return { ok: true, v: Array.isArray(data) ? (data as FornecedorLigado[]) : [] };
  } catch (e) {
    return { ok: false, erro: (e as Error).message || "Não foi possível ler os fornecedores." };
  }
}

export async function definirPreferido(itemSupplierId: string): Promise<Res<ResPreferido>> {
  try {
    const { data, error } = await rpcLivre("cat_definir_fornecedor_preferido", { p_item_supplier_id: itemSupplierId });
    if (error || !data) return { ok: false, erro: erroAmigavel(error, "Não foi possível mudar o preferido.") };
    return { ok: true, v: data as ResPreferido };
  } catch (e) {
    return { ok: false, erro: (e as Error).message || "Não foi possível mudar o preferido." };
  }
}

/** 29/10: o PVP do produto (null = limpar: volta a custo + alvo). Só o PVP: o custo vem do fornecedor e não passa por aqui
 *  (nem pelo cat_guardar_produto do Catálogo, que grava também o custo). */
export async function definirPvp(productId: string, pvp: number | null): Promise<Res<{ ok: boolean; pvp: number | null }>> {
  try {
    const { data, error } = await rpcLivre("cat_definir_pvp", { p_product_id: productId, p_pvp: pvp });
    if (error || !data) return { ok: false, erro: erroAmigavel(error, "Não foi possível gravar o PVP.") };
    return { ok: true, v: data as { ok: boolean; pvp: number | null } };
  } catch (e) {
    return { ok: false, erro: (e as Error).message || "Não foi possível gravar o PVP." };
  }
}

/** "12,5" ou "12.5" → 12.5; vazio → null; o resto → NaN. */
export function lerNumero(t: string): number | null {
  const s = t.trim().replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/** Os fornecedores da organização (como ItemSuppliersTable.tsx, em Compras). */
export async function lerFornecedoresOrg(org: string): Promise<Res<{ id: string; name: string }[]>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await ((await cliente()) as any).from("suppliers").select("id, name").eq("organization_id", org).is("deleted_at", null).order("name");
  if (error) return { ok: false, erro: (error as RpcError).message || "Não foi possível ler os fornecedores." };
  return { ok: true, v: (data ?? []) as { id: string; name: string }[] };
}

/** O catálogo do fornecedor no portal, com pesquisa (a mesma chamada de Compras, filtro "todos"). */
export async function procurarArtigos(supplierId: string, q: string): Promise<Res<CrmCatalogList>> {
  const { callRpc } = await compras();
  const { data, error } = await callRpc<CrmCatalogList>("rpc_supplier_catalog_list", {
    p_supplier_id: supplierId, p_filter: "all", p_search: q.trim() || null, p_limit: 20, p_offset: 0, p_include_inactive: false,
  });
  if (error || !data) return { ok: false, erro: error?.message || "Não foi possível carregar o catálogo do fornecedor." };
  return { ok: true, v: data };
}

/** A unidade da linha item_suppliers a reaproveitar (como linkOne em Compras): nenhuma → null; uma → a dela; várias → escolher. */
export async function unidadeDaLigacao(productId: string, supplierId: string): Promise<Res<{ uomId: string | null } | { escolher: FreeSupplierRow[] }>> {
  const { fetchFreeSupplierRows } = await compras();
  const { rows, error } = await fetchFreeSupplierRows(productId, supplierId);
  if (error) return { ok: false, erro: error };
  if (rows.length > 1) return { ok: true, v: { escolher: rows } };
  return { ok: true, v: { uomId: rows[0]?.uom_id ?? null } };
}

export type ResLigar = { ok: true; r: CatalogLinkResult; frase: string } | { ok: false; erro: string; semPermPreco: boolean };

/** rpc_catalog_link com os argumentos de Compras (SupplierPortalCatalogSection.tsx, linkOne). */
export async function ligarArtigo(o: { supplierId: string; item: CrmCatalogItem; productId: string; uomId: string | null; aplicarPreco: boolean }): Promise<ResLigar> {
  const { callRpc, describeLinkPriceOutcome, isNoPricePermission } = await compras();
  const { data, error } = await callRpc<CatalogLinkResult>("rpc_catalog_link", {
    p_supplier_id: o.supplierId,
    p_catalog_item_id: o.item.id,
    p_product_id: o.productId,
    p_uom_id: o.uomId,
    p_apply_catalog_price: o.aplicarPreco,
  });
  if (error || !data) return { ok: false, erro: error?.message || "Não foi possível ligar o artigo.", semPermPreco: isNoPricePermission(error) };
  const frase = [
    data.already_linked ? `O artigo ${o.item.supplier_ref} já estava ligado.` : `Artigo ${o.item.supplier_ref} ligado${data.created ? " (nova associação ao fornecedor)" : ""}.`,
    describeLinkPriceOutcome(data, o.item.currency),
    ...(data.warnings ?? []),
  ].filter(Boolean).join(" ");
  return { ok: true, r: data, frase };
}

/* ------------------------------------------------------------------ stock e armazéns (29/10) */
// Os armazéns de cada produto/consumível dizem onde está ou pode estar (o stock gere-se sempre; gere_stock na resposta ignora-se).
// cat_produto_stock lê; cat_definir_armazem_produto(s) gravam (inventory.edit). A base explica em português porque não desmarca.

export interface ArmazemProduto {
  warehouse_id: string; nome: string; codigo: string | null; ativo: boolean; quantidade: number | null; reservado: number | null;
  minimo: number | null; maximo: number | null; ponto_encomenda: number | null; localizacao: string | null;
}
export interface StockProduto { gere_stock: boolean; pode_editar: boolean; armazens: ArmazemProduto[] }
/** Um armazém da organização (tabela warehouses, pela RLS): serves_customers é o "Serve clientes" do Inventário. */
export interface ArmazemOrg { id: string; name: string; code: string | null; is_active: boolean; serves_customers: boolean }
export interface ResArmazens { ok: boolean; alterados: number; gere_stock_ligados: number; gere_stock_desligados: number; recusados: { product_id: string; nome: string; motivo: string }[] }

export async function lerStockProduto(productId: string): Promise<Res<StockProduto>> {
  try {
    const { data, error } = await rpcLivre("cat_produto_stock", { p_product_id: productId });
    if (error || !data) return { ok: false, erro: erroAmigavel(error, "Não foi possível ler os armazéns.") };
    const d = data as StockProduto;
    return { ok: true, v: { gere_stock: !!d.gere_stock, pode_editar: !!d.pode_editar, armazens: Array.isArray(d.armazens) ? d.armazens : [] } };
  } catch (e) {
    return { ok: false, erro: (e as Error).message || "Não foi possível ler os armazéns." };
  }
}

export async function definirArmazemProduto(o: {
  productId: string; warehouseId: string; ativo: boolean; minimo: number | null; maximo: number | null; pontoEncomenda: number | null; localizacao: string | null;
}): Promise<Res<{ ok: boolean; motivo: string | null; gere_stock: boolean }>> {
  try {
    const { data, error } = await rpcLivre("cat_definir_armazem_produto", {
      p_product_id: o.productId, p_warehouse_id: o.warehouseId, p_ativo: o.ativo,
      p_minimo: o.minimo, p_maximo: o.maximo, p_ponto_encomenda: o.pontoEncomenda, p_localizacao: o.localizacao,
    });
    if (error || !data) return { ok: false, erro: erroAmigavel(error, "Não foi possível gravar o armazém.") };
    return { ok: true, v: data as { ok: boolean; motivo: string | null; gere_stock: boolean } };
  } catch (e) {
    return { ok: false, erro: (e as Error).message || "Não foi possível gravar o armazém." };
  }
}

export async function definirArmazemProdutos(productIds: string[], warehouseId: string, ativo: boolean): Promise<Res<ResArmazens>> {
  try {
    const { data, error } = await rpcLivre("cat_definir_armazem_produtos", { p_product_ids: productIds, p_warehouse_id: warehouseId, p_ativo: ativo });
    if (error || !data) return { ok: false, erro: erroAmigavel(error, "Não foi possível marcar os armazéns.") };
    const d = data as ResArmazens;
    return { ok: true, v: { ...d, recusados: Array.isArray(d.recusados) ? d.recusados : [] } };
  } catch (e) {
    return { ok: false, erro: (e as Error).message || "Não foi possível marcar os armazéns." };
  }
}

/** Os armazéns da organização (como a Frota, components/frota/dados/consultas.ts). */
export async function lerArmazensOrg(org: string): Promise<Res<ArmazemOrg[]>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await ((await cliente()) as any).from("warehouses").select("id, name, code, is_active, serves_customers").eq("organization_id", org).is("deleted_at", null).order("name");
    if (error) return { ok: false, erro: (error as RpcError).message || "Não foi possível ler os armazéns." };
    return { ok: true, v: (data ?? []) as ArmazemOrg[] };
  } catch (e) {
    return { ok: false, erro: (e as Error).message || "Não foi possível ler os armazéns." };
  }
}

/** Inteiro ≥ 0, ou null (vazio). NaN = inválido. */
export function lerInteiro(t: string): number | null {
  const s = t.trim();
  if (!s) return null;
  return /^\d+$/.test(s) ? Number(s) : NaN;
}
