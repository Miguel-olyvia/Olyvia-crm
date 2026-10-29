// 29/10/2026 (migration 20270101240000): a contagem INICIAL deixou de semear o catálogo inteiro — só entram os produtos
// marcados neste armazém (linha de stocks não apagada, mesmo com quantidade 0; marca-se em Catálogo e custos, um a um ou em massa).
// Esta pré-visualização tem de espelhar EXATAMENTE o ramo inicial de rpc_create_inventory_count:
//   stocks s (warehouse_id = armazém, organization_id = org, deleted_at IS NULL)
//   JOIN products p (is_deleted = false, deleted_at IS NULL, status <> 'draft', categoria com descendentes em category_id OU subcategory_id)
//   JOIN product_organizations po (organization_id = org).
// Não cria linhas de stocks (stock_rows_created fica 0).

/** O mínimo do cliente Supabase que a contagem usa (permite testar a consulta). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cliente = { from: (t: string) => any };

export const CATALOGO_CUSTOS_PATH = "/catalogo-custos";

/** Nº de linhas que a contagem inicial vai criar no armazém (produtos marcados que passam os filtros). */
export async function countInitialLines(
  client: Cliente,
  organizationId: string,
  warehouseId: string,
  categoryIds: string[] | null,
): Promise<number> {
  let query = client
    .from("stocks")
    .select("id, products!inner(id, product_organizations!inner(organization_id))", { count: "exact", head: true })
    .eq("warehouse_id", warehouseId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .eq("products.is_deleted", false)
    .is("products.deleted_at", null)
    .neq("products.status", "draft")
    .eq("products.product_organizations.organization_id", organizationId);
  if (categoryIds && categoryIds.length > 0) {
    const ids = categoryIds.join(",");
    query = query.or(`category_id.in.(${ids}),subcategory_id.in.(${ids})`, { referencedTable: "products" });
  }
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}
