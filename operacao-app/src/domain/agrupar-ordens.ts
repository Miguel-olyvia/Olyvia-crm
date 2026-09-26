/**
 * Uma lista de ordens partida por quando é que o trabalho é.
 *
 * Setenta linhas seguidas, todas com o mesmo peso visual, obrigam a ler a data
 * de cada uma para saber o que é de hoje. O olho não faz isso: percorre até
 * desistir. Partir a lista em "Atrasadas · Hoje · Amanhã · Esta semana · Mais
 * tarde · Sem data" responde à primeira pergunta — *o que é que tenho de fazer
 * agora?* — antes de se ler uma única linha.
 *
 * **Só agrupa quando a ordenação é por data.** Ordenada por prioridade, a
 * lista está a responder a outra pergunta, e cabeçalhos de dia por cima de uma
 * lista ordenada por urgência seriam duas respostas contraditórias no mesmo
 * ecrã.
 *
 * Puro de propósito: nada aqui sabe o que é React nem o que é uma base de
 * dados.
 */

import { estaAtrasada } from "./estados";
import type { Estado } from "./tipos";
import type { OrdemFiltravel } from "./filtros-de-ordens";

export type ChaveDeGrupo =
  | "atrasadas"
  | "hoje"
  | "amanha"
  | "esta_semana"
  | "depois"
  | "passadas"
  | "sem_data";

export interface Grupo<T> {
  chave: ChaveDeGrupo;
  rotulo: string;
  /** O que a faixa quer dizer, para quem passa o rato. */
  explicacao: string;
  ordens: T[];
}

/**
 * A ordem por que as faixas aparecem, e o que cada uma quer dizer.
 *
 * "Atrasadas" vem primeiro porque é a única que já custou alguma coisa a
 * alguém. "Sem data" vem em último, e não em primeiro: é trabalho por marcar,
 * não trabalho por fazer hoje — e pô-lo em cima empurrava o dia para baixo.
 */
const FAIXAS: { chave: ChaveDeGrupo; rotulo: string; explicacao: string }[] = [
  {
    chave: "atrasadas",
    rotulo: "Atrasadas",
    explicacao: "A data marcada já passou e a ordem continua por fechar.",
  },
  { chave: "hoje", rotulo: "Hoje", explicacao: "Marcadas para hoje." },
  { chave: "amanha", rotulo: "Amanhã", explicacao: "Marcadas para amanhã." },
  {
    chave: "esta_semana",
    rotulo: "Até domingo",
    explicacao: "O resto desta semana, que acaba ao domingo.",
  },
  { chave: "depois", rotulo: "Mais tarde", explicacao: "Marcadas para depois desta semana." },
  {
    chave: "passadas",
    rotulo: "Já passou",
    explicacao:
      "A data já lá vai, e a ordem não está atrasada — ou já acabou, ou está em pausa.",
  },
  {
    chave: "sem_data",
    rotulo: "Sem data",
    explicacao: "Ainda ninguém disse quando é. É trabalho por marcar.",
  },
];

/** Meia-noite do dia a que uma data pertence. */
function meiaNoite(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Dias inteiros de calendário entre dois instantes. */
function diasDeCalendario(de: Date, ate: Date): number {
  return Math.round((meiaNoite(ate).getTime() - meiaNoite(de).getTime()) / 86_400_000);
}

/**
 * Quantos dias faltam para domingo, contando a partir de hoje.
 *
 * A semana acaba ao domingo — é a convenção que a agenda já usa
 * (`inicioDaSemana` conta de segunda). Num domingo, `restaDaSemana` é zero e a
 * faixa "Até domingo" fica vazia, que é o correto: já não resta semana.
 */
function restaDaSemana(agora: Date): number {
  return (7 - agora.getDay()) % 7;
}

/**
 * A que faixa pertence uma ordem.
 *
 * Uma ordem já fechada nunca é "atrasada", mesmo com a data no passado: o
 * trabalho aconteceu, e marcá-la a vermelho no histórico seria acusar alguém
 * de uma coisa que já está feita. Vai para "Já passou" — que é a única coisa
 * verdadeira que se pode dizer dela.
 *
 * Isso vale também para uma pausada com a data ultrapassada: parou, não se
 * atrasou. O aviso de "retoma ultrapassada" é que trata desse caso, e trata-o
 * na linha, onde se vê a razão da pausa.
 */
export function grupoDaOrdem(
  o: { estado: string; agendada_para: string | null },
  agora: Date
): ChaveDeGrupo {
  if (!o.agendada_para) return "sem_data";

  const quando = new Date(o.agendada_para);
  if (Number.isNaN(quando.getTime())) return "sem_data";

  if (estaAtrasada(o.estado as Estado, quando, agora)) return "atrasadas";

  const dias = diasDeCalendario(agora, quando);
  if (dias < 0) return "passadas";
  if (dias === 0) return "hoje";
  if (dias === 1) return "amanha";
  if (dias <= restaDaSemana(agora)) return "esta_semana";
  return "depois";
}

/**
 * A lista partida em faixas, pela ordem em que se lêem.
 *
 * As faixas vazias não aparecem. Uma secção "Atrasadas" com zero linhas é
 * ruído com ar de aviso — e num dia sem atrasos é precisamente a ausência da
 * faixa que dá a boa notícia.
 *
 * Não reordena nada: entra a lista já ordenada e cada ordem cai na sua faixa
 * pela ordem em que vinha. Ordenar aqui outra vez daria duas ordenações a
 * discutir uma com a outra.
 */
export function agruparPorQuando<T extends OrdemFiltravel>(
  ordens: readonly T[],
  agora: Date = new Date()
): Grupo<T>[] {
  const caixas = new Map<ChaveDeGrupo, T[]>();
  for (const o of ordens) {
    const chave = grupoDaOrdem(o, agora);
    const caixa = caixas.get(chave);
    if (caixa) caixa.push(o);
    else caixas.set(chave, [o]);
  }

  return FAIXAS.filter((f) => (caixas.get(f.chave)?.length ?? 0) > 0).map((f) => ({
    ...f,
    ordens: caixas.get(f.chave)!,
  }));
}
