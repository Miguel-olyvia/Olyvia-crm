/**
 * O que o técnico pode responder, e o que acontece quando responde.
 *
 * Tudo aqui é função pura. O ecrã limita-se a desenhar o que estas funções
 * dizem — e a base volta a decidir o mesmo do lado de lá. Duplicar a regra é
 * de propósito: a do browser existe para responder já, a da base existe para
 * ser verdade. Quando discordarem, quem manda é a base.
 */

import type { EstadoTarefa, Funcao, TipoMedicao } from "./tipos";

/* ─────────────────────────── Quem pode responder ─────────────────────── */

export interface ContextoResposta {
  estadoOrdem: string;
  funcao: Funcao;
  atribuido: boolean;
}

export interface Permissao {
  pode: boolean;
  /** Porquê não. Escrito para ser lido em voz alta a quem está no local. */
  motivo?: string;
}

/**
 * Responder é executar, e só se executa uma ordem em curso.
 *
 * A mensagem diz o passo em falta, não só o impedimento. "Não podes responder"
 * deixa a pessoa parada; "Inicia a ordem para começar a responder" diz-lhe o
 * que carregar a seguir.
 */
export function podeResponder(ctx: ContextoResposta): Permissao {
  if (ctx.estadoOrdem !== "em_curso") {
    const passo: Record<string, string> = {
      por_aprovar: "Esta ordem ainda está por aprovar.",
      agendada: "Inicia a ordem para começares a responder.",
      pausada: "A ordem está em pausa. Retoma-a para continuar.",
      fechada: "A ordem já foi fechada. As respostas ficaram como estavam.",
      confirmada: "A ordem já foi confirmada pelo cliente.",
      cancelada: "A ordem foi cancelada.",
    };
    return {
      pode: false,
      motivo: passo[ctx.estadoOrdem] ?? "Só se responde a uma ordem em curso.",
    };
  }

  if (ctx.funcao === "tecnico" && !ctx.atribuido) {
    return {
      pode: false,
      motivo: "Esta ordem está atribuída a outra pessoa. Fala com quem a distribuiu.",
    };
  }

  return { pode: true };
}

/* ─────────────────────────────── Medições ────────────────────────────── */

export interface Leitura {
  id: string;
  medicaoDefId: string;
  nome: string;
  tipo: TipoMedicao;
  unidade: string | null;
  limiteMin: number | null;
  limiteMax: number | null;
  valorNum: number | null;
  valorTexto: string | null;
  opcaoId: string | null;
  conforme: boolean | null;
  lidaEm: string | null;
  corretivaOrdemId: string | null;
}

export type Veredicto = "conforme" | "nao_conforme" | "sem_veredicto";

/**
 * O veredicto de um valor, antes de o gravar.
 *
 * Serve para o ecrã dizer "isto vai ficar não conforme" enquanto a pessoa
 * ainda está a escrever, em vez de o revelar depois de gravar. É a mesma
 * regra que `ops_avaliar_leitura` aplica na base.
 */
export function veredictoDeGama(
  valor: number | null,
  min: number | null,
  max: number | null
): Veredicto {
  if (valor == null || Number.isNaN(valor)) return "sem_veredicto";
  if (min == null && max == null) return "sem_veredicto";
  if (min != null && valor < min) return "nao_conforme";
  if (max != null && valor > max) return "nao_conforme";
  return "conforme";
}

/** Um contador não desce. Se desceu, ou se leu mal ou o equipamento mudou. */
export function contadorRecuou(valor: number | null, anterior: number | null): boolean {
  if (valor == null || anterior == null || Number.isNaN(valor)) return false;
  return valor < anterior;
}

/** O que uma leitura ainda precisa para poder ser gravada. */
export function faltaParaGravar(
  tipo: TipoMedicao,
  entrada: { valorNum?: number | null; valorTexto?: string | null; opcaoId?: string | null }
): string | null {
  switch (tipo) {
    case "gama":
    case "acumulado":
      return entrada.valorNum == null || Number.isNaN(entrada.valorNum)
        ? "Falta o valor."
        : null;
    case "escolha":
      return entrada.opcaoId ? null : "Falta escolher uma opção.";
    case "texto":
      return entrada.valorTexto?.trim() ? null : "Falta escrever a resposta.";
  }
}

/* ──────────────────────── O estado de uma tarefa ─────────────────────── */

/**
 * O estado que a tarefa vai tomar quando a última leitura entrar.
 *
 * Devolve `null` enquanto faltarem leituras: nesse caso a tarefa fica como
 * está, e o ecrã não deve prometer nada.
 */
export function estadoPelasLeituras(leituras: readonly Leitura[]): EstadoTarefa | null {
  if (leituras.length === 0) return null;
  if (leituras.some((l) => l.lidaEm == null)) return null;
  return leituras.some((l) => l.conforme === false) ? "nao_conforme" : "feita";
}

export interface ResumoLeituras {
  total: number;
  porLer: number;
  naoConformes: number;
}

export function resumirLeituras(leituras: readonly Leitura[]): ResumoLeituras {
  return {
    total: leituras.length,
    porLer: leituras.filter((l) => l.lidaEm == null).length,
    naoConformes: leituras.filter((l) => l.conforme === false).length,
  };
}

/**
 * Uma tarefa com medições responde-se pelas medições; uma tarefa sem medições
 * responde-se à mão.
 *
 * Sem esta distinção o ecrã mostrava os dois caminhos ao mesmo tempo, e o
 * técnico tinha de adivinhar qual conta.
 */
export function comoSeResponde(leituras: readonly Leitura[]): "medicoes" | "veredicto" {
  return leituras.length > 0 ? "medicoes" : "veredicto";
}

/* ──────────────────────────── Progresso ──────────────────────────────── */

export interface ProgressoTarefas {
  total: number;
  respondidas: number;
  porResponder: number;
  naoConformes: number;
  percentagem: number;
  /** Obrigatórias ainda por responder — é o que trava o fecho da ordem. */
  obrigatoriasPorResponder: number;
}

export function progressoDeExecucao(
  tarefas: readonly { estado: EstadoTarefa; obrigatoria: boolean }[]
): ProgressoTarefas {
  const total = tarefas.length;
  const porResponder = tarefas.filter((t) => t.estado === "pendente").length;
  const respondidas = total - porResponder;
  return {
    total,
    respondidas,
    porResponder,
    naoConformes: tarefas.filter((t) => t.estado === "nao_conforme").length,
    percentagem: total === 0 ? 0 : Math.round((respondidas / total) * 100),
    obrigatoriasPorResponder: tarefas.filter((t) => t.obrigatoria && t.estado === "pendente")
      .length,
  };
}
