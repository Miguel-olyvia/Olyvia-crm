// As operações do editor do levantamento (funções puras: devolvem sempre cópias, nunca mexem no que recebem) e a validação local, que
// espelha os limites da base (migration 20261226090000) para o utilizador ver o problema ao lado do campo e não só num pedido recusado.
import {
  ehEscolha, LIMITES, type CondicaoEd, type OpcaoEd, type PerguntaEd, type QuestionarioEd, type SeccaoEd,
} from "./questionario";

// ---------------------------------------------------------------- listas

/** Move um item de `de` para `para`. Fora dos limites (ou sem mudança) devolve a mesma lista. */
export function moverItem<T>(itens: readonly T[], de: number, para: number): T[] {
  if (de === para || de < 0 || para < 0 || de >= itens.length || para >= itens.length) return itens as T[];
  const copia = [...itens];
  const [item] = copia.splice(de, 1);
  copia.splice(para, 0, item);
  return copia;
}

const todasAsPerguntas = (seccoes: readonly SeccaoEd[]): PerguntaEd[] => seccoes.flatMap((s) => s.perguntas);
const contarPerguntas = (seccoes: readonly SeccaoEd[]): number => todasAsPerguntas(seccoes).length;
export { contarPerguntas };

// ---------------------------------------------------------------- condições

/** As perguntas que usam esta como condição. */
export const dependentesDe = (seccoes: readonly SeccaoEd[], k: string): PerguntaEd[] =>
  todasAsPerguntas(seccoes).filter((p) => p.depende?.pergunta === k);

/** As perguntas que esta pode ter como condição: de escolha, não ela própria e sem condição própria (a base só aceita um nível). */
export const alvosPossiveis = (seccoes: readonly SeccaoEd[], k: string): PerguntaEd[] =>
  todasAsPerguntas(seccoes).filter((p) => p.k !== k && ehEscolha(p.tipo) && p.depende === null);

/**
 * Tira o que deixou de ter sentido: a condição cujo alvo já não existe, deixou de ser de escolha, tem condição própria ou é a própria
 * pergunta; e as opções da condição que já não existem (se isso a esvaziar, a condição sai). Uma condição acabada de criar, ainda sem
 * opções, mantém-se (a validação pede para marcar uma).
 */
export function limparCondicoes(seccoes: readonly SeccaoEd[]): SeccaoEd[] {
  const porK = new Map(todasAsPerguntas(seccoes).map((p) => [p.k, p]));
  let mudou = false;
  const limpa = (p: PerguntaEd): PerguntaEd => {
    const c = p.depende;
    if (!c) return p;
    const alvo = porK.get(c.pergunta);
    const alvoValido = alvo !== undefined && alvo.k !== p.k && ehEscolha(alvo.tipo) && alvo.depende === null;
    const opcoes = alvo && alvoValido ? c.opcoes.filter((o) => alvo.opcoes.some((x) => x.k === o)) : [];
    if (alvoValido && (opcoes.length > 0 || c.opcoes.length === 0)) {
      if (opcoes.length === c.opcoes.length) return p;
      mudou = true;
      return { ...p, depende: { ...c, opcoes } };
    }
    mudou = true;
    return { ...p, depende: null };
  };
  // Um alvo que passa a ter condição própria deixa de ser alvo válido: repete até estabilizar (sempre poucas voltas).
  let atual: SeccaoEd[] = seccoes as SeccaoEd[];
  for (let i = 0; i < 4; i += 1) {
    mudou = false;
    const seguinte = atual.map((s) => ({ ...s, perguntas: s.perguntas.map(limpa) }));
    if (!mudou) return atual;
    atual = seguinte;
    porK.clear();
    for (const p of todasAsPerguntas(atual)) porK.set(p.k, p);
  }
  return atual;
}

// ---------------------------------------------------------------- secções

const mapSeccao = (seccoes: readonly SeccaoEd[], k: string, f: (s: SeccaoEd) => SeccaoEd): SeccaoEd[] =>
  seccoes.map((s) => (s.k === k ? f(s) : s));

