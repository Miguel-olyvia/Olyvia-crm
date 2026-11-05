/**
 * O periodo da folha para os ecras de /rh-exemplo: a conta (`@/lib/hr/periodoFolha`), a folha escolhida
 * (`usePeriodoFolhaEscolhido`) e o seletor. Fora de hooks/ nada importa de @/lib/hr nem de @/components/hr (semBase.test.ts):
 * passa tudo por aqui.
 */
export {
  formatarIntervaloPeriodo,
  intervaloEfectivo,
  localeDaLingua,
  nomeDaFolha,
  periodoDaFolhaPorRegras,
  type IntervaloEfectivo,
} from "@/lib/hr/periodoFolha";
export { usePeriodoDoDia } from "@/hooks/usePeriodoDoDia";
export { usePeriodoFolhaEscolhido } from "@/hooks/usePeriodoFolhaEscolhido";
export { usePeriodoFolhaRegras } from "@/hooks/usePeriodoFolhaRegras";
export { SeletorPeriodoFolha } from "@/components/hr/processamento/SeletorPeriodoFolha";