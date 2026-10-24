// O estado da agenda de um diálogo de visita ligado à base (Marcar e Alterar): lê os quadros e os recursos, parte das escolhas por omissão (ou
// das da visita, ao alterar), e pergunta ao pré-aviso se há conflito de horário. Só o que o utilizador (ou a visita) escolheu fica guardado; o que
// vem por omissão deriva-se, por isso quando os quadros chegam o diálogo já os mostra sem efeitos nem estados a mais.
import { useState } from "react";
import { useAgendaVisita, type AgendaVisitaLida } from "@/hooks/pessoas/useAgendaVisita";
import { useConflitoVisita, type ConflitoVisita } from "@/hooks/pessoas/useConflitoVisita";
import { DURACAO_POR_OMISSAO, intervaloDaVisita, type ValorAgenda } from "./agendaVisitaForm";

/** O que já vem escolhido (a visita que se altera); `undefined` quer dizer «por omissão». */
export type EscolhasIniciais = Partial<ValorAgenda>;

interface Opcoes {
  /** O `anew_users.id` do responsável da pessoa: o recurso dele é o escolhido por omissão. */
  responsavelUserId: string | null;
  inicial?: EscolhasIniciais;
  /** A visita que se altera: não conflitua consigo mesma. */
  excluirId?: string | null;
}

export interface FormAgenda {
  agenda: AgendaVisitaLida;
  valor: ValorAgenda;
  mudar: (parcial: Partial<ValorAgenda>) => void;
  conflito: ConflitoVisita;
  /** O recurso que a base recusou (NG010); sai quando se muda o horário ou os recursos. */
  recusado: string | null;
  recusar: (recursoId: string | null) => void;
}

export function useFormAgendaVisita({ responsavelUserId, inicial, excluirId = null }: Opcoes): FormAgenda {
  const agenda = useAgendaVisita(responsavelUserId);
  const [escolhas, setEscolhas] = useState<EscolhasIniciais>(inicial ?? {});
  const [recusado, setRecusado] = useState<string | null>(null);
  const { omissao } = agenda;
  const valor: ValorAgenda = {
    boardId: escolhas.boardId !== undefined ? escolhas.boardId : omissao.boardId,
    recursos: escolhas.recursos ?? (omissao.recursoId ? [omissao.recursoId] : []),
    data: escolhas.data ?? "",
    hora: escolhas.hora ?? "",
    duracao: escolhas.duracao ?? DURACAO_POR_OMISSAO,
    duracaoMinutos: escolhas.duracaoMinutos,
  };
  const intervalo = intervaloDaVisita(valor);
  const conflito = useConflitoVisita(valor.recursos, intervalo?.inicio ?? null, intervalo?.fim ?? null, excluirId);
  const mudar = (parcial: Partial<ValorAgenda>): void => {
    setEscolhas((antes) => ({ ...antes, ...parcial }));
    // A recusa era deste horário e destes recursos: mudar qualquer um deixa de a valer.
    if ("data" in parcial || "hora" in parcial || "duracao" in parcial || "recursos" in parcial) setRecusado(null);
  };
  return { agenda, valor, mudar, conflito, recusado, recusar: setRecusado };
}