export const adicionarSeccao = (seccoes: readonly SeccaoEd[], nova: SeccaoEd): SeccaoEd[] => [...seccoes, nova];

/** Muda campos de uma secção. Visitas e Medidas (especiais) não mudam de título nem se desativam: só se reordenam. */
export function alterarSeccao(seccoes: readonly SeccaoEd[], k: string, patch: Partial<Pick<SeccaoEd, "titulo" | "activa">>): SeccaoEd[] {
  return mapSeccao(seccoes, k, (s) => {
    if (s.especial) return s;
    return { ...s, ...patch };
  });
}

/** Apaga uma secção normal. Visitas, Medidas e Qualificação não se apagam (a base também o recusa). */
export function removerSeccao(seccoes: readonly SeccaoEd[], k: string): SeccaoEd[] {
  const alvo = seccoes.find((s) => s.k === k);
  if (!alvo || alvo.especial || alvo.aba === "qualificacao") return seccoes as SeccaoEd[];
  return limparCondicoes(seccoes.filter((s) => s.k !== k));
}

export function moverSeccao(seccoes: readonly SeccaoEd[], k: string, delta: -1 | 1): SeccaoEd[] {
  const de = seccoes.findIndex((s) => s.k === k);
  return de < 0 ? (seccoes as SeccaoEd[]) : moverItem(seccoes, de, de + delta);
}

// ---------------------------------------------------------------- perguntas

const mapPergunta = (seccoes: readonly SeccaoEd[], k: string, f: (p: PerguntaEd) => PerguntaEd): SeccaoEd[] =>
  seccoes.map((s) => (s.perguntas.some((p) => p.k === k) ? { ...s, perguntas: s.perguntas.map((p) => (p.k === k ? f(p) : p)) } : s));

/** Acrescenta uma pergunta ao fim da secção. As secções especiais não têm perguntas. */
export function adicionarPergunta(seccoes: readonly SeccaoEd[], seccaoK: string, pergunta: PerguntaEd): SeccaoEd[] {
  const alvo = seccoes.find((s) => s.k === seccaoK);
  if (!alvo || alvo.especial) return seccoes as SeccaoEd[];
  return mapSeccao(seccoes, seccaoK, (s) => ({ ...s, perguntas: [...s.perguntas, pergunta] }));
}

export function alterarPergunta(seccoes: readonly SeccaoEd[], k: string, patch: Partial<Omit<PerguntaEd, "k" | "id">>): SeccaoEd[] {
  return limparCondicoes(mapPergunta(seccoes, k, (p) => ({ ...p, ...patch })));
}

export function removerPergunta(seccoes: readonly SeccaoEd[], k: string): SeccaoEd[] {
  return limparCondicoes(seccoes.map((s) => (s.perguntas.some((p) => p.k === k) ? { ...s, perguntas: s.perguntas.filter((p) => p.k !== k) } : s)));
}

export function moverPergunta(seccoes: readonly SeccaoEd[], k: string, delta: -1 | 1): SeccaoEd[] {
  const sec = seccoes.find((s) => s.perguntas.some((p) => p.k === k));
  if (!sec) return seccoes as SeccaoEd[];
  const de = sec.perguntas.findIndex((p) => p.k === k);
  const novas = moverItem(sec.perguntas, de, de + delta);
  return novas === sec.perguntas ? (seccoes as SeccaoEd[]) : mapSeccao(seccoes, sec.k, (s) => ({ ...s, perguntas: novas }));
}

// ---------------------------------------------------------------- opções

export const adicionarOpcao = (seccoes: readonly SeccaoEd[], perguntaK: string, opcao: OpcaoEd): SeccaoEd[] =>
  mapPergunta(seccoes, perguntaK, (p) => ({ ...p, opcoes: [...p.opcoes, opcao] }));

export const alterarOpcao = (seccoes: readonly SeccaoEd[], perguntaK: string, opcaoK: string, patch: Partial<Pick<OpcaoEd, "texto" | "activa">>): SeccaoEd[] =>
  mapPergunta(seccoes, perguntaK, (p) => ({ ...p, opcoes: p.opcoes.map((o) => (o.k === opcaoK ? { ...o, ...patch } : o)) }));

