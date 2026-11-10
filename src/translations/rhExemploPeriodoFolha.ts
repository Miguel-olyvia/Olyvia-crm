// Textos do separador «Período da folha» de /rh-exemplo/processamento-salarial > Configuração (`rhPeriodo.cfg.*`): a frase da regra em
// vigor, o exemplo vivo, o seletor do dia e a previsão da folha de transição. O resto reaproveita `hr.periodoFolha.*` (rhExemploMenu.ts).
// Módulo próprio, juntado em `tabelaFundida.ts`. Apenas en/pt: nas outras línguas o `t()` cai para `en`.
export const rhExemploPeriodoFolhaTranslations: Record<"en" | "pt", Record<string, string>> = {
  pt: {
    "rhPeriodo.cfg.aCarregar": "A carregar o período da folha…",
    "rhPeriodo.cfg.frase": "A folha começa no dia {dia} de cada mês e acaba no dia anterior ao do mês seguinte (dia {fecha}).",
    "rhPeriodo.cfg.fraseDia1": "A folha é o mês de calendário: começa no dia 1 e acaba no último dia do mês.",
    "rhPeriodo.cfg.exemplo": "A folha de {folha} vai de {de} a {ate}.",
    "rhPeriodo.cfg.campoDia": "Dia em que a folha começa",
    "rhPeriodo.cfg.opcaoDia1": "1 (mês de calendário)",
    "rhPeriodo.cfg.previsaoTransicao": "A folha de {folha} será de transição: vai de {de} a {ate}.",
    "rhPeriodo.cfg.mesSubsidios":
      "O mês de pagamento dos subsídios de férias e de Natal é o do nome da folha (o mês em que a folha termina): com início no dia 22, a folha de novembro termina a 21/11 e é a que paga o subsídio de novembro.",
    "rhPeriodo.cfg.rotuloEmCurso": "Folha em curso:",
    "rhPeriodo.cfg.rotuloProxima": "Próxima folha:",
    "rhPeriodo.cfg.historico": "Histórico de regras",
    "rhPeriodo.cfg.historicoAgendada": "agendada",
    "rhPeriodo.cfg.guardarSucesso": "Regra do período da folha guardada. A regra vale a partir da folha de {mes}.",
  },
  en: {
    "rhPeriodo.cfg.aCarregar": "Loading the payroll period…",
    "rhPeriodo.cfg.frase": "The payroll starts on day {dia} of each month and ends the day before that day in the following month (day {fecha}).",
    "rhPeriodo.cfg.fraseDia1": "The payroll is the calendar month: it starts on day 1 and ends on the last day of the month.",
    "rhPeriodo.cfg.exemplo": "The {folha} payroll runs from {de} to {ate}.",
    "rhPeriodo.cfg.campoDia": "Day the payroll starts",
    "rhPeriodo.cfg.opcaoDia1": "1 (calendar month)",
    "rhPeriodo.cfg.previsaoTransicao": "The {folha} payroll will be a transition one: it runs from {de} to {ate}.",
    "rhPeriodo.cfg.mesSubsidios":
      "The month in which holiday and Christmas allowances are paid is the one in the payroll's name (the month the payroll ends in): starting on day 22, the November payroll ends on 21/11 and is the one that pays the November allowance.",
    "rhPeriodo.cfg.rotuloEmCurso": "Current payroll:",
    "rhPeriodo.cfg.rotuloProxima": "Next payroll:",
    "rhPeriodo.cfg.historico": "Rules history",
    "rhPeriodo.cfg.historicoAgendada": "scheduled",
    "rhPeriodo.cfg.guardarSucesso": "Payroll period rule saved. The rule applies from the {mes} payroll.",
  },
};
