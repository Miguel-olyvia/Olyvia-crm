// Os resultados gravados de um periodo fechado, as pessoas obrigatorias do fecho e as contas puras do fecho, delegando ao
// codigo real. So os wrappers desta pasta podem importar codigo real de RH.
export { useProcessamentoResultados } from "@/hooks/useProcessamentoResultados";
export type { ProcessamentoResultados, EstadoResultados } from "@/hooks/useProcessamentoResultados";
export { usePessoasObrigatoriasDoFecho } from "@/hooks/usePessoasObrigatoriasDoFecho";
export {
  MAX_DESCRICAO_LANCAMENTO,
  construirResultadosDoFecho,
  minutosDeLinhaGravada,
  motivoDeBloqueioDoFecho,
  resultadoDeLinhaGravada,
} from "@/lib/hr/resultadosFecho";
export type { MotivoBloqueioDoFecho, ResultadoLido } from "@/lib/hr/resultadosFecho";
