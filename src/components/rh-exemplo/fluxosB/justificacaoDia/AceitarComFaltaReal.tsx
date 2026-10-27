/**
 * Aceitar uma justificação de dia cria a falta NA BASE, numa só chamada: `rpc_hr_justificacao_dia_decidir` marca a falta
 * (`rpc_hr_falta_marcar`, com «paga» ou «não paga» na coluna `remunerada`), regista a justificação dela como declaração
 * própria e decide-a como justificada (`rpc_hr_falta_decidir_justificacao`), tudo na mesma transacção, e devolve o id da falta
 * e se o mês do dia já estava fechado. Se qualquer passo falhar (sobreposição, ausência aprovada, horas trabalhadas) nada
 * fica escrito: já não existe o estado «falta marcada, justificação por decidir» nem a procura do id da falta recém-criada.
 *
 * É um componente (e não uma função) para manter o contrato com `useDecisaoDoDia`: monta-se enquanto a decisão dura e quem o
 * monta recebe o resultado em `aoConcluir` uma só vez. Não desenha nada.
 *
 * Idempotente na base: se a pessoa já tem uma falta activa nesse dia e hora, a RPC decide essa em vez de marcar outra (e recusa
 * com `justificacao_dia_falta_divergente` se a remuneração ou a hora de fim não coincidirem).
 */
import { useEffect, useRef } from "react";
import { useAccoesJustificacaoDia } from "@/components/rh-exemplo/hooks/useJustificacoesDoDia";
import type { DecisaoQueCriaFalta } from "@/components/rh-exemplo/lib/faltaDaAceitacao";
import type { JustificacaoDia } from "@/components/rh-exemplo/lib/justificacaoDia";

export interface ResultadoDaAceitacao {
  /** Uma chave de tradução ou a mensagem já escrita (o `t` devolve a própria cadeia se não conhece a chave); `null` = tudo feito. */
  erro: string | null;
  faltaId: string | null;
  /**
   * O dia pertence a um mês já fechado e a aceitação foi CONFIRMADA: a falta ficou marcada, mas o desconto só muda se o mês
   * for reaberto. Sem confirmação a base não aceita (erro `rhJust.erro.mesFechado`, nada escrito).
   */
  mesFechado: boolean;
}

interface Props {
  justificacao: JustificacaoDia;
  decisao: DecisaoQueCriaFalta;
  /** O RH já confirmou que aceita num mês fechado (a base exige-o). */
  confirmarMesFechado?: boolean;
  aoConcluir: (resultado: ResultadoDaAceitacao) => void;
}

export function AceitarComFaltaReal({ justificacao, decisao, confirmarMesFechado = false, aoConcluir }: Props) {
  const { decidir } = useAccoesJustificacaoDia();
  // A chamada corre uma só vez, mesmo que o efeito volte a correr (renderizações extra, modo estrito).
  const correu = useRef(false);
  const concluir = useRef(aoConcluir);
  concluir.current = aoConcluir;

  useEffect(() => {
    if (correu.current) return;
    correu.current = true;
    void decidir({ justificacaoId: justificacao.id, decisao, confirmarMesFechado }).then((r) =>
      concluir.current({ erro: r.erro, faltaId: r.faltaId, mesFechado: r.mesFechado }),
    );
  }, [decidir, justificacao.id, decisao, confirmarMesFechado]);

  return null;
}
