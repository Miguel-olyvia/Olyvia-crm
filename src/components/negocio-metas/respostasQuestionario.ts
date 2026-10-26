// As respostas do formulário do levantamento e a base: o formato novo de p_respostas de neg_guardar_levantamento, a validação de texto e número
// antes de gravar, e a leitura das respostas já gravadas com o snapshot (D5: o que a pessoa viu, não o texto atual). Só lógica pura.
import type { BlocoDef, OpcaoDef, PerguntaDef, Respostas, SeccaoDef, TipoPergunta } from "./perguntasTipos";
import type { QuestionarioForm } from "./questionarioForm";
import { todasAsPerguntas, todosOsBlocos } from "./questionarioForm";
import { chavesEscolhidas, lerNumero, ordenarEscolhas, perguntaRespondida, perguntasVisiveis, tipoDaPergunta } from "./respostasVisita";

/** Uma resposta como neg_guardar_levantamento a recebe: as chaves escolhidas, o texto ou o número. A secção vem da configuração, não daqui. */
export type RespostaBase = { escolhas: string[] } | { texto: string } | { numero: number };

/** O que a base gravou de uma resposta: o valor e o snapshot do que a pessoa viu. `tipo` nulo = resposta antiga, sem snapshot. */
export interface RespostaGravada {
  seccao: string;
  pergunta: string;
  resposta: string | null;
  tipo: TipoPergunta | null;
  perguntaTexto: string | null;
  seccaoTitulo: string | null;
  bloco: string | null;
  ordem: number | null;
  escolhas: string[] | null;
  escolhasTexto: string[] | null;
  valorTexto: string | null;
  valorNumero: number | null;
}

export type ErroResposta = "fora" | "casas" | "invalido" | "comprido";

const TEXTO_MAX_OMISSAO = 2000;
const CASAS_OMISSAO = 3;
/** O maior número que a coluna guarda (numeric(14,3)). */
const NUMERO_MAXIMO = 99_999_999_999.999;

export type AbaQuestionario = "visita" | "qualificacao";

/** As chaves das perguntas das secções de uma aba (uma secção sem aba é da Visita). */
export function chavesDaAba(q: QuestionarioForm, aba: AbaQuestionario): Set<string> {
  const chaves = q.seccoes.filter((s) => (s.aba ?? "visita") === aba).flatMap((s) => s.blocos.flatMap((b) => b.perguntas.map((p) => p.id)));
  return new Set(chaves);
}

function respostaBase(p: PerguntaDef, valor: string): RespostaBase {
  switch (tipoDaPergunta(p)) {
    case "texto": return { texto: valor.trim() };
    case "numero": return { numero: lerNumero(valor) };
    case "escolha_multipla":
      return { escolhas: ordenarEscolhas(p, chavesEscolhidas(valor)).filter((c) => p.opcoes.some(([chave]) => chave === c)) };
    default: return { escolhas: [valor] };
  }
}

/**
 * As respostas no formato novo de p_respostas: a chave da pergunta → escolhas, texto ou número. Só as perguntas visíveis e respondidas (a
 * visibilidade só se impõe no ecrã, D9, por isso a que ficou escondida não segue). Uma chave que já não é opção, ou um número que não é número, não segue.
 */
export function respostasParaBase(q: QuestionarioForm, respostas: Respostas, aba?: AbaQuestionario): Record<string, RespostaBase> {
  const saida: Record<string, RespostaBase> = {};
  const daAba = aba ? chavesDaAba(q, aba) : null;
  for (const p of perguntasVisiveis(todosOsBlocos(q), respostas)) {
    if (daAba && !daAba.has(p.id)) continue;
    const valor = respostas[p.id];
    if (perguntaRespondida(p, valor)) saida[p.id] = respostaBase(p, valor);
  }
  return saida;
}

/** As casas decimais de um número escrito, sem contar os zeros do fim (1,20 tem uma casa). */
const casasDe = (valor: string): number => (/[.,](\d*?)0*$/.exec(valor.trim())?.[1] ?? "").length;

