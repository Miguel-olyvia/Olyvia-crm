// Leitura das encomendas a fornecedor pelas vistas mascaradas (20270112850000 / 20270112853000).
//
// purchase_orders.total_value, purchase_order_items.unit_price / total_price / vat_amount e os totais antes/depois de
// purchase_order_item_cancellations só vêm preenchidos a quem tem products.view_cost na organização (NULL aos outros).
// As tabelas deixam de dar essas colunas a authenticated (20270112851000): um select("*") nelas dá 42501. Por isso
// todas as leituras com "*" ou com valores passam por estas vistas — mesmas colunas, mesma ordem, mesmos tipos, as
// linhas pelo RLS de quem lê. As escritas continuam pelas RPCs (rpc_create/rpc_update_purchase_order, ...).
// O PDF ao fornecedor lê os preços por rpc_po_documento_fornecedor (20270112852000).
import { supabase } from "@/integrations/supabase/client";

export const PO_VISTA_ENCOMENDAS = "po_v_purchase_orders";
export const PO_VISTA_LINHAS = "po_v_purchase_order_items";
export const PO_VISTA_ANULACOES = "po_v_purchase_order_item_cancellations";

type PoVista = typeof PO_VISTA_ENCOMENDAS | typeof PO_VISTA_LINHAS | typeof PO_VISTA_ANULACOES;

/** As vistas não estão nos tipos gerados: a forma das linhas é a das tabelas (o chamador faz o cast). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const poVista = (vista: PoVista): any => (supabase as any).from(vista);
