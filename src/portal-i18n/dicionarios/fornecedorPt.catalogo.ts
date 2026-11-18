// Portal do fornecedor, português: catálogo (página SupplierPortalCatalog e diálogo de artigo). Chaves `sp.catalogo.*`.
// Plurais (usar com tn): contagem, selecionados, prazo e os avisos de ativar/desativar. O português mantém
// o «(s)» de sempre, por isso a variante «um» e a «varios» são iguais; o inglês distingue.
export const fornecedorPtCatalogo: Record<string, string> = {
  // Página
  "sp.catalogo.titulo": "Catálogo",
  "sp.catalogo.aCarregar": "A carregar…",
  "sp.catalogo.contagem.ativos.um": "{n} artigo(s) ativos",
  "sp.catalogo.contagem.ativos.varios": "{n} artigo(s) ativos",
  "sp.catalogo.contagem.todos.um": "{n} artigo(s)",
  "sp.catalogo.contagem.todos.varios": "{n} artigo(s)",

  // Botões do cabeçalho
  "sp.catalogo.botao.modelo": "Descarregar modelo",
  "sp.catalogo.botao.exportar": "Exportar",
  "sp.catalogo.botao.aExportar": "A exportar…",
  "sp.catalogo.botao.importar": "Importar",
  "sp.catalogo.botao.importarExcel": "Importar Excel/CSV",
  "sp.catalogo.botao.novoArtigo": "Novo artigo",
  "sp.catalogo.botao.tentarNovamente": "Tentar de novo",

  // Modo de consulta e pesquisa
  "sp.catalogo.consulta": "Está em modo de consulta. Só o utilizador principal da conta pode criar, alterar, importar ou desativar artigos.",
  "sp.catalogo.pesquisa.placeholder": "Pesquisar por referência, nome, código de barras ou marca",
  "sp.catalogo.pesquisa.aria": "Pesquisar artigos",
  "sp.catalogo.mostrarInativos": "Mostrar inativos",

  // Ações em lote e por linha
  "sp.catalogo.lote.aria": "Ações em lote",
  "sp.catalogo.lote.selecionados.um": "{n} selecionado(s)",
  "sp.catalogo.lote.selecionados.varios": "{n} selecionado(s)",
  "sp.catalogo.acao.ativar": "Ativar",
  "sp.catalogo.acao.desativar": "Desativar",
  "sp.catalogo.acao.editar": "Editar",
  "sp.catalogo.acao.limparSelecao": "Limpar seleção",
  "sp.catalogo.acao.ativarRef": "Ativar {ref}",
  "sp.catalogo.acao.desativarRef": "Desativar {ref}",
  "sp.catalogo.acao.editarRef": "Editar {ref}",
  "sp.catalogo.acao.selecionarRef": "Selecionar {ref}",
  "sp.catalogo.acao.selecionarTodos": "Selecionar todos os artigos desta página",

  // Lista vazia
  "sp.catalogo.vazio.pesquisa": "Nenhum artigo corresponde à pesquisa.",
  "sp.catalogo.vazio.semArtigos": "Ainda não tem artigos no catálogo.",

  // Tabela e cartões
  "sp.catalogo.coluna.ref": "Ref.",
  "sp.catalogo.coluna.nome": "Nome",
  "sp.catalogo.coluna.codBarras": "Cód. barras",
  "sp.catalogo.coluna.unidade": "Unidade",
  "sp.catalogo.coluna.preco": "Preço",
  "sp.catalogo.coluna.minimo": "Mínimo",
  "sp.catalogo.coluna.prazo": "Prazo",
  "sp.catalogo.coluna.estado": "Estado",
  "sp.catalogo.coluna.acoes": "Ações",
  "sp.catalogo.estado.ativo": "Ativo",
  "sp.catalogo.estado.inativo": "Inativo",
  "sp.catalogo.porEmbalagem": "{n}/emb.",
  "sp.catalogo.prazoCurto": "{n} d",
  "sp.catalogo.prazoLongo.um": "{n} dias",
  "sp.catalogo.prazoLongo.varios": "{n} dias",

  // Paginação
  "sp.catalogo.paginacao.aria": "Paginação",
  "sp.catalogo.paginacao.intervalo": "{de}–{ate} de {total}",
  "sp.catalogo.paginacao.anterior": "Página anterior",
  "sp.catalogo.paginacao.seguinte": "Página seguinte",

  // Avisos (toasts)
  "sp.catalogo.aviso.ativados": "Artigos ativados",
  "sp.catalogo.aviso.desativados": "Artigos desativados",
  "sp.catalogo.aviso.ativadosN.um": "{n} artigo(s) ativado(s).",
  "sp.catalogo.aviso.ativadosN.varios": "{n} artigo(s) ativado(s).",
  "sp.catalogo.aviso.desativadosN.um": "{n} artigo(s) desativado(s).",
  "sp.catalogo.aviso.desativadosN.varios": "{n} artigo(s) desativado(s).",
  "sp.catalogo.aviso.erroAtivar": "Não foi possível ativar",
  "sp.catalogo.aviso.erroDesativar": "Não foi possível desativar",
  "sp.catalogo.aviso.vazio": "Catálogo vazio",
  "sp.catalogo.aviso.vazioDescricao": "Ainda não tem artigos para exportar.",
  "sp.catalogo.aviso.erroExportar": "Não foi possível exportar",
  "sp.catalogo.aviso.criado": "Artigo criado",
  "sp.catalogo.aviso.guardado": "Artigo guardado",

  // Diálogo de artigo
  "sp.catalogo.artigo.tituloNovo": "Novo artigo",
  "sp.catalogo.artigo.tituloEditar": "Editar artigo",
  "sp.catalogo.artigo.descricaoNovo": "Preencha pelo menos a referência e o nome.",
  "sp.catalogo.artigo.descricaoEditar": "Altere os dados do artigo. Campos vazios ficam sem valor.",
  "sp.catalogo.artigo.referencia": "Referência *",
  "sp.catalogo.artigo.codigoBarras": "Código de barras",
  "sp.catalogo.artigo.codigoBarrasDica": "8 a 14 dígitos",
  "sp.catalogo.artigo.nome": "Nome *",
  "sp.catalogo.artigo.descricao": "Descrição",
  "sp.catalogo.artigo.marca": "Marca",
  "sp.catalogo.artigo.unidade": "Unidade",
  "sp.catalogo.artigo.unidadeDica": "ex.: un, cx, m, kg",
  "sp.catalogo.artigo.unidadesEmbalagem": "Unidades por embalagem",
  "sp.catalogo.artigo.preco": "Preço (sem IVA)",
  "sp.catalogo.artigo.moeda": "Moeda",
  "sp.catalogo.artigo.minimo": "Quantidade mínima",
  "sp.catalogo.artigo.prazo": "Prazo de entrega (dias)",
  "sp.catalogo.artigo.ativo": "Artigo ativo",
  "sp.catalogo.artigo.obrigatorios": "A referência e o nome são obrigatórios.",
  "sp.catalogo.artigo.cancelar": "Cancelar",
  "sp.catalogo.artigo.aGuardar": "A guardar...",
  "sp.catalogo.artigo.guardar": "Guardar alterações",
  "sp.catalogo.artigo.criar": "Criar artigo",
};
