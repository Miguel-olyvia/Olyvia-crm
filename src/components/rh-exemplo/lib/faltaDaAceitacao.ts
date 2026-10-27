/**
 * O que a base precisa para a falta que a aceitação de uma justificação de dia cria. Funções puras: quem as usa é o
 * executor (`AceitarComFaltaReal`), que chama `rpc_hr_falta_marcar` (com a justificação registada) e depois
 * `rpc_hr_falta_decidir_justificacao` pelo hook real de assiduidade da pessoa.
 *
 * «Paga» e «não paga» é a coluna `remunerada` da falta, escolhida ao marcar: a decisão da justificação só diz «justificada»
 * ou «recusada». Aceitar nunca desconta do saldo (`desconta_saldo` fica falso).
 */
import type { DecisaoJustificacaoDia, JustificacaoDia, TipoJustificacaoDia } from "@/components/rh-exemplo/lib/justificacaoDia";
import type { MotivoFalta } from "@/components/rh-exemplo/tiposAssiduidade";

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

/** Os argumentos de `marcarFalta` do hook real para a falta desta justificação, já com a justificação a registar. */
export function argumentosDaFalta(j: JustificacaoDia, decisao: DecisaoQueCriaFalta) {
  return {
    data: j.data,
    horaInicio: j.periodoInicio,
    horaFim: j.periodoFim,
    motivoCodigo: j.deAtraso ? ("atraso" as const) : MOTIVO_DA_FALTA[j.tipo],
    remunerada: decisao === "aceitar_paga",
    descontaSaldo: false,
    justificacao: {
      tipoDocumento: null,
      documentoRef: null,
      texto: j.motivo,
      entidadeEmissora: null,
      dataDocumento: null,
      diasAtestados: null,
    },
  };
}

/** Compara horas «HH:MM» com «HH:MM:SS»: a base devolve segundos, a justificação guarda só horas e minutos. */
const hhmm = (hora: string): string => hora.slice(0, 5);

/**
 * A falta que ACABOU de ser criada, entre as faltas lidas depois de marcar: a que não existia antes, no mesmo dia e com a
 * mesma hora de início. `marcarFalta` não devolve o id, por isso é assim que se chega a ele.
 */
export function faltaCriada<F extends { id: string; data: string; hora_inicio: string; estado: string }>(
  depois: readonly F[],
  idsAntes: ReadonlySet<string>,
  j: Pick<JustificacaoDia, "data" | "periodoInicio">,
): F | null {
  return (
    depois.find(
      (f) => !idsAntes.has(f.id) && f.estado === "activa" && f.data === j.data && hhmm(f.hora_inicio) === hhmm(j.periodoInicio),
    ) ?? null
  );
}

/**
 * A falta ACTIVA que ja existe no mesmo dia e a mesma hora de inicio: aceitar volta a ela em vez de marcar outra (um recarregar,
 * ou uma aceitacao que ficou a meio depois de marcar, nao pode duplicar a falta nem descontar duas vezes).
 */
export function faltaActivaDoDia<F extends { id: string; data: string; hora_inicio: string; estado: string }>(
  faltas: readonly F[],
  j: Pick<JustificacaoDia, "data" | "periodoInicio">,
): F | null {
  return faltas.find((f) => f.estado === "activa" && f.data === j.data && hhmm(f.hora_inicio) === hhmm(j.periodoInicio)) ?? null;
}

/** So uma pessoa real (id UUID da base) pode receber uma falta; as justificacoes de exemplo em memoria tem ids como "p-ines". */
export const ehPessoaDaBase = (pessoaId: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pessoaId);
