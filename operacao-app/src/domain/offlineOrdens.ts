/**
 * As respostas às tarefas de uma ordem dadas sem rede, por cima do que se
 * leu da base: o valor aparece já, marcado "por enviar". O veredicto
 * (conforme / não conforme) e a corretiva, esses, só a base os decide —
 * aparecem quando a resposta lá chegar.
 */
import type { MedicaoDaTarefa, TarefaDaOrdem } from "../lib/dados";
import type { AcaoOffline } from "../lib/offline/fila";

export interface OrdemComPendentes {
  tarefas: TarefaDaOrdem[];
  medicoes: MedicaoDaTarefa[];
  porEnviar: Set<string>;
  recusadas: Map<string, string>;
}

type ArgsResposta = {
  tarefaId: string;
  estado?: string | null;
  valorNum?: number | null;
  valorTexto?: string | null;
  observacoes?: string | null;
};
type ArgsMedicao = {
  tarefaId: string;
  medicaoDefId: string;
  valorNum?: number | null;
  valorTexto?: string | null;
  opcaoId?: string | null;
};

export function aplicarPendentesOrdem(
  tarefas: readonly TarefaDaOrdem[],
  medicoes: readonly MedicaoDaTarefa[],
  acoes: readonly AcaoOffline[]
): OrdemComPendentes {
  const ids = new Set(tarefas.map((t) => t.id));
  const porTarefa = new Map<string, ArgsResposta>();
  const porLeitura = new Map<string, ArgsMedicao & { em: string }>();
  const porEnviar = new Set<string>();
  const recusadas = new Map<string, string>();

  for (const a of acoes) {
    if (a.tipo !== "ordem_responder" && a.tipo !== "ordem_medicao") continue;
    const g = a.args as ArgsResposta & ArgsMedicao;
    if (!ids.has(g.tarefaId)) continue;
    porEnviar.add(g.tarefaId);
    if (a.estado === "conflito") {
      recusadas.set(g.tarefaId, a.erro ?? "A base recusou esta resposta.");
      continue;
    }
    if (a.tipo === "ordem_responder") porTarefa.set(g.tarefaId, { ...porTarefa.get(g.tarefaId), ...g });
    else porLeitura.set(`${g.tarefaId}|${g.medicaoDefId}`, { ...g, em: a.criadaEm });
  }

  return {
    tarefas: tarefas.map((t) => {
      const r = porTarefa.get(t.id);
      if (!r) return t;
      return {
        ...t,
        estado: r.estado ?? t.estado,
        valor_num: r.valorNum !== undefined ? r.valorNum : t.valor_num,
        valor_texto: r.valorTexto !== undefined ? r.valorTexto : t.valor_texto,
        observacoes: r.observacoes !== undefined ? r.observacoes : t.observacoes,
      };
    }),
    medicoes: medicoes.map((m) => {
      const r = porLeitura.get(`${m.ordem_tarefa_id}|${m.medicao_def_id}`);
      if (!r) return m;
      return {
        ...m,
        valor_num: r.valorNum ?? null,
        valor_texto: r.valorTexto ?? null,
        opcao_id: r.opcaoId ?? null,
        conforme: null,
        lida_em: r.em,
      };
    }),
    porEnviar,
    recusadas,
  };
}
