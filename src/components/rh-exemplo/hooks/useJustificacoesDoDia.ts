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
import { horaSemSegundos } from "@/lib/hr/justificacaoDia";
import type { JustificacaoDia } from "@/components/rh-exemplo/lib/justificacaoDia";

export { useAccoesJustificacaoDia } from "@/hooks/useJustificacoesDoDia";
export type { OpcoesJustificacoesDoDia };

/** Sem decisor conhecido (utilizador entretanto apagado) a linha continua a dizer que foi decidida. */
const DECISOR_DESCONHECIDO = "—";

/** Uma linha que ainda vale: tudo menos `sem_efeito`. */
export type JustificacaoDiaLinhaEmVigor = JustificacaoDiaLinha & { estado: Exclude<JustificacaoDiaLinha["estado"], "sem_efeito"> };

/**
 * `sem_efeito`: estava aceite e a falta que a aceitação criou foi anulada ou corrigida. A base devolve-a no histórico, mas
 * não conta para a situação do dia: se fosse a mais recente do dia, o dia ficava preso nela e a pessoa não podia reenviar.
 */
export const linhaEmVigor = (linha: JustificacaoDiaLinha): linha is JustificacaoDiaLinhaEmVigor => linha.estado !== "sem_efeito";

/** Uma linha da base como justificação do ecrã. O motivo vem vazio quando a base o reservou («Ver texto»). */
export function linhaParaJustificacaoDia(linha: JustificacaoDiaLinhaEmVigor): JustificacaoDia {
  return {
    id: linha.id,
    origem: "sugestao",
    pessoaId: linha.pessoa_id,
    data: linha.data,
    tipo: linha.tipo,
    motivo: linha.motivo ?? "",
    horaReal: linha.hora_real ? horaSemSegundos(linha.hora_real) : null,
    anexos: [...(linha.anexos_nomes ?? [])],
    minutos: linha.minutos,
    periodoInicio: horaSemSegundos(linha.periodo_inicio),
    periodoFim: horaSemSegundos(linha.periodo_fim),
    deAtraso: linha.de_atraso,
    enviadaEm: linha.enviada_em,
    estado: linha.estado,
    decididaPor: linha.decidida_por_nome ?? (linha.decidida_em ? DECISOR_DESCONHECIDO : null),
    decididaEm: linha.decidida_em,
    motivoRecusa: linha.motivo_recusa,
    faltaId: linha.falta_id,
    mesFechado: linha.mes_fechado_na_decisao,
  };
}

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
