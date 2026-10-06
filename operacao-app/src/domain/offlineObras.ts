/**
 * O que o técnico vê enquanto as ações feitas sem rede não chegam à base:
 * a lista lida da última vez, com as ações por enviar aplicadas por cima.
 *
 * Só o que se sabe sem a base: o estado da tarefa e o relógio. Os minutos
 * acertam-se quando a rede voltar e a lista for lida outra vez.
 */
import type { RegistoObra, TarefaObra } from "../lib/obras";
import type { AcaoOffline } from "../lib/offline/fila";

export interface VistaComPendentes {
  tarefas: TarefaObra[];
  aberto: RegistoObra | null;
  /** Por tarefa: quantas ações ainda não chegaram à base. */
  porEnviar: Map<string, number>;
  /** Por tarefa: a mensagem da base, se recusou alguma. */
  recusadas: Map<string, string>;
}

export function aplicarPendentesObra(
  tarefas: readonly TarefaObra[],
  aberto: RegistoObra | null,
  acoes: readonly AcaoOffline[],
  euId: string
): VistaComPendentes {
  const porId = new Map(tarefas.map((t) => [t.id, { ...t }]));
  let relogio = aberto ? { ...aberto } : null;
  const porEnviar = new Map<string, number>();
  const recusadas = new Map<string, string>();

  for (const a of acoes) {
    if (!a.tipo.startsWith("obra_") || a.tipo === "obra_foto") continue;
    const tarefaId = (a.args as { tarefaId?: string }).tarefaId;
    const t = tarefaId ? porId.get(tarefaId) : undefined;
    if (!t) continue;
    porEnviar.set(t.id, (porEnviar.get(t.id) ?? 0) + 1);
    if (a.estado === "conflito") {
      recusadas.set(t.id, a.erro ?? "A base recusou esta ação.");
      continue; // o que a base recusou não se mostra como feito
    }
    if (a.tipo === "obra_iniciar") {
      t.estado = "em_curso";
      t.a_correr = Math.max(1, t.a_correr);
      relogio = { id: `local-${a.id}`, obra_id: t.obra_id, tarefa_id: t.id, utilizador_id: euId, inicio: a.criadaEm, fim: null };
    } else if (a.tipo === "obra_pausar") {
      t.a_correr = Math.max(0, t.a_correr - 1);
      if (relogio?.tarefa_id === t.id) relogio = null;
    } else if (a.tipo === "obra_concluir") {
      t.estado = "feita";
      t.a_correr = 0;
      if (relogio?.tarefa_id === t.id) relogio = null;
    }
  }

  return {
    tarefas: tarefas.map((t) => porId.get(t.id)!),
    aberto: relogio,
    porEnviar,
    recusadas,
  };
}
