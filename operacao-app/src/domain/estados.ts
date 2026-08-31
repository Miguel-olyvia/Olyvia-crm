/**
 * Máquina de estados da ordem de trabalho.
 *
 * UMA máquina para as três origens. No Infraspeak há duas — Ocorrência e
 * Pedido — com nomes de estado diferentes para as mesmas coisas, dois ecrãs e
 * dois catálogos de motivos de pausa. Não é uma diferença de negócio: é o
 * resultado de terem renomeado o produto por cima do modelo antigo.
 *
 * Funções puras. Não sabem que existe base de dados, e por isso testam-se sem
 * infraestrutura nenhuma.
 *
 * ⚠ Isto é a regra, não a fechadura. A imposição real tem de estar na base de
 * dados: enquanto as transições forem escritas pelo cliente, quem tiver o
 * token consegue contorná-las. Ver `db/schema.sql`, secção 11.2.
 */

import type { Estado, EstadoTarefa, Funcao } from "./tipos";

export const TRANSICOES = [
  "aprovar",
  "rejeitar",
  "iniciar",
  "pausar",
  "retomar",
  "fechar",
  "reabrir",
  "confirmar",
  "cancelar",
] as const;
export type Transicao = (typeof TRANSICOES)[number];

export interface TarefaMinima {
  estado: EstadoTarefa;
  obrigatoria: boolean;
}

export interface Contexto {
  funcao: Funcao;
  /** O utilizador é responsável pela ordem ou está na equipa dela. */
  atribuido: boolean;
  tarefas?: readonly TarefaMinima[];
  motivo?: string | null;
  retomaPrevista?: Date | null;
}

/** Ou avança, ou diz porque não. Nunca falha em silêncio. */
export type Decisao =
  | { ok: true; para: Estado }
  | { ok: false; motivo: string };

interface Regra {
  de: readonly Estado[];
  para: Estado;
  funcoes: readonly Funcao[];
  guarda?: (ctx: Contexto) => string | null;
}

const GESTAO: readonly Funcao[] = ["admin", "gestor"];
const GESTAO_E_OPERADOR: readonly Funcao[] = ["admin", "gestor", "operador"];
const TODOS: readonly Funcao[] = ["admin", "gestor", "operador", "tecnico"];

/** Só o técnico é limitado pela atribuição; quem gere vê e age em tudo. */
function exigeAtribuicao(ctx: Contexto, acao: string): string | null {
  if (ctx.funcao !== "tecnico") return null;
  return ctx.atribuido ? null : `Só quem está na ordem a pode ${acao}.`;
}

export const REGRAS: Record<Transicao, Regra> = {
  aprovar: {
    de: ["por_aprovar"],
    para: "agendada",
    funcoes: GESTAO,
  },

  rejeitar: {
    de: ["por_aprovar"],
    para: "cancelada",
    funcoes: GESTAO,
    guarda: (c) => (c.motivo?.trim() ? null : "Rejeitar exige um motivo."),
  },

  iniciar: {
    de: ["agendada"],
    para: "em_curso",
    funcoes: TODOS,
    guarda: (c) => exigeAtribuicao(c, "iniciar"),
  },

  // Pausar exige motivo E retoma prevista. No Infraspeak vi ordens pausadas
  // sem previsão de retoma e ordens em curso paradas há meses, sem alerta.
  pausar: {
    de: ["em_curso"],
    para: "pausada",
    funcoes: TODOS,
    guarda: (c) => {
      const falta = exigeAtribuicao(c, "pausar");
      if (falta) return falta;
      if (!c.motivo?.trim()) return "Pausar exige um motivo.";
      if (!c.retomaPrevista) return "Pausar exige uma data de retoma prevista.";
      return null;
    },
  },

  retomar: {
    de: ["pausada"],
    para: "em_curso",
    funcoes: TODOS,
    guarda: (c) => exigeAtribuicao(c, "retomar"),
  },

  // Fechar exige que nenhuma tarefa obrigatória fique por responder.
  // "Não aplicável" conta como resposta; "pendente" não.
  fechar: {
    de: ["em_curso"],
    para: "fechada",
    funcoes: TODOS,
    guarda: (c) => {
      const falta = exigeAtribuicao(c, "fechar");
      if (falta) return falta;
      const porResponder = (c.tarefas ?? []).filter(
        (t) => t.obrigatoria && t.estado === "pendente"
      ).length;
      if (porResponder > 0) {
        return porResponder === 1
          ? "Falta responder a 1 tarefa obrigatória."
          : `Faltam responder a ${porResponder} tarefas obrigatórias.`;
      }
      return null;
    },
  },

  confirmar: {
    de: ["fechada"],
    para: "confirmada",
    funcoes: GESTAO,
  },

  reabrir: {
    de: ["fechada"],
    para: "em_curso",
    funcoes: GESTAO,
  },

  cancelar: {
    de: ["por_aprovar", "agendada", "em_curso", "pausada"],
    para: "cancelada",
    funcoes: GESTAO_E_OPERADOR,
    guarda: (c) => (c.motivo?.trim() ? null : "Cancelar exige um motivo."),
  },
};

/** Avalia uma transição. Devolve o estado de destino ou a razão da recusa. */
export function avaliar(
  estado: Estado,
  transicao: Transicao,
  ctx: Contexto
): Decisao {
  const regra = REGRAS[transicao];
  if (!regra) return { ok: false, motivo: "Transição desconhecida." };

  if (!regra.de.includes(estado)) {
    return {
      ok: false,
      motivo: `Não é possível ${transicao} uma ordem ${estado.replace("_", " ")}.`,
    };
  }

  if (!regra.funcoes.includes(ctx.funcao)) {
    return { ok: false, motivo: "Sem permissão para esta ação." };
  }

  const recusa = regra.guarda?.(ctx);
  if (recusa) return { ok: false, motivo: recusa };

  return { ok: true, para: regra.para };
}

/** As transições possíveis a partir daqui — para desenhar os botões. */
export function transicoesPossiveis(
  estado: Estado,
  ctx: Contexto
): Transicao[] {
  return TRANSICOES.filter((t) => avaliar(estado, t, ctx).ok);
}

/**
 * "Atrasada" é um badge, não um estado.
 *
 * Esta distinção é a razão de o Infraspeak ter uma lista de estados e um
 * conjunto separado de badges que não conversam: lá, uma ordem pode estar
 * "Agendada" e mostrar "ATRASADA" ao mesmo tempo, sem que nada o registe.
 */
export function estaAtrasada(
  estado: Estado,
  agendadaPara: Date | null,
  agora: Date = new Date()
): boolean {
  if (estado !== "agendada" && estado !== "em_curso") return false;
  if (!agendadaPara) return false;
  return agendadaPara.getTime() < agora.getTime();
}
