// Lixo (/trash): que permissão o servidor exige para RESTAURAR cada tipo - a mesma de apagar (restore_business_entity e
// restore_entity_facet, 20270109420000; contratos e encomendas já antes). O servidor verifica-a na organização do registo;
// aqui basta tê-la (a base decide de novo e um «não» vem como erro).
export type TipoLixo = "clients" | "leads" | "deals" | "quotes" | "proposals" | "contracts" | "client_orders";

export const PERMISSAO_RESTAURAR: Record<TipoLixo, string> = {
  clients: "clients.delete",
  leads: "leads.delete",
  deals: "deals.delete",
  quotes: "quotes.delete",
  proposals: "proposals.delete",
  contracts: "client_contracts.delete",
  client_orders: "client_orders.delete",
};

export function podeRestaurar(tipo: TipoLixo, hasPermission: (codigo: string) => boolean): boolean {
  return hasPermission(PERMISSAO_RESTAURAR[tipo]);
}
