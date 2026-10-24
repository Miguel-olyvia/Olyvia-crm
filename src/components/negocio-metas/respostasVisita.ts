// Lógica pura das perguntas de escolha rápida de "Novo negócio" (Qualificação e Visita): o que está visível, as
// contagens "n de m", alternar uma resposta (tocar de novo desseleciona) e a conversão para o texto que o negócio leva.
import type { RespostaNegocio, SeccaoVisitaNegocio } from "./negocioMetas";
import type { BlocoDef, PerguntaDef, Respostas, SeccaoDef, TipoPergunta } from "./perguntasTipos";

/** As chaves de tradução (depois do prefixo `businessGoals.new.`) de cada texto das perguntas. */
export const chaveSeccao = (id: string): string => `sec.${id}`;
export const chaveBloco = (id: string): string => `block.${id}`;
export const chavePergunta = (id: string): string => `q.${id}`;
export const chaveOpcao = (pergunta: string, opcao: string): string => `q.${pergunta}.${opcao}`;

type Traduzir = (chave: string) => string;

/** Os textos que se veem: o literal da organização (perguntas da base) ou a tradução da chave (o catálogo do código). */
export const textoDaPergunta = (p: PerguntaDef, traduzir: Traduzir): string => (p.literal ? p.rotulo[0] : traduzir(chavePergunta(p.id)));
export const textoDaOpcao = (p: PerguntaDef, chave: string, traduzir: Traduzir): string =>
  p.literal ? (p.opcoes.find(([c]) => c === chave)?.[1] ?? chave) : traduzir(chaveOpcao(p.id, chave));
export const tituloDoBloco = (b: BlocoDef, traduzir: Traduzir): string => (b.literal ? (b.titulo?.[0] ?? "") : traduzir(chaveBloco(b.id)));
export const tituloDaSeccao = (s: SeccaoDef, traduzir: Traduzir): string => (s.literal ? s.titulo[0] : traduzir(chaveSeccao(s.id)));

export const tipoDaPergunta = (p: PerguntaDef): TipoPergunta => p.tipo ?? "escolha_unica";

/** As chaves escolhidas numa resposta de escolha (única: uma; múltipla: separadas por vírgula). */
export const chavesEscolhidas = (valor: string | undefined): string[] => (valor ?? "").split(",").filter((c) => c !== "");

const NUMERO = /^-?\d+(?:[.,]\d+)?$/;

/** O número escrito (aceita vírgula decimal, sem expoente nem espaços no meio); NaN quando não é um número. */
export function lerNumero(texto: string): number {
  const limpo = texto.trim();
  return NUMERO.test(limpo) ? Number(limpo.replace(",", ".")) : Number.NaN;
}

/** A pergunta tem uma resposta que conta: uma opção da pergunta, um texto que não seja só espaços, ou um número. */
export function perguntaRespondida(p: PerguntaDef, valor: string | undefined): boolean {
  switch (tipoDaPergunta(p)) {
    case "texto": return (valor ?? "").trim() !== "";
    case "numero": return !Number.isNaN(lerNumero(valor ?? ""));
    case "escolha_multipla": return chavesEscolhidas(valor).some((c) => p.opcoes.some(([chave]) => chave === c));
    default: return p.opcoes.some(([chave]) => chave === valor);
  }
}

/** Uma pergunta condicional só aparece (e só conta) quando a resposta de que depende é uma das pedidas (numa múltipla, basta uma). */
export function perguntaVisivel(p: PerguntaDef, respostas: Respostas): boolean {
  if (!p.se) return true;
  const { valores } = p.se;
  const escolhidas = chavesEscolhidas(respostas[p.se.pergunta]);
  return escolhidas.length === 0 ? valores.includes("") : escolhidas.some((c) => valores.includes(c));
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
  const respondidas = visiveis.filter((p) => perguntaRespondida(p, respostas[p.id])).length;
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

/** Sem repetidas, pela ordem das opções (as chaves que a pergunta já não conhece ficam no fim, pela ordem em que estavam). */
export function ordenarEscolhas(p: PerguntaDef, chaves: readonly string[]): string[] {
  const posicao = (c: string): number => {
    const i = p.opcoes.findIndex(([chave]) => chave === c);
    return i === -1 ? p.opcoes.length : i;
  };
  return [...new Set(chaves)].sort((a, b) => posicao(a) - posicao(b));
}

/**
 * Toca numa opção. Escolha única: escolhe-a, ou desseleciona-a se já estava escolhida. Escolha múltipla: liga ou desliga só essa, e a
 * resposta guarda-se pela ordem das opções. Devolve um objeto novo.
 */
export function alternarResposta(blocos: readonly BlocoDef[], respostas: Respostas, pergunta: string, opcao: string): Respostas {
  const def = perguntasDosBlocos(blocos).find((p) => p.id === pergunta);
  const { [pergunta]: atual, ...resto } = respostas;
  if (def && tipoDaPergunta(def) === "escolha_multipla") {
    const antes = chavesEscolhidas(atual);
    const depois = ordenarEscolhas(def, antes.includes(opcao) ? antes.filter((c) => c !== opcao) : [...antes, opcao]);
    return limparOcultas(blocos, depois.length === 0 ? resto : { ...resto, [pergunta]: depois.join(",") });
  }
  return limparOcultas(blocos, atual === opcao ? resto : { ...resto, [pergunta]: opcao });
}

/** Escreve a resposta de uma pergunta de texto ou de número tal como se escreve; vazia (ou só espaços) retira a resposta. */
export function mudarResposta(blocos: readonly BlocoDef[], respostas: Respostas, pergunta: string, valor: string): Respostas {
  const { [pergunta]: _antes, ...resto } = respostas;
  return limparOcultas(blocos, valor.trim() === "" ? resto : { ...resto, [pergunta]: valor });
}

/** A resposta de uma pergunta em texto: o texto das opções escolhidas, o texto escrito, ou o número com a unidade. */
function respostaEmTexto(p: PerguntaDef, valor: string, t: Traduzir): string {
  switch (tipoDaPergunta(p)) {
    case "texto": return valor.trim();
    case "numero": return [valor.trim(), p.numero?.unidade].filter(Boolean).join(" ");
    case "escolha_multipla":
      return ordenarEscolhas(p, chavesEscolhidas(valor)).filter((c) => p.opcoes.some(([chave]) => chave === c)).map((c) => textoDaOpcao(p, c, t)).join(", ");
    default: return textoDaOpcao(p, valor, t);
  }
}

/** As respostas visíveis de uns blocos, em texto (pergunta e resposta, na língua em que se criou). */
export function respostasEmTexto(blocos: readonly BlocoDef[], respostas: Respostas, t: Traduzir): RespostaNegocio[] {
  return perguntasVisiveis(blocos, respostas)
    .filter((p) => perguntaRespondida(p, respostas[p.id]))
    .map((p) => ({ pergunta: textoDaPergunta(p, t), resposta: respostaEmTexto(p, respostas[p.id], t) }));
}

/** A Visita em texto: só as secções com alguma resposta. */
export function visitaEmTexto(seccoes: readonly SeccaoDef[], respostas: Respostas, t: Traduzir): SeccaoVisitaNegocio[] {
  return seccoes
    .map((s) => ({ titulo: tituloDaSeccao(s, t), respostas: respostasEmTexto(s.blocos, respostas, t) }))
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
