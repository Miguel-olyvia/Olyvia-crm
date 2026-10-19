// Textos da ficha real das Pessoas (pt e en): a ficha lida da base. Juntam-se aos de `pessoasPagina.ts`, por isso as chaves
// continuam a ser `pessoasPagina.*` (aqui, `pessoasPagina.real.ficha.*`). Os textos da ficha do protótipo estão em `pessoasFicha.ts`.
const F = "pessoasPagina.real.ficha.";

const pt: Record<string, string> = {
  [`${F}opening`]: "A abrir a ficha…",
  [`${F}notFound`]: "Não foi possível abrir esta ficha.",
  [`${F}partialCall`]: "O contacto ficou registado, mas a abordagem não foi encerrada. Tente encerrar de novo: o contacto não se repete.",
  [`${F}activity.snoozed`]: "Contacto adiado",
  [`${F}activity.lost`]: "Negócio perdido",
  [`${F}activity.reopened`]: "Negócio reaberto",
  [`${F}activity.won`]: "Negócio ganho",
  [`${F}activity.deleted`]: "Apagado",
  [`${F}activity.restored`]: "Restaurado",
  [`${F}partialVisit`]: "A abordagem ficou encerrada, mas o resultado da visita não foi registado. Tente guardar o resultado de novo.",
  [`${F}saving`]: "A guardar…",
  [`${F}staleWarn`]: "Não foi possível atualizar a ficha. Está a ver os últimos dados carregados.",
  [`${F}unknownResult`]: "Resultado não indicado",
  [`${F}more.contactos`]: "Carregar mais contactos",
  [`${F}more.visitas`]: "Carregar mais visitas",
  [`${F}more.levantamentos`]: "Carregar mais levantamentos",
  [`${F}more.atividade`]: "Carregar mais atividade",
  [`${F}more.loading`]: "A carregar…",
};

const en: Record<string, string> = {
  [`${F}opening`]: "Opening the record…",
  [`${F}notFound`]: "This record could not be opened.",
  [`${F}partialCall`]: "The call was logged, but the approach was not closed. Try closing it again: the call will not be logged twice.",
  [`${F}activity.snoozed`]: "Contact snoozed",
  [`${F}activity.lost`]: "Deal lost",
  [`${F}activity.reopened`]: "Deal reopened",
  [`${F}activity.won`]: "Deal won",
  [`${F}activity.deleted`]: "Deleted",
  [`${F}activity.restored`]: "Restored",
  [`${F}partialVisit`]: "The approach was closed, but the visit result was not saved. Try saving the result again.",
  [`${F}saving`]: "Saving…",
  [`${F}staleWarn`]: "The record could not be refreshed. You are seeing the last loaded data.",
  [`${F}unknownResult`]: "Result not given",
  [`${F}more.contactos`]: "Load more calls",
  [`${F}more.visitas`]: "Load more visits",
  [`${F}more.levantamentos`]: "Load more surveys",
  [`${F}more.atividade`]: "Load more activity",
  [`${F}more.loading`]: "Loading…",
};

export const pessoasFichaRealTranslations: Record<"en" | "pt", Record<string, string>> = { en, pt };
