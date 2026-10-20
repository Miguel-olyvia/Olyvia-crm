// Mensagens dos erros das funções neg_* (pt e en), traduzidas pelo código (NG001 a NG020 e 42501).
// Juntam-se aos de `pessoasPagina.ts`, por isso as chaves continuam a ser `pessoasPagina.*`.
const E = "pessoasPagina.erroNeg.";

const pt: Record<string, string> = {
  [`${E}ng001`]: "Este negócio já não está disponível.",
  [`${E}ng002`]: "O estado atual não permite esta ação.",
  [`${E}ng003`]: "Esta pessoa já não está disponível.",
  [`${E}ng004`]: "Este registo não pode ser ligado a este negócio.",
  [`${E}ng005`]: "Um levantamento ligado não se desliga nem se altera.",
  [`${E}ng006`]: "Para dar como ganho é preciso um contrato assinado ligado.",
  [`${E}ng007`]: "Não tem permissão para converter esta lead.",
  [`${E}ng008`]: "Esta funcionalidade não está ativa para esta organização.",
  [`${E}ng009`]: "Um dos valores não é válido.",
  [`${E}ng010`]: "O recurso já tem uma marcação a essa hora.",
  [`${E}ng011`]: "Perca ou ganhe os negócios abertos antes de encerrar.",
  [`${E}ng012`]: "A conversão não é possível nesta organização.",
  [`${E}ng013`]: "Este negócio já tem um levantamento ligado.",
  [`${E}ng014`]: "Este contrato só se liga depois de assinado.",
  [`${E}ng015`]: "A pessoa não tem lead aberta para converter.",
  [`${E}ng016`]: "Não foi possível criar a lead.",
  [`${E}ng017`]: "Esta visita já não está disponível.",
  [`${E}ng018`]: "Esta visita já foi feita ou cancelada e não se altera.",
  [`${E}ng019`]: "Este contacto já pertence a outra pessoa desta organização. Nada foi alterado.",
  [`${E}ng020`]: "Demasiadas verificações seguidas. Tente de novo dentro de alguns minutos.",
  [`${E}ng021`]: "A configuração do levantamento foi alterada entretanto por outra pessoa. Volte a abrir e tente de novo.",
  [`${E}permissao`]: "Não tem permissão para esta ação.",
  [`${E}generico`]: "Não foi possível concluir a ação. Tente novamente.",
};

const en: Record<string, string> = {
  [`${E}ng001`]: "This deal is no longer available.",
  [`${E}ng002`]: "The current state does not allow this action.",
  [`${E}ng003`]: "This person is no longer available.",
  [`${E}ng004`]: "This record cannot be linked to this deal.",
  [`${E}ng005`]: "A linked survey cannot be unlinked or changed.",
  [`${E}ng006`]: "To mark it as won, a signed contract must be linked.",
  [`${E}ng007`]: "You do not have permission to convert this lead.",
  [`${E}ng008`]: "This feature is not active for this organization.",
  [`${E}ng009`]: "One of the values is not valid.",
  [`${E}ng010`]: "The resource already has a booking at that time.",
  [`${E}ng011`]: "Lose or win the open deals before closing.",
  [`${E}ng012`]: "The conversion is not possible in this organization.",
  [`${E}ng013`]: "This deal already has a survey linked.",
  [`${E}ng014`]: "This contract can only be linked once signed.",
  [`${E}ng015`]: "The person has no open lead to convert.",
  [`${E}ng016`]: "The lead could not be created.",
  [`${E}ng017`]: "This visit is no longer available.",
  [`${E}ng018`]: "This visit has already been done or cancelled and cannot be changed.",
  [`${E}ng019`]: "This contact already belongs to another person in this organization. Nothing was changed.",
  [`${E}ng020`]: "Too many checks in a row. Please try again in a few minutes.",
  [`${E}ng021`]: "The survey configuration was changed in the meantime by someone else. Reopen it and try again.",
  [`${E}permissao`]: "You do not have permission for this action.",
  [`${E}generico`]: "The action could not be completed. Please try again.",
};

export const pessoasErrosTranslations: Record<"en" | "pt", Record<string, string>> = { en, pt };
