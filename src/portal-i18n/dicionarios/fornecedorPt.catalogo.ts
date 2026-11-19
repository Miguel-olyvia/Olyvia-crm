// Portal do fornecedor, português: página do catálogo (SupplierPortalCatalog). Chaves `sp.catalogo.*`.
// O diálogo de artigo e as fotos estão em fornecedorPt.catalogoArtigo.ts (`sp.catalogo.artigo.*`, `sp.catalogo.foto.*`...).
// Plurais (escolher a chave com n === 1): o português mantém o «(s)» de sempre, por isso «um» e «varios» são iguais;
// o inglês distingue. Os números seguem sempre o formato pt-PT.
export const fornecedorPtCatalogo: Record<string, string> = {
  // Página
  "sp.catalogo.titulo": "Catálogo",
  "sp.catalogo.aCarregar": "A carregar…",

  // Contagem por tipo e por estado: {n} artigo(s) / produto(s) / serviço(s), «ativos» quando não se mostram os inativos
  "sp.catalogo.contagem.artigo.ativos.um": "{n} artigo(s) ativos",
  "sp.catalogo.contagem.artigo.ativos.varios": "{n} artigo(s) ativos",
  "sp.catalogo.contagem.artigo.todos.um": "{n} artigo(s)",
  "sp.catalogo.contagem.artigo.todos.varios": "{n} artigo(s)",
  "sp.catalogo.contagem.produto.ativos.um": "{n} produto(s) ativos",
  "sp.catalogo.contagem.produto.ativos.varios": "{n} produto(s) ativos",
  "sp.catalogo.contagem.produto.todos.um": "{n} produto(s)",
  "sp.catalogo.contagem.produto.todos.varios": "{n} produto(s)",
  "sp.catalogo.contagem.servico.ativos.um": "{n} serviço(s) ativos",
  "sp.catalogo.contagem.servico.ativos.varios": "{n} serviço(s) ativos",
  "sp.catalogo.contagem.servico.todos.um": "{n} serviço(s)",
  "sp.catalogo.contagem.servico.todos.varios": "{n} serviço(s)",

  // Botões do cabeçalho
  "sp.catalogo.botao.modelo": "Descarregar modelo",
  "sp.catalogo.botao.exportar": "Exportar",
  "sp.catalogo.botao.aExportar": "A exportar…",
  "sp.catalogo.botao.importar": "Importar",
  "sp.catalogo.botao.importarExcel": "Importar Excel/CSV",
  "sp.catalogo.botao.novoArtigo": "Novo artigo",
  "sp.catalogo.botao.tentarNovamente": "Tentar de novo",

  // Modo de consulta, pesquisa e filtros
  "sp.catalogo.consulta": "Está em modo de consulta. Só o utilizador principal da conta pode criar, alterar, importar ou desativar artigos.",
  "sp.catalogo.pesquisa.placeholder": "Pesquisar por referência, nome, código de barras ou marca",
  "sp.catalogo.pesquisa.aria": "Pesquisar artigos",
  "sp.catalogo.filtro.aria": "Filtrar por tipo",
  "sp.catalogo.filtro.todos": "Todos",
  "sp.catalogo.filtro.produtos": "Produtos",
  "sp.catalogo.filtro.servicos": "Serviços",
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
  "sp.catalogo.vazio.semProdutos": "Ainda não tem produtos no catálogo.",
  "sp.catalogo.vazio.semServicos": "Ainda não tem serviços no catálogo.",

  // Tabela e cartões
  "sp.catalogo.coluna.ref": "Ref.",
  "sp.catalogo.coluna.tipo": "Tipo",
  "sp.catalogo.coluna.sku": "SKU",
  "sp.catalogo.coluna.foto": "Foto",
  "sp.catalogo.coluna.nome": "Nome",
  "sp.catalogo.coluna.codBarras": "Cód. barras",
  "sp.catalogo.coluna.unidade": "Unidade",
  "sp.catalogo.coluna.preco": "Preço",
  "sp.catalogo.coluna.minimo": "Mínimo",
  "sp.catalogo.coluna.prazo": "Prazo",
  "sp.catalogo.coluna.estado": "Estado",
  "sp.catalogo.coluna.acoes": "Ações",
  "sp.catalogo.tipo.produto": "Produto",
  "sp.catalogo.tipo.servico": "Serviço",
  "sp.catalogo.estado.ativo": "Ativo",
  "sp.catalogo.estado.inativo": "Inativo",
  "sp.catalogo.semCategoria": "Sem categoria",
  "sp.catalogo.skuRef": "SKU {sku}",
  "sp.catalogo.zona": "Zona: {zona}",
  "sp.catalogo.zonaAtuacao": "Zona de atuação",
  "sp.catalogo.mobilizacao": "Mobilização",
  "sp.catalogo.prazoMobilizacao": "Prazo de mobilização",
  "sp.catalogo.prazoMobilizacaoCurto": "{n} d mob.",
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
};
