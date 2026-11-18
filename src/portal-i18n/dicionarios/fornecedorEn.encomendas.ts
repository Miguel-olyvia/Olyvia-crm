// Supplier portal, orders list (sp.encomendas.*) and statuses (sp.estado.*).
// The database codes (sent, viewed, confirmed, cancelled...) do not change: they are only mapped to these keys.
export const fornecedorEnEncomendas: Record<string, string> = {
  "sp.estado.nova": "New",
  "sp.estado.vista": "Viewed",
  "sp.estado.confirmada": "Confirmed",
  "sp.estado.cancelada": "Cancelled",
  "sp.estado.recebida": "Received",
  "sp.estado.parcialmenteRecebida": "Partially received",

  "sp.encomendas.titulo": "Orders",
  "sp.encomendas.subtitulo":
    "Purchase orders that companies have sent you through the portal. Open an order to see the details, download the PDF and confirm it.",
  "sp.encomendas.atualizar": "Refresh",
  "sp.encomendas.estadoDasEncomendas": "Order status",
  "sp.encomendas.filtro.to_confirm": "To confirm",
  "sp.encomendas.filtro.confirmed": "Confirmed",
  "sp.encomendas.filtro.open": "In progress",
  "sp.encomendas.filtro.received": "Received",
  "sp.encomendas.filtro.cancelled": "Cancelled",
  "sp.encomendas.filtro.all": "All",

  "sp.encomendas.pesquisar": "Search",
  "sp.encomendas.pesquisarPlaceholder": "Order number or company",
  "sp.encomendas.empresa": "Company",
  "sp.encomendas.todasEmpresas": "All companies",
  "sp.encomendas.aCarregar": "Loading orders…",

  "sp.encomendas.vazio.comFiltros": "No orders match these filters.",
  "sp.encomendas.vazio.porConfirmar": "You have no orders to confirm.",
  "sp.encomendas.vazio.sem": "No orders.",
  "sp.encomendas.vazio.verTodas": "View all orders",

  "sp.encomendas.linhasN": "{n} line(s)",
  "sp.encomendas.entregaPrevistaDia": "Promised delivery: {data}",
  "sp.encomendas.coluna.encomenda": "Order",
  "sp.encomendas.coluna.empresa": "Company",
  "sp.encomendas.coluna.data": "Date",
  "sp.encomendas.coluna.entregaPedida": "Requested delivery",
  "sp.encomendas.coluna.entregaPrevista": "Promised delivery",
  "sp.encomendas.coluna.linhas": "Lines",
  "sp.encomendas.coluna.total": "Total",
  "sp.encomendas.coluna.estado": "Status",

  "sp.encomendas.paginacao": "{de}–{ate} of {total}",
  "sp.encomendas.paginaAnterior": "Previous page",
  "sp.encomendas.paginaSeguinte": "Next page",
};
