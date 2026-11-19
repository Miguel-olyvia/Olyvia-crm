// Portal do fornecedor, moldura (sp.layout.*): cabeçalho, menu, papéis, rodapé e ecrãs de acesso/erro.
// As chaves sp.layout.titulo e sp.layout.menu.{inicio,encomendas,catalogo} estão em fornecedorPt.ts.
export const fornecedorPtLayout: Record<string, string> = {
  "sp.layout.menu.contrato": "Contrato",
  "sp.layout.menu.meusDados": "Os meus dados",
  "sp.layout.aCarregar": "A carregar…",
  "sp.layout.clientes": "Clientes: {lista}",
  "sp.layout.sair": "Sair",
  "sp.layout.mudarParaCliente": "Mudar para Portal do Cliente",
  "sp.layout.papel.owner": "Utilizador principal",
  "sp.layout.papel.member": "Consulta",
  "sp.layout.porConfirmar": "{n} por confirmar",
  "sp.layout.contratoPorAssinar": "contrato por assinar",

  "sp.layout.semAcesso.titulo": "Sem acesso ativo",
  "sp.layout.semAcesso.texto":
    "A sua conta não tem nenhum acesso ativo ao portal. Contacte a empresa que o convidou.",
  "sp.layout.semAcesso.sessao": "Sessão iniciada como {email}",

  "sp.layout.erroCarregar.titulo": "Não foi possível carregar o portal",
  "sp.layout.erroCarregar.texto": "Verifique a ligação à internet e tente de novo.",
};
