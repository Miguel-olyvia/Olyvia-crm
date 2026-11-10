/**
 * Os subsidios de ferias e de Natal, a parte PURA (a decisao por periodo, os avisos e os tipos), delegada ao codigo real. A leitura da
 * configuracao (o hook, que importa a base) vive em `useSubsidiosConfig.ts`, ao lado: assim o calculo puro nao carrega a base.
 * Os ecras de /rh-exemplo importam daqui; so os wrappers desta pasta importam codigo real de RH.
 */
export {
  AVISO_SUBSIDIO_CHAVE,
  decidirSubsidios,
  eAvisoSubsidio,
  periodoPagaSubsidios,
  type AvisoSubsidio,
  type DecisaoDoPeriodo,
  type PeriodoParaSubsidios,
  type SubsidiosConfig,
  type VinculoParaSubsidios,
} from "@/lib/hr/subsidiosExtra";
