// O questionário do levantamento em forma pura: ler o que neg_questionario_levantamento devolve e montar o que neg_guardar_questionario aceita
// (migration 20261226090000). Em cada item há uma chave interna `k`: o id da base nos itens que já existem e uma ref temporária (`n1`, `n2`...)
// nos novos. A base aceita as duas nas condições (`depende`), por isso a condição guarda sempre `k`. O cliente nunca manda chaves de negócio.

import { itemParaEditor, itemParaEnvio, lerItensEfeito, modoDeEfeito, type ItemEfeitoEd, type ModoEfeito } from "./efeitosQuestionario";

export type TipoPergunta = "escolha_unica" | "escolha_multipla" | "texto" | "numero";
export const TIPOS_PERGUNTA: readonly TipoPergunta[] = ["escolha_unica", "escolha_multipla", "texto", "numero"];
export const TIPOS_ESCOLHA: readonly TipoPergunta[] = ["escolha_unica", "escolha_multipla"];
export const ehEscolha = (tipo: TipoPergunta): boolean => TIPOS_ESCOLHA.includes(tipo);

/** Os limites da base (neg_guardar_questionario e as restrições das tabelas). */
export const LIMITES = {
  seccoes: 20,
  perguntas: 150,
  opcoesMax: 30,
  opcoesMin: 2,
  tituloSeccao: 80,
  textoPergunta: 200,
  bloco: 80,
  textoOpcao: 80,
  unidade: 12,
  textoMaxOmissao: 2000,
  casasMax: 3,
  numeroMax: 99999999999.999,
} as const;

export interface OpcaoEd {
  k: string;
  id: string | null;
  /** A chave que a base deu (só para ligar as condições na leitura); null nas novas. */
  chave: string | null;
  texto: string;
  activa: boolean;
  /** O valor que esta opção tem no campo da Emylia a que a pergunta está ligada (vazio = sem ligação). */
  valorEmylia?: string;
  /** O que esta opção acrescenta ao orçamento quando é a escolhida (só conta com o efeito «próprio» na pergunta). */
  efeito?: ItemEfeitoEd[];
}

/** A condição de visibilidade: `pergunta` e `opcoes` são chaves internas (`k`) da pergunta e das opções de que depende. */
export interface CondicaoEd {
  pergunta: string;
  opcoes: string[];
  semResposta: boolean;
}

export interface PerguntaEd {
  k: string;
  id: string | null;
  texto: string;
  tipo: TipoPergunta;
  /** O subtítulo (bloco). Vazio = sem subtítulo. */
  bloco: string;
  activa: boolean;
  // Campos de formulário, em texto: vazio = não definido. Só contam no tipo a que pertencem.
  min: string;
  max: string;
  casas: string;
  unidade: string;
  textoMax: string;
  depende: CondicaoEd | null;
  opcoes: OpcaoEd[];
  /** O campo da Emylia (chave de src/emylia/campos.ts) que esta pergunta preenche; vazio = só nota do levantamento. */
  campoEmylia?: string;
  /** Se a pergunta mexe no orçamento: vazio = omissão (o efeito da Emylia se há campo ligado que o tenha, senão nenhum). */
  efeitoModo?: ModoEfeito | "";
  /** O efeito por unidade, nas perguntas numéricas com o efeito «próprio». */
  efeito?: ItemEfeitoEd[];
}

export interface SeccaoEd {
  k: string;
  id: string | null;
  titulo: string;
  aba: "visita" | "qualificacao";
  especial: "visitas" | "medidas" | null;
  activa: boolean;
  perguntas: PerguntaEd[];
}

export interface QuestionarioEd {
  versao: number;
  seccoes: SeccaoEd[];
}

let contador = 0;
const novaRef = (): string => {
  contador += 1;
  return `n${contador}`;
};

export const criarOpcao = (): OpcaoEd => ({ k: novaRef(), id: null, chave: null, texto: "", activa: true });

