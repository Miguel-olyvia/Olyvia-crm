/**
 * Onde é que a ordem vai, do princípio ao fim.
 *
 * A ficha diz em que estado a ordem está — "Em curso" — e não diz o que já
 * ficou para trás nem o que falta. Quem abre uma ordem pela primeira vez não
 * tem como saber que depois de fechar ainda falta confirmar, e é exatamente aí
 * que as ordens ficam paradas: fechadas, à espera de uma confirmação que
 * ninguém sabe que existe.
 *
 * Cinco degraus, sempre os mesmos, sempre pela mesma ordem. O que muda é onde
 * está a marca.
 *
 * ⚠ Isto **não é a máquina de estados** — é o desenho dela. Quem decide o que
 * pode acontecer é `estados.ts`, e a última palavra é da base. Um degrau
 * pintado de verde não autoriza nada.
 */

import type { Estado } from "./tipos";

export type Situacao = "feito" | "atual" | "futuro" | "desviado";

export interface Degrau {
  chave: Estado;
  rotulo: string;
  /** O que falta acontecer para se passar deste degrau ao seguinte. */
  oQueFalta: string;
  situacao: Situacao;
}

/**
 * O caminho normal. A pausa não está aqui de propósito: pausar não avança nem
 * recua, é o mesmo degrau com o relógio parado — e um sexto degrau que às
 * vezes aparece e às vezes não faria a régua mudar de tamanho conforme o dia.
 */
const CAMINHO: { chave: Estado; rotulo: string; oQueFalta: string }[] = [
  {
    chave: "por_aprovar",
    rotulo: "Por aprovar",
    oQueFalta: "Quem coordena tem de aprovar o trabalho antes de ele ser marcado.",
  },
  {
    chave: "agendada",
    rotulo: "Agendada",
    oQueFalta: "Falta alguém iniciar a ordem — é isso que começa a contar o tempo.",
  },
  {
    chave: "em_curso",
    rotulo: "Em curso",
    oQueFalta: "Falta responder às tarefas obrigatórias e fechar.",
  },
  {
    chave: "fechada",
    rotulo: "Fechada",
    oQueFalta: "O trabalho está feito. Falta confirmar — é aí que o relatório sai.",
  },
  {
    chave: "confirmada",
    rotulo: "Confirmada",
    oQueFalta: "Acabou.",
  },
];

/**
 * Onde é que uma ordem está no caminho.
 *
 * Três casos que não são o caminho normal:
 *
 *  · **Pausada** — o degrau atual é "Em curso", porque é onde ela está mesmo.
 *    Quem lê vê a régua no sítio certo, e a etiqueta de estado ao lado diz que
 *    está parada. Duas informações, sem se contradizerem.
 *
 *  · **Cancelada** — o caminho acabou antes do fim. Os degraus por onde ela
 *    passou ficam feitos, e o resto marca-se `desviado`: nem futuro (não vai
 *    acontecer) nem feito (não aconteceu).
 *
 *  · **Uma ordem que nasceu já agendada** — as preventivas e as obras nascem
 *    aprovadas. "Por aprovar" fica `feito`, e não a piscar por trás.
 */
export function percursoDaOrdem(estado: Estado): Degrau[] {
  const referencia: Estado = estado === "pausada" ? "em_curso" : estado;
  const cancelada = estado === "cancelada";

  // Uma cancelada não tem sítio no caminho; o índice fica -1 e tudo o que vem
  // a seguir ao que ela chegou a ser conta como desviado.
  const atual = CAMINHO.findIndex((d) => d.chave === referencia);

  return CAMINHO.map((d, i) => {
    if (cancelada) {
      // Sem saber por onde passou, assume-se o mínimo: nasceu. É honesto —
      // o que se afirma é só o que se sabe.
      return { ...d, situacao: i === 0 ? ("feito" as Situacao) : ("desviado" as Situacao) };
    }
    if (atual < 0) return { ...d, situacao: "futuro" as Situacao };
    if (i < atual) return { ...d, situacao: "feito" as Situacao };
    if (i === atual) return { ...d, situacao: "atual" as Situacao };
    return { ...d, situacao: "futuro" as Situacao };
  });
}

/**
 * A frase que diz o que falta a seguir, ou `null` quando não falta nada.
 *
 * É a única coisa desta régua que se lê em voz alta. Uma ordem fechada há três
 * semanas à espera de confirmação passa a dizê-lo em português, no topo da
 * ficha, em vez de estar só pintada de verde.
 */
export function oQueFaltaAgora(estado: Estado): string | null {
  if (estado === "confirmada") return null;
  if (estado === "cancelada") return "Esta ordem foi cancelada. Não há nada a fazer.";
  if (estado === "pausada") return "Está em pausa. Falta retomar para continuar o trabalho.";
  return CAMINHO.find((d) => d.chave === estado)?.oQueFalta ?? null;
}