function erroDoNumero(p: PerguntaDef, valor: string): ErroResposta | null {
  const n = lerNumero(valor);
  if (Number.isNaN(n)) return "invalido";
  if (casasDe(valor) > (p.numero?.casas ?? CASAS_OMISSAO)) return "casas";
  const min = p.numero?.min ?? null;
  const max = p.numero?.max ?? null;
  if ((min !== null && n < min) || (max !== null && n > max) || Math.abs(n) > NUMERO_MAXIMO) return "fora";
  return null;
}

/** Os erros das respostas que se veem (só texto e número têm: as escolhas só se fazem entre as opções). A chave é a pergunta. */
export function validarRespostas(q: QuestionarioForm, respostas: Respostas, aba?: AbaQuestionario): Record<string, ErroResposta> {
  const erros: Record<string, ErroResposta> = {};
  const daAba = aba ? chavesDaAba(q, aba) : null;
  for (const p of perguntasVisiveis(todosOsBlocos(q), respostas)) {
    if (daAba && !daAba.has(p.id)) continue;
    const valor = respostas[p.id];
    if (valor === undefined || valor.trim() === "") continue;
    const tipo = tipoDaPergunta(p);
    const erro = tipo === "numero" ? erroDoNumero(p, valor) : tipo === "texto" && valor.trim().length > (p.textoMax ?? TEXTO_MAX_OMISSAO) ? "comprido" : null;
    if (erro) erros[p.id] = erro;
  }
  return erros;
}

/** Onde está uma resposta errada: a aba, a secção e a pergunta (o campo a focar). */
export interface LocalDoErro {
  aba: "qualificacao" | "visita";
  seccao: string;
  pergunta: string;
}

/** Onde estão as respostas erradas: a primeira (pela ordem do ecrã: a aba Qualificação, depois as secções da Visita), e as abas e secções que as têm. */
export interface ErrosLocalizados {
  primeiro: LocalDoErro | null;
  abas: ReadonlySet<LocalDoErro["aba"]>;
  seccoes: ReadonlySet<string>;
}

/**
 * Diz ONDE estão as respostas erradas (as de `validarRespostas`), para o formulário levar a pessoa ao primeiro erro e marcar a aba e a secção:
 * uma resposta antiga pode passar a violar um limite mais apertado numa secção que não está à vista. Devolve objetos novos.
 */
export function localizarErrosRespostas(q: QuestionarioForm, erros: Readonly<Record<string, ErroResposta>>): ErrosLocalizados {
  const abas = new Set<LocalDoErro["aba"]>();
  const seccoes = new Set<string>();
  let primeiro: LocalDoErro | null = null;
  const ordenadas = [...q.seccoes.filter((s) => s.aba === "qualificacao"), ...q.seccoes.filter((s) => s.aba !== "qualificacao")];
  for (const s of ordenadas) {
    const aba = s.aba === "qualificacao" ? "qualificacao" : "visita";
    for (const p of s.blocos.flatMap((b) => b.perguntas)) {
      if (!erros[p.id]) continue;
      abas.add(aba);
      seccoes.add(s.id);
      primeiro ??= { aba, seccao: s.id, pergunta: p.id };
    }
  }
  return { primeiro, abas, seccoes };
}

// ---------------------------------------------------------------- respostas já gravadas

/** As respostas gravadas passadas ao estado do formulário (um texto por pergunta). */
export function respostasDeGravadas(gravadas: readonly RespostaGravada[]): Respostas {
  const saida: Record<string, string> = {};
  for (const g of gravadas) {
    const valor = g.tipo === "escolha_multipla" ? (g.escolhas ?? []).join(",")
      : g.tipo === "texto" ? (g.valorTexto ?? "")
      : g.tipo === "numero" ? (g.valorNumero === null ? "" : String(g.valorNumero))
      : (g.escolhas?.[0] ?? g.resposta ?? "");
    if (valor !== "") saida[g.pergunta] = valor;
  }
  return saida;
}

const ehDeEscolha = (tipo: TipoPergunta | null): boolean => tipo === null || tipo === "escolha_unica" || tipo === "escolha_multipla";

/** As chaves escolhidas de uma resposta gravada, com o texto que a pessoa viu (ou a própria chave, sem snapshot). */
function escolhasGravadas(g: RespostaGravada): { chave: string; texto: string }[] {
  const chaves = g.escolhas ?? (g.resposta ? [g.resposta] : []);
  return chaves.map((chave, i) => ({ chave, texto: g.escolhasTexto?.[i] ?? chave }));
}

