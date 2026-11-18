// Portal do fornecedor, mensagens de erro por `hint` (sp.erro.*), usadas por spErrorMessage (spRpc.ts).
// Ficam por traduzir nesta fase as mensagens cruas do servidor (`message` dos RAISE EXCEPTION, em português),
// que o ecrã mostra tal como vêm: not_found, too_many_rows, conflict, validation e order_closed quando o servidor
// manda texto; e as mensagens dos hints que o ecrã não escreve.
export const fornecedorPtErro: Record<string, string> = {
  "sp.erro.tentarDeNovo": "Tentar de novo",
  "sp.erro.desconhecido": "Erro desconhecido",
  "sp.erro.semAcesso": "Sem acesso ativo ao portal do fornecedor. Contacte a empresa que o convidou.",
  "sp.erro.soPrincipalCatalogo": "Só o utilizador principal da conta pode alterar o catálogo.",
  "sp.erro.soPrincipalDados": "Só o responsável principal da conta pode fazer esta alteração.",
  "sp.erro.naoEncontrado": "O artigo não existe ou já não está disponível.",
  "sp.erro.demasiadasLinhas": "Demasiadas linhas: o máximo é 5000 por importação.",
  "sp.erro.jaExiste": "Já existe um artigo com esta referência.",
  "sp.erro.dadosInvalidos": "Dados inválidos.",
  "sp.erro.encomendaAtualizada":
    "A empresa atualizou esta encomenda entretanto. Reveja os dados atualizados e confirme de novo.",
  "sp.erro.encomendaFechada": "Esta encomenda já foi recebida ou cancelada: já não pode ser confirmada.",
  "sp.erro.semLigacao": "Sem ligação ao servidor. Verifique a ligação à internet e tente novamente.",
  "sp.erro.demorou": "A operação demorou demasiado tempo. Tente novamente ou use um ficheiro mais pequeno.",
  "sp.erro.semPermissao": "Sem permissão para esta operação.",
  "sp.erro.inesperado": "Ocorreu um erro inesperado. Tente novamente.",
};
