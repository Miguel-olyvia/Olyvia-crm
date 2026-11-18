// Supplier portal, English: catalogue (SupplierPortalCatalog page and item dialog). Keys `sp.catalogo.*`.
// Plurals (use with tn): count, selected, lead time and the activate/deactivate notices.
export const fornecedorEnCatalogo: Record<string, string> = {
  // Page
  "sp.catalogo.titulo": "Catalogue",
  "sp.catalogo.aCarregar": "Loading…",
  "sp.catalogo.contagem.ativos.um": "{n} active item",
  "sp.catalogo.contagem.ativos.varios": "{n} active items",
  "sp.catalogo.contagem.todos.um": "{n} item",
  "sp.catalogo.contagem.todos.varios": "{n} items",

  // Header buttons
  "sp.catalogo.botao.modelo": "Download template",
  "sp.catalogo.botao.exportar": "Export",
  "sp.catalogo.botao.aExportar": "Exporting…",
  "sp.catalogo.botao.importar": "Import",
  "sp.catalogo.botao.importarExcel": "Import Excel/CSV",
  "sp.catalogo.botao.novoArtigo": "New item",
  "sp.catalogo.botao.tentarNovamente": "Try again",

  // View-only mode and search
  "sp.catalogo.consulta": "You are in view-only mode. Only the account's main user can create, edit, import or deactivate items.",
  "sp.catalogo.pesquisa.placeholder": "Search by reference, name, barcode or brand",
  "sp.catalogo.pesquisa.aria": "Search items",
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

  // Table and cards
  "sp.catalogo.coluna.ref": "Ref.",
  "sp.catalogo.coluna.nome": "Name",
  "sp.catalogo.coluna.codBarras": "Barcode",
  "sp.catalogo.coluna.unidade": "Unit",
  "sp.catalogo.coluna.preco": "Price",
  "sp.catalogo.coluna.minimo": "Minimum",
  "sp.catalogo.coluna.prazo": "Lead time",
  "sp.catalogo.coluna.estado": "Status",
  "sp.catalogo.coluna.acoes": "Actions",
  "sp.catalogo.estado.ativo": "Active",
  "sp.catalogo.estado.inativo": "Inactive",
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

  // Item dialog
  "sp.catalogo.artigo.tituloNovo": "New item",
  "sp.catalogo.artigo.tituloEditar": "Edit item",
  "sp.catalogo.artigo.descricaoNovo": "Fill in at least the reference and the name.",
  "sp.catalogo.artigo.descricaoEditar": "Change the item details. Empty fields are left without a value.",
  "sp.catalogo.artigo.referencia": "Reference *",
  "sp.catalogo.artigo.codigoBarras": "Barcode",
  "sp.catalogo.artigo.codigoBarrasDica": "8 to 14 digits",
  "sp.catalogo.artigo.nome": "Name *",
  "sp.catalogo.artigo.descricao": "Description",
  "sp.catalogo.artigo.marca": "Brand",
  "sp.catalogo.artigo.unidade": "Unit",
  "sp.catalogo.artigo.unidadeDica": "e.g. pc, box, m, kg",
  "sp.catalogo.artigo.unidadesEmbalagem": "Units per pack",
  "sp.catalogo.artigo.preco": "Price (excl. VAT)",
  "sp.catalogo.artigo.moeda": "Currency",
  "sp.catalogo.artigo.minimo": "Minimum quantity",
  "sp.catalogo.artigo.prazo": "Lead time (days)",
  "sp.catalogo.artigo.ativo": "Item active",
  "sp.catalogo.artigo.obrigatorios": "Reference and name are required.",
  "sp.catalogo.artigo.cancelar": "Cancel",
  "sp.catalogo.artigo.aGuardar": "Saving...",
  "sp.catalogo.artigo.guardar": "Save changes",
  "sp.catalogo.artigo.criar": "Create item",
};
