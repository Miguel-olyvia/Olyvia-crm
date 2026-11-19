// Supplier portal, English: catalogue page (SupplierPortalCatalog). Keys `sp.catalogo.*`.
// The item dialog and photos are in fornecedorEn.catalogoArtigo.ts (`sp.catalogo.artigo.*`, `sp.catalogo.foto.*`...).
// Plurals (pick the key with n === 1). Numbers always keep the pt-PT format.
export const fornecedorEnCatalogo: Record<string, string> = {
  // Page
  "sp.catalogo.titulo": "Catalogue",
  "sp.catalogo.aCarregar": "Loading…",

  // Count by type and status: {n} item(s) / product(s) / service(s), "active" when inactive ones are hidden
  "sp.catalogo.contagem.artigo.ativos.um": "{n} active item",
  "sp.catalogo.contagem.artigo.ativos.varios": "{n} active items",
  "sp.catalogo.contagem.artigo.todos.um": "{n} item",
  "sp.catalogo.contagem.artigo.todos.varios": "{n} items",
  "sp.catalogo.contagem.produto.ativos.um": "{n} active product",
  "sp.catalogo.contagem.produto.ativos.varios": "{n} active products",
  "sp.catalogo.contagem.produto.todos.um": "{n} product",
  "sp.catalogo.contagem.produto.todos.varios": "{n} products",
  "sp.catalogo.contagem.servico.ativos.um": "{n} active service",
  "sp.catalogo.contagem.servico.ativos.varios": "{n} active services",
  "sp.catalogo.contagem.servico.todos.um": "{n} service",
  "sp.catalogo.contagem.servico.todos.varios": "{n} services",

  // Header buttons
  "sp.catalogo.botao.modelo": "Download template",
  "sp.catalogo.botao.exportar": "Export",
  "sp.catalogo.botao.aExportar": "Exporting…",
  "sp.catalogo.botao.importar": "Import",
  "sp.catalogo.botao.importarExcel": "Import Excel/CSV",
  "sp.catalogo.botao.novoArtigo": "New item",
  "sp.catalogo.botao.tentarNovamente": "Try again",

  // View-only mode, search and filters
  "sp.catalogo.consulta": "You are in view-only mode. Only the account's main user can create, edit, import or deactivate items.",
  "sp.catalogo.pesquisa.placeholder": "Search by reference, name, barcode or brand",
  "sp.catalogo.pesquisa.aria": "Search items",
  "sp.catalogo.filtro.aria": "Filter by type",
  "sp.catalogo.filtro.todos": "All",
  "sp.catalogo.filtro.produtos": "Products",
  "sp.catalogo.filtro.servicos": "Services",
  "sp.catalogo.mostrarInativos": "Show inactive",

  // Bulk and row actions
  "sp.catalogo.lote.aria": "Bulk actions",
  "sp.catalogo.lote.selecionados.um": "{n} selected",
  "sp.catalogo.lote.selecionados.varios": "{n} selected",
  "sp.catalogo.acao.ativar": "Activate",
  "sp.catalogo.acao.desativar": "Deactivate",
  "sp.catalogo.acao.editar": "Edit",
  "sp.catalogo.acao.limparSelecao": "Clear selection",
  "sp.catalogo.acao.ativarRef": "Activate {ref}",
  "sp.catalogo.acao.desativarRef": "Deactivate {ref}",
  "sp.catalogo.acao.editarRef": "Edit {ref}",
  "sp.catalogo.acao.selecionarRef": "Select {ref}",
  "sp.catalogo.acao.selecionarTodos": "Select all items on this page",

  // Empty list
  "sp.catalogo.vazio.pesquisa": "No items match your search.",
  "sp.catalogo.vazio.semArtigos": "You don't have any items in the catalogue yet.",
  "sp.catalogo.vazio.semProdutos": "You don't have any products in the catalogue yet.",
  "sp.catalogo.vazio.semServicos": "You don't have any services in the catalogue yet.",

  // Table and cards
  "sp.catalogo.coluna.ref": "Ref.",
  "sp.catalogo.coluna.tipo": "Type",
  "sp.catalogo.coluna.sku": "SKU",
  "sp.catalogo.coluna.foto": "Photo",
  "sp.catalogo.coluna.nome": "Name",
  "sp.catalogo.coluna.codBarras": "Barcode",
  "sp.catalogo.coluna.unidade": "Unit",
  "sp.catalogo.coluna.preco": "Price",
  "sp.catalogo.coluna.minimo": "Minimum",
  "sp.catalogo.coluna.prazo": "Lead time",
  "sp.catalogo.coluna.estado": "Status",
  "sp.catalogo.coluna.acoes": "Actions",
  "sp.catalogo.tipo.produto": "Product",
  "sp.catalogo.tipo.servico": "Service",
  "sp.catalogo.estado.ativo": "Active",
  "sp.catalogo.estado.inativo": "Inactive",
  "sp.catalogo.semCategoria": "No category",
  "sp.catalogo.skuRef": "SKU {sku}",
  "sp.catalogo.zona": "Area: {zona}",
  "sp.catalogo.zonaAtuacao": "Service area",
  "sp.catalogo.mobilizacao": "Mobilisation",
  "sp.catalogo.prazoMobilizacao": "Mobilisation lead time",
  "sp.catalogo.prazoMobilizacaoCurto": "{n} d mob.",
  "sp.catalogo.porEmbalagem": "{n}/pack",
  "sp.catalogo.prazoCurto": "{n} d",
  "sp.catalogo.prazoLongo.um": "{n} day",
  "sp.catalogo.prazoLongo.varios": "{n} days",

  // Pagination
  "sp.catalogo.paginacao.aria": "Pagination",
  "sp.catalogo.paginacao.intervalo": "{de}–{ate} of {total}",
  "sp.catalogo.paginacao.anterior": "Previous page",
  "sp.catalogo.paginacao.seguinte": "Next page",

  // Notices (toasts)
  "sp.catalogo.aviso.ativados": "Items activated",
  "sp.catalogo.aviso.desativados": "Items deactivated",
  "sp.catalogo.aviso.ativadosN.um": "{n} item activated.",
  "sp.catalogo.aviso.ativadosN.varios": "{n} items activated.",
  "sp.catalogo.aviso.desativadosN.um": "{n} item deactivated.",
  "sp.catalogo.aviso.desativadosN.varios": "{n} items deactivated.",
  "sp.catalogo.aviso.erroAtivar": "Could not activate",
  "sp.catalogo.aviso.erroDesativar": "Could not deactivate",
  "sp.catalogo.aviso.vazio": "Catalogue is empty",
  "sp.catalogo.aviso.vazioDescricao": "You don't have any items to export yet.",
  "sp.catalogo.aviso.erroExportar": "Could not export",
  "sp.catalogo.aviso.criado": "Item created",
  "sp.catalogo.aviso.guardado": "Item saved",
};
