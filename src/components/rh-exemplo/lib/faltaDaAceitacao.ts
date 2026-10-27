/**
 * O que a aceitação de uma justificação de dia precisa de saber da falta que cria. Funções puras.
 *
 * Quem cria a falta é a base: `rpc_hr_justificacao_dia_decidir` chama `rpc_hr_falta_marcar`, regista a justificação dela e
 * decide-a como justificada, numa só transacção (ver `AceitarComFaltaReal`). Já não é o browser que marca, procura o id da
 * falta recém-criada e decide: por isso `argumentosDaFalta` e `faltaCriada` saíram daqui.
 *
 * «Paga» e «não paga» é a coluna `remunerada` da falta, escolhida ao marcar: a decisão da justificação só diz «justificada»
 * ou «recusada». Aceitar nunca desconta do saldo (`desconta_saldo` fica falso).
 */
import type { DecisaoJustificacaoDia, JustificacaoDia, TipoJustificacaoDia } from "@/components/rh-exemplo/lib/justificacaoDia";
import type { MotivoFalta } from "@/components/rh-exemplo/tiposAssiduidade";

/** O motivo da falta por tipo de justificação (a mesma tabela que a RPC aplica; um atraso usa sempre «atraso»). */
export const MOTIVO_DA_FALTA: Record<TipoJustificacaoDia, MotivoFalta> = {
  consulta_medica: "doenca",
  transporte: "outro",
  assunto_pessoal: "assuntos_pessoais",
  outro: "outro",
};

/** As decisões que criam falta: recusar não cria nada. */
export type DecisaoQueCriaFalta = Exclude<DecisaoJustificacaoDia, "recusar">;

export function criaFalta(decisao: DecisaoJustificacaoDia): decisao is DecisaoQueCriaFalta {
  return decisao !== "recusar";
}

/** Compara horas «HH:MM» com «HH:MM:SS»: a base devolve segundos, a justificação guarda só horas e minutos. */
const hhmm = (hora: string): string => hora.slice(0, 5);

/**
 * A falta ACTIVA que já existe no mesmo dia e a mesma hora de início: aceitar volta a ela em vez de marcar outra (um
 * recarregar, ou uma aceitação repetida, não pode duplicar a falta nem descontar duas vezes). É a mesma procura que a RPC
 * de decisão faz do lado da base; aqui serve para o ecrã saber, antes de decidir, que a aceitação vai reutilizar a falta.
 */
export function faltaActivaDoDia<F extends { id: string; data: string; hora_inicio: string; estado: string }>(
  faltas: readonly F[],
  j: Pick<JustificacaoDia, "data" | "periodoInicio">,
): F | null {
  return faltas.find((f) => f.estado === "activa" && f.data === j.data && hhmm(f.hora_inicio) === hhmm(j.periodoInicio)) ?? null;
}
