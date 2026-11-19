// Portal do fornecedor, mensagens de erro (sp.erro.*), usadas por spErrorMessage e pelos hintMessages (spRpc.ts).
// Ficam por traduzir as mensagens cruas do servidor (`message` dos RAISE EXCEPTION, em português), que o ecrã mostra
// tal como vêm: not_found, too_many_rows, conflict, validation, order_closed e duplicate_note quando o servidor
// manda texto. As mensagens abaixo são as de recurso e as que o próprio ecrã escreve.
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

  // Expedição com guia de remessa
  "sp.erro.confirmeAntesDeExpedir": "Confirme a encomenda antes de a expedir.",
  "sp.erro.guiaRepetida": "Já existe uma guia com este número para esta empresa. Verifique o número da guia.",
  "sp.erro.encomendaNaoDisponivel": "A encomenda não existe ou já não está disponível no portal.",
  "sp.erro.encomendaFechadaExpedir": "Esta encomenda já foi recebida ou cancelada: já não pode ser expedida.",
  "sp.erro.guiaNaoDisponivel": "A guia não existe ou já não está disponível no portal.",
  "sp.erro.guiaCancelada": "Esta guia foi cancelada pela empresa: já não pode anexar ficheiros.",

  // Ficheiro da guia
  "sp.erro.ficheiroTipo": "Tipo de ficheiro não permitido (só PDF, JPEG, PNG ou WEBP).",
  "sp.erro.ficheiroVazio": "O ficheiro está vazio.",
  "sp.erro.ficheiroGrande": "O ficheiro tem de ter até 10 MB.",
  "sp.erro.ficheiroNaoCarregado": "O ficheiro não foi carregado: {motivo}",
  "sp.erro.ficheiroRecusado": "O ficheiro foi recusado.",
};
