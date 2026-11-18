// Portal do fornecedor, lista de encomendas (sp.encomendas.*) e estados (sp.estado.*).
// Os códigos da base (sent, viewed, confirmed, cancelled...) não mudam: só se mapeiam para estas chaves.
export const fornecedorPtEncomendas: Record<string, string> = {
  "sp.estado.nova": "Nova",
  "sp.estado.vista": "Vista",
  "sp.estado.confirmada": "Confirmada",
  "sp.estado.cancelada": "Cancelada",
  "sp.estado.recebida": "Recebida",
  "sp.estado.parcialmenteRecebida": "Parcialmente recebida",

  "sp.encomendas.titulo": "Encomendas",
  "sp.encomendas.subtitulo":
    "Encomendas que as empresas lhe enviaram pelo portal. Abra uma encomenda para ver o detalhe, descarregar o PDF e confirmar.",
  "sp.encomendas.atualizar": "Atualizar",
  "sp.encomendas.estadoDasEncomendas": "Estado das encomendas",
  "sp.encomendas.filtro.to_confirm": "Por confirmar",
  "sp.encomendas.filtro.confirmed": "Confirmadas",
  "sp.encomendas.filtro.open": "Em curso",
  "sp.encomendas.filtro.received": "Recebidas",
  "sp.encomendas.filtro.cancelled": "Canceladas",
  "sp.encomendas.filtro.all": "Todas",

  "sp.encomendas.pesquisar": "Pesquisar",
  "sp.encomendas.pesquisarPlaceholder": "Número da encomenda ou empresa",
  "sp.encomendas.empresa": "Empresa",
  "sp.encomendas.todasEmpresas": "Todas as empresas",
  "sp.encomendas.aCarregar": "A carregar encomendas…",

  "sp.encomendas.vazio.comFiltros": "Nenhuma encomenda com estes filtros.",
  "sp.encomendas.vazio.porConfirmar": "Não tem encomendas por confirmar.",
  "sp.encomendas.vazio.sem": "Sem encomendas.",
  "sp.encomendas.vazio.verTodas": "Ver todas as encomendas",

  "sp.encomendas.linhasN": "{n} linha(s)",
  "sp.encomendas.entregaPrevistaDia": "Entrega prevista: {data}",
  "sp.encomendas.coluna.encomenda": "Encomenda",
  "sp.encomendas.coluna.empresa": "Empresa",
  "sp.encomendas.coluna.data": "Data",
  "sp.encomendas.coluna.entregaPedida": "Entrega pedida",
  "sp.encomendas.coluna.entregaPrevista": "Entrega prevista",
  "sp.encomendas.coluna.linhas": "Linhas",
  "sp.encomendas.coluna.total": "Total",
  "sp.encomendas.coluna.estado": "Estado",

  "sp.encomendas.paginacao": "{de}–{ate} de {total}",
  "sp.encomendas.paginaAnterior": "Página anterior",
  "sp.encomendas.paginaSeguinte": "Página seguinte",
};