export const removerOpcao = (seccoes: readonly SeccaoEd[], perguntaK: string, opcaoK: string): SeccaoEd[] =>
  limparCondicoes(mapPergunta(seccoes, perguntaK, (p) => ({ ...p, opcoes: p.opcoes.filter((o) => o.k !== opcaoK) })));

export function moverOpcao(seccoes: readonly SeccaoEd[], perguntaK: string, opcaoK: string, delta: -1 | 1): SeccaoEd[] {
  const p = todasAsPerguntas(seccoes).find((x) => x.k === perguntaK);
  if (!p) return seccoes as SeccaoEd[];
  const de = p.opcoes.findIndex((o) => o.k === opcaoK);
  const novas = moverItem(p.opcoes, de, de + delta);
  return novas === p.opcoes ? (seccoes as SeccaoEd[]) : mapPergunta(seccoes, perguntaK, (x) => ({ ...x, opcoes: novas }));
}

export const mudarCondicao = (seccoes: readonly SeccaoEd[], perguntaK: string, depende: CondicaoEd | null): SeccaoEd[] =>
  alterarPergunta(seccoes, perguntaK, { depende });

// ---------------------------------------------------------------- validação

export const CODIGOS_PROBLEMA = [
  "tituloSeccao", "textoPergunta", "blocoLongo", "poucasOpcoes", "muitasOpcoes", "textoOpcao", "limitesNumero", "casasNumero",
  "unidadeLonga", "textoMaxInvalido", "condicaoInvalida", "demasiadasSeccoes", "demasiadasPerguntas", "caracteresControlo",
] as const;
export type CodigoProblema = (typeof CODIGOS_PROBLEMA)[number];

/** O campo do item `k` onde está o problema (o ecrã assinala-o e leva o foco até lá). */
export type CampoProblema = "titulo" | "texto" | "bloco" | "opcoes" | "opcao" | "min" | "casas" | "unidade" | "textoMax" | "condicao" | "geral";

export interface Problema {
  codigo: CodigoProblema;
  /** O item com o problema (secção, pergunta ou opção). Vazio nos problemas gerais. */
  k: string;
  campo: CampoProblema;
  /** Uma descrição do item para a mensagem (o título da secção ou o texto da pergunta), sem aspas. */
  onde: string;
}

const CONTROLO = /[\u0000-\u001f\u007f-\u009f]/;
const DECIMAIS = /^-?\d+(\.\d{1,3})?$/;

function numeroValido(v: string): boolean {
  const t = v.trim();
  return t === "" || (DECIMAIS.test(t) && Math.abs(Number(t)) <= LIMITES.numeroMax);
}

function problemasDaPergunta(p: PerguntaEd, alvos: ReadonlyMap<string, PerguntaEd>, seccao: SeccaoEd): Problema[] {
  const onde = p.texto.trim() || seccao.titulo.trim();
  const dado = (codigo: CodigoProblema, campo: CampoProblema, k = p.k): Problema => ({ codigo, k, campo, onde });
  const out: Problema[] = [];
  const texto = p.texto.trim();
  if (texto === "" || texto.length > LIMITES.textoPergunta) out.push(dado("textoPergunta", "texto"));
  else if (CONTROLO.test(texto)) out.push(dado("caracteresControlo", "texto"));
  const bloco = p.bloco.trim();
  if (bloco.length > LIMITES.bloco) out.push(dado("blocoLongo", "bloco"));
  else if (CONTROLO.test(bloco)) out.push(dado("caracteresControlo", "bloco"));

  if (ehEscolha(p.tipo)) {
    if (p.opcoes.length < LIMITES.opcoesMin) out.push(dado("poucasOpcoes", "opcoes"));
    if (p.opcoes.length > LIMITES.opcoesMax) out.push(dado("muitasOpcoes", "opcoes"));
    for (const o of p.opcoes) {
      const t = o.texto.trim();
      if (t === "" || t.length > LIMITES.textoOpcao || CONTROLO.test(t)) out.push(dado("textoOpcao", "opcao", o.k));
    }
  }
  if (p.tipo === "numero") {
    const min = p.min.trim();
    const max = p.max.trim();
    if (!numeroValido(min) || !numeroValido(max) || (min !== "" && max !== "" && Number(min) > Number(max))) out.push(dado("limitesNumero", "min"));
    const casas = p.casas.trim();
    if (casas !== "" && !(/^\d+$/.test(casas) && Number(casas) <= LIMITES.casasMax)) out.push(dado("casasNumero", "casas"));
    const unidade = p.unidade.trim();
    if (unidade.length > LIMITES.unidade || CONTROLO.test(unidade)) out.push(dado("unidadeLonga", "unidade"));
  }
  if (p.tipo === "texto") {
    const max = p.textoMax.trim();
    if (max !== "" && !(/^\d+$/.test(max) && Number(max) >= 1 && Number(max) <= LIMITES.textoMaxOmissao)) out.push(dado("textoMaxInvalido", "textoMax"));
  }
  if (p.depende) {
    const alvo = alvos.get(p.depende.pergunta);
    const ok = alvo !== undefined && alvo.k !== p.k && ehEscolha(alvo.tipo) && alvo.depende === null
      && p.depende.opcoes.length >= 1 && p.depende.opcoes.length <= LIMITES.opcoesMax
      && p.depende.opcoes.every((o) => alvo.opcoes.some((x) => x.k === o));
    if (!ok) out.push(dado("condicaoInvalida", "condicao"));
  }
  return out;
}

