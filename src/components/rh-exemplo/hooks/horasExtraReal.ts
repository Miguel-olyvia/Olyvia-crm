/**
 * As horas extra da base (deteccao, confirmacao, limites, autorizacao por pessoa), delegando aos hooks reais.
 * Os ecras de /rh-exemplo importam daqui; so este ficheiro importa codigo real.
 */
export {
  useHorasExtraListar,
  useHorasExtraSaldo,
  useHorasExtraConfig,
  useHorasExtraAutorizacoes,
  useHorasExtraAcoes,
  CHAVE_HORAS_EXTRA,
  type FiltrosHorasExtra,
  type ListaHorasExtra,
  type ResultadoDeteccao,
  type ResultadoRegisto,
  type PedidoRegistoHoraExtra,
} from "@/hooks/hr/useHorasExtra";
export {
  DIAS_JANELA_SEMANAL,
  DIAS_MAX_DETECAO_ORGANIZACAO,
  DIAS_MAX_DETECAO_PESSOA,
  MAX_JANELAS_DETECAO,
  MOTIVO_MIN,
  dataHaMeses,
  diasDoIntervalo,
  hojeLisboa,
  limitesDoMes,
  planoDeDeteccao,
  type ResumoDeteccao,
  type SaldoHE,
  type ResultadoHE,
} from "@/lib/hr/horasExtraBase";