/** A pergunta tal como está, com o texto gravado (se há snapshot) e as opções escolhidas que já não existem acrescentadas. */
function comSnapshot(p: PerguntaDef, g: RespostaGravada): PerguntaDef {
  const doSnapshot = g.tipo !== null;
  let opcoes: readonly OpcaoDef[] = p.opcoes;
  if (ehDeEscolha(g.tipo)) {
    for (const { chave, texto } of escolhasGravadas(g)) {
      const nova: OpcaoDef = [chave, texto, texto];
      if (!opcoes.some(([c]) => c === chave)) opcoes = [...opcoes, nova];
      else if (doSnapshot && g.escolhasTexto) opcoes = opcoes.map((o) => (o[0] === chave ? nova : o));
    }
  }
  const rotulo = doSnapshot && g.perguntaTexto ? ([g.perguntaTexto, g.perguntaTexto] as const) : p.rotulo;
  const mudouTexto = rotulo !== p.rotulo || opcoes !== p.opcoes;
  return { ...p, rotulo, opcoes, ...(mudouTexto ? { literal: true } : {}) };
}

/** Uma pergunta que a configuração já não traz (desativada ou apagada): refeita só com o que a resposta gravou. */
function perguntaDaGravada(g: RespostaGravada): PerguntaDef {
  const tipo = g.tipo ?? "escolha_unica";
  const rotulo = g.perguntaTexto ?? g.pergunta;
  const base: PerguntaDef = { id: g.pergunta, rotulo: [rotulo, rotulo], literal: true, tipo, opcoes: [] };
  if (ehDeEscolha(g.tipo)) return { ...base, opcoes: escolhasGravadas(g).map(({ chave, texto }): OpcaoDef => [chave, texto, texto]) };
  return tipo === "numero" ? { ...base, numero: { min: null, max: null, casas: null, unidade: null } } : base;
}

const comBloco = (id: string, perguntas: PerguntaDef[]): BlocoDef => ({ id, perguntas, literal: true });

/**
 * O questionário que se vê ao abrir um levantamento já gravado: o texto da pergunta e das respostas é o do snapshot (o que a pessoa viu),
 * não o atual; uma opção escolhida que já não existe continua à vista; e uma pergunta (ou secção) desativada ou apagada reaparece com o que
 * tinha, para uma resposta antiga não desaparecer do ecrã (D5). Devolve objetos novos; não altera o que recebe.
 */
export function aplicarGravadas(q: QuestionarioForm, gravadas: readonly RespostaGravada[]): QuestionarioForm {
  if (gravadas.length === 0) return q;
  const porPergunta = new Map(gravadas.map((g) => [g.pergunta, g] as const));
  const existentes = new Set(todasAsPerguntas(q.seccoes).map((p) => p.id));
  const seccoes: SeccaoDef[] = q.seccoes.map((s) => ({
    ...s,
    blocos: s.blocos.map((b) => ({ ...b, perguntas: b.perguntas.map((p) => { const g = porPergunta.get(p.id); return g ? comSnapshot(p, g) : p; }) })),
  }));
  const faltam = gravadas.filter((g) => !existentes.has(g.pergunta)).sort((a, b) => (a.ordem ?? Infinity) - (b.ordem ?? Infinity));
  for (const chave of new Set(faltam.map((g) => g.seccao))) {
    const dela = faltam.filter((g) => g.seccao === chave);
    const perguntas = dela.map(perguntaDaGravada);
    const i = seccoes.findIndex((s) => s.id === chave);
    if (i !== -1) {
      seccoes[i] = { ...seccoes[i], blocos: [...seccoes[i].blocos, comBloco(`${chave}-gravadas`, perguntas)] };
    } else {
      const titulo = dela.find((g) => g.seccaoTitulo)?.seccaoTitulo ?? chave;
      seccoes.push({
        id: chave, titulo: [titulo, titulo], literal: true, aba: chave === "qualificacao" ? "qualificacao" : "visita",
        blocos: [comBloco(`${chave}-gravadas`, perguntas)],
      });
    }
  }
  return { ...q, seccoes };
}
