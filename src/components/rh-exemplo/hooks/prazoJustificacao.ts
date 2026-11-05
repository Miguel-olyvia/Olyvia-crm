/**
 * O prazo para justificar: o FIM DO PERIODO DA FOLHA que contem o dia (nao ha dias uteis nem prazo configuravel).
 * Depois de o periodo fechar, a falta fica injustificada para sempre. A conta vive em @/lib/hr/periodoFolha e chega ao
 * resto do /rh-exemplo por este wrapper (fora de hooks/ nada importa de @/lib/hr, regra do semBase.test.ts).
 */
export {
  diasDeCalendarioEntre,
  fimDoPeriodoDoDia,
  formatarDataPorExtenso,
  localeDaLingua,
  periodoDoDia,
  type RegraPeriodoFolha,
} from "@/lib/hr/periodoFolha";

/** O ultimo dia para justificar o dia dado: o fim do periodo da folha que o contem. */
export type PrazoDe = (dataDoDia: string) => string;