/** Tudo o que a base recusaria por valor (NG009), pela ordem do ecrã. Lista vazia: pode gravar-se. */
export function validar(seccoes: readonly SeccaoEd[]): Problema[] {
  const alvos = new Map(todasAsPerguntas(seccoes).map((p) => [p.k, p]));
  const out: Problema[] = [];
  if (seccoes.length > LIMITES.seccoes) out.push({ codigo: "demasiadasSeccoes", k: "", campo: "geral", onde: "" });
  if (contarPerguntas(seccoes) > LIMITES.perguntas) out.push({ codigo: "demasiadasPerguntas", k: "", campo: "geral", onde: "" });
  for (const s of seccoes) {
    if (!s.especial) {
      const titulo = s.titulo.trim();
      if (titulo === "" || titulo.length > LIMITES.tituloSeccao) out.push({ codigo: "tituloSeccao", k: s.k, campo: "titulo", onde: titulo });
      else if (CONTROLO.test(titulo)) out.push({ codigo: "caracteresControlo", k: s.k, campo: "titulo", onde: titulo });
    }
    for (const p of s.perguntas) out.push(...problemasDaPergunta(p, alvos, s));
  }
  return out;
}

/** Um item do rascunho que a base, relida, já não tem. A opção diz de que pergunta é. */
export interface ItemApagado {
  tipo: "seccao" | "pergunta" | "opcao";
  nome: string;
  pergunta?: string;
}

/**
 * O que o rascunho ainda tem (com id) e a base, relida depois de um NG021, já não tem: outra pessoa apagou-o. Gravar enviaria esse id e a
 * base recusaria («desconhecida»). Um item cujo pai também desapareceu conta só pelo pai. Itens novos (sem id) nunca contam.
 */
export function itensApagados(seccoes: readonly SeccaoEd[], novo: QuestionarioEd): ItemApagado[] {
  const existem = new Set<string>();
  for (const s of novo.seccoes) {
    existem.add(s.k);
    for (const p of s.perguntas) {
      existem.add(p.k);
      for (const o of p.opcoes) existem.add(o.k);
    }
  }
  const falta = (item: { id: string | null }): boolean => item.id !== null && !existem.has(item.id);
  const out: ItemApagado[] = [];
  for (const s of seccoes) {
    if (falta(s)) {
      out.push({ tipo: "seccao", nome: s.titulo.trim() });
      continue;
    }
    for (const p of s.perguntas) {
      if (falta(p)) {
        out.push({ tipo: "pergunta", nome: p.texto.trim() });
        continue;
      }
      for (const o of p.opcoes) if (falta(o)) out.push({ tipo: "opcao", nome: o.texto.trim(), pergunta: p.texto.trim() });
    }
  }
  return out;
}