export function criarPergunta(tipo: TipoPergunta = "escolha_unica"): PerguntaEd {
  return {
    k: novaRef(), id: null, texto: "", tipo, bloco: "", activa: true,
    min: "", max: "", casas: "", unidade: "", textoMax: "", depende: null,
    opcoes: ehEscolha(tipo) ? [criarOpcao(), criarOpcao()] : [],
  };
}

export const criarSeccao = (): SeccaoEd => ({ k: novaRef(), id: null, titulo: "", aba: "visita", especial: null, activa: true, perguntas: [] });

// ---------------------------------------------------------------- leitura

type Obj = Record<string, unknown>;
const ehObjeto = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string => (typeof v === "string" ? v : "");
const numeroTexto = (v: unknown): string => (typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function lerOpcao(cru: unknown): OpcaoEd | null {
  if (!ehObjeto(cru) || typeof cru.id !== "string") return null;
  return {
    k: cru.id, id: cru.id, chave: typeof cru.chave === "string" ? cru.chave : null, texto: texto(cru.texto), activa: cru.activa !== false,
    valorEmylia: texto(cru.valor_emylia), efeito: lerItensEfeito(cru.efeito).map(itemParaEditor),
  };
}

function lerPergunta(cru: unknown): PerguntaEd | null {
  if (!ehObjeto(cru) || typeof cru.id !== "string") return null;
  const tipo = TIPOS_PERGUNTA.find((t) => t === cru.tipo);
  if (!tipo) return null;
  const numero: Obj = ehObjeto(cru.numero) ? cru.numero : {};
  return {
    k: cru.id, id: cru.id, texto: texto(cru.texto), tipo, bloco: texto(cru.bloco), activa: cru.activa !== false,
    min: numeroTexto(numero.min), max: numeroTexto(numero.max), casas: numeroTexto(numero.casas), unidade: texto(numero.unidade),
    textoMax: tipo === "texto" ? numeroTexto(cru.texto_max) : "", depende: null,
    opcoes: lista(cru.opcoes).map(lerOpcao).filter((o): o is OpcaoEd => o !== null),
    campoEmylia: texto(cru.campo_emylia), efeitoModo: modoDeEfeito(cru.efeito_modo), efeito: lerItensEfeito(cru.efeito).map(itemParaEditor),
  };
}

function lerSeccao(cru: unknown): SeccaoEd | null {
  if (!ehObjeto(cru) || typeof cru.id !== "string") return null;
  const especial = cru.especial === "visitas" || cru.especial === "medidas" ? cru.especial : null;
  return {
    k: cru.id, id: cru.id, titulo: texto(cru.titulo), aba: cru.aba === "qualificacao" ? "qualificacao" : "visita", especial,
    activa: cru.activa !== false,
    perguntas: lista(cru.perguntas).map(lerPergunta).filter((p): p is PerguntaEd => p !== null),
  };
}

/** A condição vem com chaves de opção; passa a ids de opção da pergunta alvo. Sem alvo (ou sem opções que se reconheçam) não há condição. */
function ligarCondicoes(seccoes: SeccaoEd[], cruas: Map<string, unknown>): SeccaoEd[] {
  const porId = new Map(seccoes.flatMap((s) => s.perguntas).map((p) => [p.k, p]));
  return seccoes.map((s) => ({
    ...s,
    perguntas: s.perguntas.map((p) => {
      const cru = cruas.get(p.k);
      if (!ehObjeto(cru)) return p;
      const alvo = typeof cru.pergunta_id === "string" ? porId.get(cru.pergunta_id) : undefined;
      if (!alvo) return p;
      const chaves = lista(cru.opcoes);
      const opcoes = alvo.opcoes.filter((o) => o.chave !== null && chaves.includes(o.chave)).map((o) => o.k);
      if (opcoes.length === 0) return p;
      return { ...p, depende: { pergunta: alvo.k, opcoes, semResposta: cru.sem_resposta === true } };
    }),
  }));
}

/** Lê a resposta de neg_questionario_levantamento. Devolve null se não for um questionário (nunca inventa dados). */
export function lerQuestionario(cru: unknown): QuestionarioEd | null {
  if (!ehObjeto(cru)) return null;
  const { versao, seccoes: seccoesCruas } = cru;
  if (typeof versao !== "number" || !Number.isInteger(versao) || versao < 1 || !Array.isArray(seccoesCruas)) return null;
  const condicoes = new Map<string, unknown>();
  for (const s of seccoesCruas) {
    if (!ehObjeto(s)) continue;
    for (const p of lista(s.perguntas)) if (ehObjeto(p) && typeof p.id === "string") condicoes.set(p.id, p.depende);
  }
  const seccoes = seccoesCruas.map(lerSeccao).filter((s): s is SeccaoEd => s !== null);
  return { versao, seccoes: ligarCondicoes(seccoes, condicoes) };
}

// ---------------------------------------------------------------- envio

const aparar = (v: string): string => v.trim();
const ouNull = (v: string): string | null => (aparar(v) === "" ? null : aparar(v));
const numeroOuNull = (v: string): number | null => (aparar(v) === "" ? null : Number(aparar(v)));
const identidade = (item: { k: string; id: string | null }): { id: string } | { ref: string } => (item.id ? { id: item.id } : { ref: item.k });

function paraEnvioOpcao(o: OpcaoEd, comEfeito: boolean): Obj {
  const base: Obj = { ...identidade(o), texto: aparar(o.texto), activa: o.activa };
  if (aparar(o.valorEmylia ?? "") !== "") base.valor_emylia = aparar(o.valorEmylia ?? "");
  // O efeito de uma opção só conta (e só se valida) com o modo «próprio» na pergunta.
  if (comEfeito && (o.efeito ?? []).length > 0) base.efeito = (o.efeito ?? []).map(itemParaEnvio);
  return base;
}

function paraEnvioPergunta(p: PerguntaEd): Obj {
  const base: Obj = { ...identidade(p), texto: aparar(p.texto), tipo: p.tipo, bloco: ouNull(p.bloco), activa: p.activa };
  if (p.tipo === "numero") {
    base.numero = { min: numeroOuNull(p.min), max: numeroOuNull(p.max), casas: numeroOuNull(p.casas), unidade: ouNull(p.unidade) };
  }
  if (p.tipo === "texto") {
    const max = numeroOuNull(p.textoMax);
    // 2000 é o tamanho de omissão (a base guarda null): mandar 2000 faria de cada gravação uma «alteração».
    base.texto_max = max === null || max === LIMITES.textoMaxOmissao ? null : max;
  }
  base.opcoes = ehEscolha(p.tipo) ? p.opcoes.map((o) => paraEnvioOpcao(o, p.efeitoModo === "proprio")) : [];
  // Só se manda o que foi definido: sem efeitos nem ligação a pergunta fica exatamente como a base já a aceita.
  if (aparar(p.campoEmylia ?? "") !== "") base.campo_emylia = aparar(p.campoEmylia ?? "");
  if (p.efeitoModo) base.efeito_modo = p.efeitoModo;
  if (p.efeitoModo === "proprio" && p.tipo === "numero" && (p.efeito ?? []).length > 0) base.efeito = (p.efeito ?? []).map(itemParaEnvio);
  if (p.depende) base.depende = { pergunta: p.depende.pergunta, opcoes: p.depende.opcoes, sem_resposta: p.depende.semResposta };
  return base;
}

/** As secções como neg_guardar_questionario as recebe: pela ordem do ecrã, ids nos itens que existem e refs nos novos. */
export function paraEnvio(seccoes: readonly SeccaoEd[]): unknown[] {
  return seccoes.map((s) => ({
    ...identidade(s),
    titulo: aparar(s.titulo),
    activa: s.especial ? true : s.activa,
    perguntas: s.especial ? [] : s.perguntas.map(paraEnvioPergunta),
  }));
}
