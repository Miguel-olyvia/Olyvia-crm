// Lógica pura das perguntas de escolha rápida de "Novo negócio" (Qualificação e Visita): o que está visível, as
// contagens "n de m", alternar uma resposta (tocar de novo desseleciona) e a conversão para o texto que o negócio leva.
import type { RespostaNegocio, SeccaoVisitaNegocio } from "./negocioMetas";
import type { BlocoDef, PerguntaDef, Respostas, SeccaoDef } from "./perguntasTipos";

/** As chaves de tradução (depois do prefixo `businessGoals.new.`) de cada texto das perguntas. */
export const chaveSeccao = (id: string): string => `sec.${id}`;
export const chaveBloco = (id: string): string => `block.${id}`;
export const chavePergunta = (id: string): string => `q.${id}`;
export const chaveOpcao = (pergunta: string, opcao: string): string => `q.${pergunta}.${opcao}`;

/** Uma pergunta condicional só aparece (e só conta) quando a resposta de que depende é uma das pedidas. */
export function perguntaVisivel(p: PerguntaDef, respostas: Respostas): boolean {
  return !p.se || p.se.valores.includes(respostas[p.se.pergunta] ?? "");
}

export const perguntasDosBlocos = (blocos: readonly BlocoDef[]): PerguntaDef[] => blocos.flatMap((b) => b.perguntas);

/** As perguntas que se veem agora, pela ordem do ecrã. */
export function perguntasVisiveis(blocos: readonly BlocoDef[], respostas: Respostas): PerguntaDef[] {
  return perguntasDosBlocos(blocos).filter((p) => perguntaVisivel(p, respostas));
}

export interface Contagem {
  respondidas: number;
  total: number;
}

/** Quantas das perguntas visíveis têm resposta (uma resposta que já não é uma opção desta pergunta não conta). */
export function contarRespostas(blocos: readonly BlocoDef[], respostas: Respostas): Contagem {
  const visiveis = perguntasVisiveis(blocos, respostas);
  const respondidas = visiveis.filter((p) => p.opcoes.some(([chave]) => chave === respostas[p.id])).length;
  return { respondidas, total: visiveis.length };
}

export const contarSeccao = (seccao: SeccaoDef, respostas: Respostas): Contagem => contarRespostas(seccao.blocos, respostas);

export function contarTotal(seccoes: readonly SeccaoDef[], respostas: Respostas): Contagem {
  return contarRespostas(seccoes.flatMap((s) => s.blocos), respostas);
}

/** Uma secção está feita quando tem perguntas e todas as visíveis estão respondidas. */
export function seccaoCompleta(seccao: SeccaoDef, respostas: Respostas): boolean {
  const { respondidas, total } = contarSeccao(seccao, respostas);
  return total > 0 && respondidas === total;
}

/** Tira as respostas a perguntas que deixaram de estar visíveis (repete até estabilizar, porque podem encadear). */
export function limparOcultas(blocos: readonly BlocoDef[], respostas: Respostas): Respostas {
  const todas = perguntasDosBlocos(blocos);
  let atual = respostas;
  for (let volta = 0; volta <= todas.length; volta += 1) {
    const ocultas = todas.filter((p) => atual[p.id] !== undefined && !perguntaVisivel(p, atual));
    if (ocultas.length === 0) return atual;
    atual = Object.fromEntries(Object.entries(atual).filter(([id]) => !ocultas.some((p) => p.id === id)));
  }
  return atual;
}

/** Escolhe uma opção; tocar na que já está escolhida desseleciona-a. Devolve um objeto novo. */
export function alternarResposta(blocos: readonly BlocoDef[], respostas: Respostas, pergunta: string, opcao: string): Respostas {
  const { [pergunta]: atual, ...resto } = respostas;
  return limparOcultas(blocos, atual === opcao ? resto : { ...resto, [pergunta]: opcao });
}

type Traduzir = (chave: string) => string;

/** As respostas visíveis de uns blocos, em texto (pergunta e resposta, na língua em que se criou). */
export function respostasEmTexto(blocos: readonly BlocoDef[], respostas: Respostas, t: Traduzir): RespostaNegocio[] {
  return perguntasVisiveis(blocos, respostas)
    .filter((p) => p.opcoes.some(([chave]) => chave === respostas[p.id]))
    .map((p) => ({ pergunta: t(chavePergunta(p.id)), resposta: t(chaveOpcao(p.id, respostas[p.id])) }));
}

/** A Visita em texto: só as secções com alguma resposta. */
export function visitaEmTexto(seccoes: readonly SeccaoDef[], respostas: Respostas, t: Traduzir): SeccaoVisitaNegocio[] {
  return seccoes
    .map((s) => ({ titulo: t(chaveSeccao(s.id)), respostas: respostasEmTexto(s.blocos, respostas, t) }))
    .filter((s) => s.respostas.length > 0);
}

/** Os textos de uma lista de blocos, para as traduções: chave sem prefixo → [pt, en]. */
export function textosDosBlocos(blocos: readonly BlocoDef[]): Record<string, readonly [string, string]> {
  const saida: Record<string, readonly [string, string]> = {};
  for (const b of blocos) {
    if (b.titulo) saida[chaveBloco(b.id)] = b.titulo;
    for (const p of b.perguntas) {
      saida[chavePergunta(p.id)] = p.rotulo;
      for (const [chave, pt, en] of p.opcoes) saida[chaveOpcao(p.id, chave)] = [pt, en];
    }
  }
  return saida;
}
