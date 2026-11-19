// Portal do fornecedor, página inicial (sp.inicio.*).
// O plural das encomendas por confirmar usa sp.encomendas.porConfirmar.um/varios (em fornecedorPt.ts).
export const fornecedorPtInicio: Record<string, string> = {
  "sp.inicio.ola": "Olá, {nome}",
  "sp.inicio.boasVindas": "Bem-vindo",
  "sp.inicio.introAntes": "Portal do Fornecedor de ",
  "sp.inicio.introDepois":
    ". Aqui recebe e confirma as encomendas e mantém o seu catálogo atualizado para as empresas com quem trabalha.",

  "sp.inicio.encomendas.titulo": "Encomendas",
  "sp.inicio.encomendas.aContar": "A contar encomendas…",
  "sp.inicio.encomendas.erroContar": "Não foi possível contar as encomendas.",
  "sp.inicio.encomendas.nenhumaPorConfirmar": "Não tem encomendas por confirmar.",
  "sp.inicio.encomendas.verPrazos": "Ver prazos em risco",
  "sp.inicio.encomendas.verPorConfirmar": "Ver encomendas por confirmar",
  "sp.inicio.encomendas.ver": "Ver encomendas",

  "sp.inicio.catalogo.titulo": "Catálogo",
  "sp.inicio.catalogo.aContar": "A contar artigos…",
  "sp.inicio.catalogo.erroContar": "Não foi possível contar os artigos.",
  "sp.inicio.catalogo.ativos.um": "{n} artigo ativo",
  "sp.inicio.catalogo.ativos.varios": "{n} artigos ativos",
  "sp.inicio.catalogo.soConsulta": "Pode consultar o catálogo. Só o utilizador principal da conta pode alterá-lo.",
  "sp.inicio.catalogo.gerir": "Gerir catálogo",
  "sp.inicio.catalogo.ver": "Ver catálogo",

  "sp.inicio.empresas.titulo": "Empresas com acesso",
  "sp.inicio.empresas.erro": "Não foi possível carregar a lista de empresas. Recarregue a página.",
  "sp.inicio.empresas.nenhuma": "Nenhuma empresa com acesso ativo.",
  "sp.inicio.empresas.desde": "Desde {data}",
};
