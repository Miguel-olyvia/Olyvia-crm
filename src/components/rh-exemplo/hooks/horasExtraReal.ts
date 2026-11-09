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

// A margem de tempo e os desvios da base (configuracao, deteccao, validacao, assinaturas para o fecho). Ficam neste wrapper para
// os testes que simulam as horas extra simularem tambem os desvios (`@/test/horasExtraFalso`).
export {
  useDesviosMargem,
  useDesviosAcoes,
  prepararFechoComDesvios,
  type PreparacaoDoFecho,
  textoDoErroDesvios,
  CHAVE_DESVIOS_MARGEM,
  type MargemHook,
  type DesviosAcoesHook,
  type ResultadoDesvios,
} from "@/hooks/hr/useDesvios";
export { lerAssinaturasDeDesvios, detetarDesvios, type ResumoDeteccaoDesvios, type MargemLida } from "@/lib/hr/desviosRpc";
export { codigoDeErroDesvios, chaveDoErroDesvios, podeSerHoraExtra } from "@/lib/hr/desviosBase";
export type { VersaoMargem } from "@/lib/hr/desviosRelatorio";
// As horas extra APROVADAS no fecho: a assinatura de cada pessoa, lida imediatamente antes de calcular, e a conferencia com a do calculo.
export { prepararFechoComHorasExtra, type PreparacaoHorasExtraDoFecho } from "@/lib/hr/horasExtraFecho";
