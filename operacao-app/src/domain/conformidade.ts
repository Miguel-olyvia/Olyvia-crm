/**
 * Conformidade das tarefas, e a corretiva que nasce de uma não conformidade.
 *
 * Fecha o ciclo inspeção → reparação. No Infraspeak esse ciclo não fecha: o
 * histórico dos ativos está cheio de relatos escritos pelos técnicos — portões
 * avariados, geradores que não arrancam — que nunca viraram ordem nenhuma,
 * porque não havia nada que os transformasse em trabalho.
 */

import type { EstadoTarefa, TipoTarefa } from "./tipos";

export interface Tarefa {
  id: string;
  nome: string;
  tipo: TipoTarefa;
  estado: EstadoTarefa;
  obrigatoria: boolean;
  valorNum?: number | null;
  unidade?: string | null;
  limiteMin?: number | null;
  limiteMax?: number | null;
  observacoes?: string | null;
}

/**
 * Uma medição fora dos limites é não conformidade sem ninguém ter de decidir.
 * 31 °C num limite de 16–24 é não conforme, e a ordem que daí nasce explica
 * porquê.
 */
export function avaliarMedicao(t: {
  valorNum?: number | null;
  limiteMin?: number | null;
  limiteMax?: number | null;
}): EstadoTarefa | null {
  if (t.valorNum == null) return null;
  if (t.limiteMin != null && t.valorNum < t.limiteMin) return "nao_conforme";
  if (t.limiteMax != null && t.valorNum > t.limiteMax) return "nao_conforme";
  return "feita";
}

/** Progresso de uma lista de tarefas: respondidas / total. */
export function progresso(tarefas: readonly Tarefa[]): {
  feitas: number;
  total: number;
  percentagem: number;
  naoConformes: number;
} {
  const total = tarefas.length;
  const feitas = tarefas.filter((t) => t.estado !== "pendente").length;
  const naoConformes = tarefas.filter((t) => t.estado === "nao_conforme").length;
  return {
    feitas,
    total,
    percentagem: total === 0 ? 0 : Math.round((feitas / total) * 100),
    naoConformes,
  };
}

/** As tarefas obrigatórias que ainda impedem o fecho. */
export function porResponder(tarefas: readonly Tarefa[]): Tarefa[] {
  return tarefas.filter((t) => t.obrigatoria && t.estado === "pendente");
}

export interface RascunhoCorretiva {
  titulo: string;
  descricao: string;
  origem: "corretiva";
  prioridade: "alta";
}

/**
 * O rascunho da ordem corretiva que uma tarefa não conforme gera.
 *
 * Herda o contexto — o que falhou, onde, e o que o técnico escreveu — para que
 * quem receber a ordem nova não tenha de ir procurar. A descrição diz o valor
 * medido e o limite violado, porque "não conforme" sozinho não chega para
 * ninguém agir.
 */
export function rascunhoCorretiva(
  tarefa: Tarefa,
  contexto: { local?: string | null; ativo?: string | null }
): RascunhoCorretiva {
  const onde = [contexto.ativo, contexto.local].filter(Boolean).join(" — ");
  const linhas: string[] = [`Não conformidade detetada em "${tarefa.nome}".`];

  if (tarefa.valorNum != null) {
    const unidade = tarefa.unidade ? ` ${tarefa.unidade}` : "";
    const limites: string[] = [];
    if (tarefa.limiteMin != null) limites.push(`mín. ${tarefa.limiteMin}${unidade}`);
    if (tarefa.limiteMax != null) limites.push(`máx. ${tarefa.limiteMax}${unidade}`);
    linhas.push(
      limites.length > 0
        ? `Valor lido: ${tarefa.valorNum}${unidade} (${limites.join(", ")}).`
        : `Valor lido: ${tarefa.valorNum}${unidade}.`
    );
  }

  if (tarefa.observacoes?.trim()) {
    linhas.push(`Observações do técnico: ${tarefa.observacoes.trim()}`);
  }

  return {
    titulo: onde ? `${tarefa.nome} — ${onde}` : tarefa.nome,
    descricao: linhas.join("\n"),
    origem: "corretiva",
    prioridade: "alta",
  };
}
