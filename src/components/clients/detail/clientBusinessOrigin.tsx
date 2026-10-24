import { Badge } from "@/components/ui/badge";

// "Negócios" do módulo Clientes = linhas de client_contracts, que misturam
// contratos reais com contratos sintéticos (Encomendas de Cliente manuais e
// Vendas Diretas). Mesma regra de ClientOrders.tsx renderOrigin:
// venda direta (embed com linhas não apagadas) → VD-…; senão is_manual_order
// → Encomenda Cliente (order_number); senão → Contrato (contract_number).
// order_number também existe nos contratos reais, por isso não serve para
// distinguir. O embed de direct_sales está sujeito a RLS (direct_sales.view):
// sem permissão vem vazio e o negócio cai em "Encomenda Cliente".

export type ClientBusinessOriginType = "contract" | "direct_sale" | "manual_order";

export const CLIENT_BUSINESS_SELECT =
  "is_manual_order, order_number, contract_number, direct_sales!direct_sales_client_contract_id_fkey(sale_number, deleted_at)";

interface RawBusinessFields {
  is_manual_order?: boolean | null;
  order_number?: string | null;
  contract_number?: string | null;
  direct_sales?: { sale_number: string | null; deleted_at: string | null }[] | null;
}

export interface ClientBusinessOrigin {
  origin_type: ClientBusinessOriginType;
  display_number: string;
}

export function deriveClientBusinessOrigin(row: RawBusinessFields): ClientBusinessOrigin {
  const sale = (row.direct_sales || []).find(s => !s.deleted_at);
  if (sale) {
    return { origin_type: "direct_sale", display_number: sale.sale_number || row.contract_number || "" };
  }
  if (row.is_manual_order) {
    return { origin_type: "manual_order", display_number: row.order_number || row.contract_number || "" };
  }
  return { origin_type: "contract", display_number: row.contract_number || "" };
}

export const CLIENT_BUSINESS_TYPE_LABEL: Record<ClientBusinessOriginType, string> = {
  contract: "Contrato",
  direct_sale: "Venda Direta",
  manual_order: "Encomenda Cliente",
};

const TYPE_CLASS: Record<ClientBusinessOriginType, string> = {
  contract: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  direct_sale: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  manual_order: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
};

export function ClientBusinessTypeBadge({ type }: { type: ClientBusinessOriginType }) {
  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-normal border-transparent ${TYPE_CLASS[type]}`}>
      {CLIENT_BUSINESS_TYPE_LABEL[type]}
    </Badge>
  );
}
