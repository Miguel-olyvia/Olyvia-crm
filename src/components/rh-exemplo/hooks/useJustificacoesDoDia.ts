/**
 * As justificações do dia (a pessoa justifica um atraso ou uma falta sugerida, o RH decide), delegando ao hook real que
 * lê e escreve por RPC. Traduz as linhas da base para o contrato `JustificacaoDia` que os ecrãs de /rh-exemplo consomem.
 * Mantém a mesma interface que os restantes wrappers desta pasta.
 */
import { useMemo } from "react";
import {
  useJustificacoesDoDia as useJustificacoesDoDiaReal,
  type JustificacaoDiaLinha,
  type OpcoesJustificacoesDoDia,
} from "@/hooks/useJustificacoesDoDia";
import { linhaEmVigor, linhaParaJustificacaoDia, type JustificacaoDiaLinhaEmVigor } from "@/lib/hr/justificacaoDiaLinha";
import type { JustificacaoDia } from "@/components/rh-exemplo/lib/justificacaoDia";

export { useAccoesJustificacaoDia } from "@/hooks/useJustificacoesDoDia";
export type { OpcoesJustificacoesDoDia };
// A conversão vive em `@/lib/hr/justificacaoDiaLinha` (a fila de trabalho usa-a sem passar por este wrapper).
export { linhaEmVigor, linhaParaJustificacaoDia, type JustificacaoDiaLinhaEmVigor };

/** Da mais antiga para a mais recente: `situacaoDoDia` fica com a última do dia, a que vale. */
export function ordenarPorEnvio(justificacoes: readonly JustificacaoDia[]): JustificacaoDia[] {
  // `?? ""`: uma linha sem data de envio (contrato partido) ordena-se primeiro em vez de rebentar o ecrã.
  return [...justificacoes].sort((a, b) => (a.enviadaEm ?? "").localeCompare(b.enviadaEm ?? ""));
}

export function useJustificacoesDoDia(opcoes: OpcoesJustificacoesDoDia = {}) {
  const { linhas, loading, recusado, erro, indisponivel, recarregar } = useJustificacoesDoDiaReal(opcoes);
  const justificacoes = useMemo(() => ordenarPorEnvio(linhas.filter(linhaEmVigor).map(linhaParaJustificacaoDia)), [linhas]);
  return { justificacoes, loading, recusado, erro, indisponivel, recarregar };
}

export type JustificacoesDoDia = ReturnType<typeof useJustificacoesDoDia>;
