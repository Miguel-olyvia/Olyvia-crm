// Menu do Inventário (Hoje · Compras · Armazém) — nomes novos das entradas.
//
// Módulo de traduções próprio, no mesmo padrão de `today.ts`/`directSales.ts`:
// o merge é feito em `useTranslation.ts`. Apenas en/pt — o `t()` cai para `en`
// quando o idioma ativo não tem a chave. As chaves antigas (sidebar.stocks,
// sidebar.purchaseOrders, ...) ficam intactas em `index.ts`.
export const inventoryNavTranslations: Record<string, Record<string, string>> = {
  en: {
    'sidebar.inventoryToday': 'Today',
    'sidebar.inventoryPurchases': 'Purchasing',
    'sidebar.inventoryWarehouse': 'Warehouse',
    'sidebar.inventoryPurchaseOrders': 'Purchase orders',
    'sidebar.inventoryStocks': 'Stock on hand',
    'sidebar.stockMovements': 'Movements',
    'sidebar.inventoryClientOrders': 'Customer shipments',
    'sidebar.inventoryReceiving': 'Receiving',
    'sidebar.inventoryStockCounts': 'Counts',
    // Cabeçalhos dos ecrãs (o título reutiliza a chave do menu correspondente).
    'inventory.today.description': 'Everything in inventory that needs action, in flow order. The numbers reflect the current state and change as you act.',
    'inventory.stocks.description': 'Stock by product and warehouse. Free = organisation stock − customer order reservations (FIFO); orders on the way do not count.',
    'inventory.movements.description': 'Full ledger of every receipt, issue, transfer, adjustment, return and write-off.',
  },
  pt: {
    'sidebar.inventoryToday': 'Hoje',
    'sidebar.inventoryPurchases': 'Compras',
    'sidebar.inventoryWarehouse': 'Armazém',
    'sidebar.inventoryPurchaseOrders': 'Encomendas',
    'sidebar.inventoryStocks': 'Existências',
    'sidebar.stockMovements': 'Movimentos',
    'sidebar.inventoryClientOrders': 'Saídas para clientes',
    'sidebar.inventoryReceiving': 'Receção',
    'sidebar.inventoryStockCounts': 'Contagens',
    // Cabeçalhos dos ecrãs (o título reutiliza a chave do menu correspondente).
    'inventory.today.description': 'Tudo o que precisa de ação no inventário, por ordem do fluxo. Os números vêm do estado atual e mudam quando age.',
    'inventory.stocks.description': 'Stock por produto e armazém. Livre = stock da organização − reservas das Encomendas Clientes (FIFO); encomendas a caminho não contam.',
    'inventory.movements.description': 'Livro completo de cada entrada, saída, transferência, ajuste, devolução e quebra.',
  },
};
