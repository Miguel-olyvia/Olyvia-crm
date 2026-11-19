// Supplier portal, home page (sp.inicio.*).
// The plural for orders to confirm uses sp.encomendas.porConfirmar.um/varios (in fornecedorEn.ts).
export const fornecedorEnInicio: Record<string, string> = {
  "sp.inicio.ola": "Hello, {nome}",
  "sp.inicio.boasVindas": "Welcome",
  "sp.inicio.introAntes": "Supplier Portal for ",
  "sp.inicio.introDepois":
    ". Here you receive and confirm orders and keep your catalogue up to date for the companies you work with.",

  "sp.inicio.encomendas.titulo": "Orders",
  "sp.inicio.encomendas.aContar": "Counting orders…",
  "sp.inicio.encomendas.erroContar": "The orders could not be counted.",
  "sp.inicio.encomendas.nenhumaPorConfirmar": "You have no orders to confirm.",
  "sp.inicio.encomendas.verPrazos": "View deadlines at risk",
  "sp.inicio.encomendas.verPorConfirmar": "View orders to confirm",
  "sp.inicio.encomendas.ver": "View orders",

  "sp.inicio.catalogo.titulo": "Catalogue",
  "sp.inicio.catalogo.aContar": "Counting items…",
  "sp.inicio.catalogo.erroContar": "The items could not be counted.",
  "sp.inicio.catalogo.ativos.um": "{n} active item",
  "sp.inicio.catalogo.ativos.varios": "{n} active items",
  "sp.inicio.catalogo.soConsulta": "You can view the catalogue. Only the account's main user can change it.",
  "sp.inicio.catalogo.gerir": "Manage catalogue",
  "sp.inicio.catalogo.ver": "View catalogue",

  "sp.inicio.empresas.titulo": "Companies with access",
  "sp.inicio.empresas.erro": "The list of companies could not be loaded. Reload the page.",
  "sp.inicio.empresas.nenhuma": "No company with active access.",
  "sp.inicio.empresas.desde": "Since {data}",
};
