// Textos do custo de um mês FECHADO (`rhCustoFecho.*`): as horas e a retribuição são as gravadas no fecho do período; o resto
// (equipamentos, taxas, exceções, banco de horas) segue os registos atuais. Módulo próprio, juntado em `useTranslation.ts`.
// Apenas en/pt: nas outras línguas o `t()` cai para `en`.
export const rhExemploCustoFechoTranslations: Record<"en" | "pt", Record<string, string>> = {
  pt: {
    "rhCustoFecho.nota": "Mês fechado: só as horas e a retribuição são as gravadas no fecho do período. Equipamentos, taxas, exceções e banco de horas seguem os registos atuais.",
    "rhCustoFecho.semValores": "Sem valores gravados no fecho",
    "rhCustoFecho.semValoresDetalhe": "Sem valores gravados no fecho: este período foi fechado sem resultados guardados, ou não foi possível lê-los. O custo deste mês não se recalcula.",
    "rhCustoFecho.semValoresPessoa": "Sem valores gravados no fecho para esta pessoa: a retribuição e as horas deste mês não se recalculam.",
    "rhCustoFecho.aLer": "A ler os valores gravados no fecho…",
    "rhCustoFecho.tentarDeNovo": "Tentar de novo",
  },
  en: {
    "rhCustoFecho.nota": "Closed month: only the hours and the pay are the ones saved when the period was closed. Equipment, rates, exceptions and the hours bank follow the current records.",
    "rhCustoFecho.semValores": "No values saved at closing",
    "rhCustoFecho.semValoresDetalhe": "No values saved at closing: this period was closed without saved results, or they could not be read. This month's cost is not recalculated.",
    "rhCustoFecho.semValoresPessoa": "No values saved at closing for this person: this month's pay and hours are not recalculated.",
    "rhCustoFecho.aLer": "Reading the values saved at closing…",
    "rhCustoFecho.tentarDeNovo": "Try again",
  },
};
