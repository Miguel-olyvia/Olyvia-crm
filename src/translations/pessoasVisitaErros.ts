// Os erros dos diálogos de visita (marcar, alterar, cancelar e resultado), em pt e en. O mesmo código lê-se de outra maneira em cada
// diálogo (ver `hooks/pessoas/errosVisita.ts`); os que não aparecem aqui ficam com a mensagem geral de `pessoasErros.ts`.
// Juntam-se aos de `pessoasPagina.ts`, por isso as chaves continuam a ser `pessoasPagina.*`.
const V = "pessoasPagina.real.visit.";
const E = `${V}err.`;

const pt: Record<string, string> = {
  [`${E}marcar.ng008`]: "O quadro ou o recurso escolhido já não está disponível. Escolha outro e tente de novo.",
  [`${E}marcar.ng009`]: "Confirme o dia, a hora, a duração e a morada: um dos valores da visita não é válido.",
  [`${E}marcar.ng010`]: "Um dos recursos já tem uma marcação ou uma ausência a essa hora. Escolha outra hora ou outro recurso.",
  [`${E}alterar.ng008`]: "O quadro ou o recurso escolhido já não está disponível. Escolha outro e tente de novo.",
  [`${E}alterar.ng009`]: "Confirme o dia, a hora, a duração e a morada: um dos valores da visita não é válido.",
  [`${E}alterar.ng010`]: "Um dos recursos já tem uma marcação ou uma ausência a essa hora. Escolha outra hora ou outro recurso.",
  [`${V}ownerForbidden`]: "Não pode mudar quem vai a esta visita: mudaria o responsável da lead.",
  [`${E}cancelar.ng018`]: "Esta visita já foi feita, tem resultado ou é de um negócio fechado: não se cancela.",
  [`${E}encerrar.ng009`]: "Confirme o resultado e o motivo do encerramento: um dos valores não é válido.",
  [`${E}resultado.ng009`]: "Uma visita que ainda não aconteceu não se pode dar como feita.",
  [`${E}resultado.ng018`]: "Esta visita foi cancelada e não recebe resultado.",
  [`${E}badTime`]: "Indique um dia e uma hora válidos.",
  [`${E}badDuration`]: "A duração da visita não é válida.",
  [`${E}noResource`]: "Escolha quem vai à visita.",
  [`${E}noBoard`]: "Escolha o quadro da agenda onde marcar a visita.",
  [`${E}noVisit`]: "Esta visita já não está disponível.",
  [`${E}noDuration`]: "Esta visita não tem hora de fim registada, por isso o horário não se pode alterar daqui.",
  [`${E}visitNotLoaded`]: "Não foi possível encontrar esta visita na ficha. Espere que a ficha carregue, ou recarregue-a, e tente de novo.",
};

const en: Record<string, string> = {
  [`${E}marcar.ng008`]: "The board or resource you chose is no longer available. Choose another and try again.",
  [`${E}marcar.ng009`]: "Check the day, the time, the duration and the address: one of the visit values is not valid.",
  [`${E}marcar.ng010`]: "One of the resources already has a booking or an absence at that time. Choose another time or another resource.",
  [`${E}alterar.ng008`]: "The board or resource you chose is no longer available. Choose another and try again.",
  [`${E}alterar.ng009`]: "Check the day, the time, the duration and the address: one of the visit values is not valid.",
  [`${E}alterar.ng010`]: "One of the resources already has a booking or an absence at that time. Choose another time or another resource.",
  [`${V}ownerForbidden`]: "You cannot change who goes to this visit: it would change the lead's owner.",
  [`${E}cancelar.ng018`]: "This visit has already been done, has a result or belongs to a closed deal: it cannot be cancelled.",
  [`${E}encerrar.ng009`]: "Check the result and the reason for closing: one of the values is not valid.",
  [`${E}resultado.ng009`]: "A visit that has not happened yet cannot be marked as done.",
  [`${E}resultado.ng018`]: "This visit was cancelled and does not take a result.",
  [`${E}badTime`]: "Enter a valid day and time.",
  [`${E}badDuration`]: "The visit duration is not valid.",
  [`${E}noResource`]: "Choose who goes to the visit.",
  [`${E}noBoard`]: "Choose the calendar board where the visit is booked.",
  [`${E}noVisit`]: "This visit is no longer available.",
  [`${E}noDuration`]: "This visit has no end time recorded, so its schedule cannot be changed from here.",
  [`${E}visitNotLoaded`]: "This visit could not be found in the record. Wait for the record to load, or reload it, and try again.",
};

export const pessoasVisitaErrosTranslations: Record<"en" | "pt", Record<string, string>> = { en, pt };
