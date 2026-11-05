// Lixo (/trash): que permissão o servidor exige para RESTAURAR cada tipo. Confirmado na versão viva de
// restore_business_entity (05/11/2026): contratos reais pedem client_contracts.delete; encomendas de cliente
// (client_contracts.is_manual_order) pedem client_orders.delete na organização. Os outros tipos (pedidos, orçamentos,
// propostas; leads/clientes por restore_entity_facet) não estão aqui: o botão continua como estava.
export type TipoLixo = "clients" | "leads" | "deals" | "quotes" | "proposals" | "contracts" | "client_orders";

export const PERMISSAO_RESTAURAR: Partial<Record<TipoLixo, string>> = {
  contracts: "client_contracts.delete",
  client_orders: "client_orders.delete",
};

export function podeRestaurar(tipo: TipoLixo, hasPermission: (codigo: string) => boolean): boolean {
  const codigo = PERMISSAO_RESTAURAR[tipo];
  return !codigo || hasPermission(codigo);
}
