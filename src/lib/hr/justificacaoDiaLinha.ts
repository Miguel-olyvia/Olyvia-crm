/**
 * Uma linha de `rpc_hr_justificacao_dia_listar` como justificacao do ecra (`JustificacaoDia`). Fica aqui, e nao no wrapper
 * `rh-exemplo/hooks/useJustificacoesDoDia`, para a fila de trabalho a usar sem depender de um wrapper (que os testes trocam).
 * O wrapper reexporta estas duas funcoes: quem as importava de la nao muda.
 */
import { horaSemSegundos, type JustificacaoDiaLinha } from "@/lib/hr/justificacaoDia";
import type { JustificacaoDia } from "@/components/rh-exemplo/lib/justificacaoDia";

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
