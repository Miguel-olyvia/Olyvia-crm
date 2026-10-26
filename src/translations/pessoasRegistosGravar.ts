// Os textos de gravar o painel «Visita e levantamento» na ficha real (pt e en): o aviso de falha parcial (o que ficou gravado e o que falhou), as
// recusas antes de escrever e a confirmação. Juntam-se aos de `pessoasPagina.ts`, por isso as chaves continuam a ser `pessoasPagina.*`.
const P = "pessoasPagina.real.records.";

const pt: Record<string, string> = {
  [`${P}partial`]: "Parte do que escreveu ficou gravado, mas nem tudo. Volte a guardar: só se repete o que falta.",
  [`${P}partialDetail`]: "Ficou gravado: {done}. Não foi possível gravar: {failed}. Volte a guardar para tentar de novo só o que falta.",
  [`${P}part.criarVisita`]: "a visita nova",
  [`${P}part.alterarVisita`]: "a alteração da visita",
  [`${P}part.concluirVisita`]: "a visita dada como feita",
  [`${P}part.cancelarVisita`]: "o cancelamento da visita",
  [`${P}part.levantamento`]: "o levantamento",
  [`${P}err.dateMissing`]: "Indique o dia da visita antes de guardar.",
  [`${P}err.timeMissing`]: "Indique a hora da visita antes de guardar.",
  [`${P}err.doneInFuture`]: "Uma visita que ainda não aconteceu não se pode dar como feita. Corrija o dia ou a hora, ou deixe-a por fazer.",
  [`${P}err.noAgenda`]: "Não foi possível escolher por si o quadro da agenda e quem vai à visita. Espere um instante e tente de novo, ou marque a visita pelo botão «Marcar visita», que deixa escolher.",
  [`${P}saved`]: "Visita e levantamento de {name} guardados.",
  [`${P}nothing`]: "Não havia alterações a guardar.",
  [`${P}qualSavedNote`]: "A Qualificação e o pedido do cliente ficaram gravados.",
};

const en: Record<string, string> = {
  [`${P}partial`]: "Part of what you entered was saved, but not all of it. Save again: only what is missing is repeated.",
  [`${P}partialDetail`]: "Saved: {done}. Could not save: {failed}. Save again to retry only what is missing.",
  [`${P}part.criarVisita`]: "the new visit",
  [`${P}part.alterarVisita`]: "the visit change",
  [`${P}part.concluirVisita`]: "the visit marked as done",
  [`${P}part.cancelarVisita`]: "the visit cancellation",
  [`${P}part.levantamento`]: "the survey",
  [`${P}err.dateMissing`]: "Enter the day of the visit before saving.",
  [`${P}err.timeMissing`]: "Enter the time of the visit before saving.",
  [`${P}err.doneInFuture`]: "A visit that has not happened yet cannot be marked as done. Fix the day or the time, or leave it as to do.",
  [`${P}err.noAgenda`]: "The calendar board and who goes to the visit could not be chosen for you. Wait a moment and try again, or book the visit with the \"Book visit\" button, which lets you choose.",
  [`${P}saved`]: "Visit and survey for {name} saved.",
  [`${P}nothing`]: "There were no changes to save.",
  [`${P}qualSavedNote`]: "The qualification and the customer request were saved.",
};

export const pessoasRegistosGravarTranslations: Record<"en" | "pt", Record<string, string>> = { en, pt };
