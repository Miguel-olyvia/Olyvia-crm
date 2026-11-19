// Moldura do portal de cliente (cabeçalho, botões, avisos), em português: chaves `pc.layout.*`.
// O título e o menu Início/Documentos já estão em clientePt.ts (`pc.layout.titulo`, `pc.layout.menu.*`);
// aqui está o separador «Negócios», que no portal do RH reúne propostas e contratos.
export const clientePtLayout: Record<string, string> = {
  "pc.layout.menu.negocios": "Negócios",
  "pc.layout.papel": "Cliente",
  "pc.layout.mudarParaFornecedor": "Mudar para Portal do Fornecedor",
  "pc.layout.sessaoExpirada.titulo": "Sessão expirada",
  "pc.layout.sessaoExpirada.descricao": "Volte a iniciar sessão.",
  "pc.layout.erro.titulo": "Erro",
  "pc.layout.erro.confirmarPassword": "Não foi possível confirmar a alteração da palavra-passe. Tente novamente.",
};
