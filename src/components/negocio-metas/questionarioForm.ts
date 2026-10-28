// O questionário do formulário do levantamento: as secções e perguntas que o formulário desenha. Vem de neg_questionario_levantamento (sem as
// inativas, para quem preenche de novo) ou, no protótipo sem base, do catálogo do código. Em ambos os casos é a mesma forma (SeccaoDef), para
// os mesmos componentes servirem os dois. Só lógica pura: a leitura da base vive em `@/hooks/pessoas` (esta pasta não fala com a base).
import { lerItensEfeito, type ItemEfeito } from "@/hooks/pessoas/workflow/efeitosQuestionario";
import type { BlocoDef, EfeitoCfgPergunta, NumeroDef, OpcaoDef, PerguntaDef, SeccaoDef, TipoPergunta } from "./perguntasTipos";
import { BLOCO_QUALIFICACAO } from "./qualificacaoExemplo";
import { SECCOES_VISITA } from "./visitaExemplo";

export interface QuestionarioForm {
  /** A versão que a base devolveu (vai com o levantamento, para saber se mudou); `null` no catálogo do código. */
  versao: number | null;
  /** Verdadeiro no protótipo sem base: as perguntas são as do código e os textos passam pela tradução. */
  semBase: boolean;
  seccoes: readonly SeccaoDef[];
}

/** O catálogo do código: as sete secções da Visita e a Qualificação (uma secção como as outras, na sua aba). */
export const QUESTIONARIO_CODIGO: QuestionarioForm = {
  versao: null,
  semBase: true,
  seccoes: [...SECCOES_VISITA, { id: "qualificacao", titulo: ["Qualificação", "Qualification"], aba: "qualificacao", blocos: [BLOCO_QUALIFICACAO] }],
};

export const todasAsPerguntas = (seccoes: readonly SeccaoDef[]): PerguntaDef[] => seccoes.flatMap((s) => s.blocos.flatMap((b) => b.perguntas));

/** Os blocos de todas as secções, pela ordem do questionário (o que o estado das respostas precisa para limpar as que deixam de se ver). */
export const todosOsBlocos = (q: QuestionarioForm): BlocoDef[] => q.seccoes.flatMap((s) => s.blocos);

/** As secções da aba Visita (as especiais incluídas: Visitas e Medidas só se reordenam). */
export const seccoesDaVisita = (q: QuestionarioForm): SeccaoDef[] => q.seccoes.filter((s) => s.aba !== "qualificacao");

/** Os blocos de perguntas da aba Qualificação; sem essa secção, nenhum. */
export const blocosDaQualificacao = (q: QuestionarioForm): BlocoDef[] => q.seccoes.filter((s) => s.aba === "qualificacao").flatMap((s) => s.blocos);

/** A chave da secção onde está a pergunta, ou null se o questionário não a conhece. */
export function seccaoDaPergunta(q: QuestionarioForm, pergunta: string): string | null {
  return q.seccoes.find((s) => s.blocos.some((b) => b.perguntas.some((p) => p.id === pergunta)))?.id ?? null;
}

// ---------------------------------------------------------------- leitura

type Obj = Record<string, unknown>;
const ehObjeto = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" ? v : null);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const numeroOuNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const TIPOS: readonly TipoPergunta[] = ["escolha_unica", "escolha_multipla", "texto", "numero"];
const TEXTO_MAX_OMISSAO = 2000;

function lerOpcoes(cru: unknown): OpcaoDef[] {
  return lista(cru).flatMap((o): OpcaoDef[] => {
    if (!ehObjeto(o) || o.activa === false) return [];
    const chave = texto(o.chave);
    const rotulo = texto(o.texto);
    // A escolha múltipla guarda as chaves separadas por vírgula: uma chave com vírgula partia-se em duas. A base gera as chaves (sem vírgula);
    // se alguma vier com ela, a opção fica de fora em vez de gravar a escolha errada.
    return chave && !chave.includes(",") && rotulo !== null ? [[chave, rotulo, rotulo]] : [];
  });
}

/** O que a organização configurou no orçamento (campo da Emylia, modo, efeitos por unidade e por opção); `undefined` se a base não devolve nada disto. */
function lerEfeitoCfg(cru: Obj): EfeitoCfgPergunta | undefined {
  const campoEmylia = texto(cru.campo_emylia) ?? "";
  const modoCru = texto(cru.efeito_modo);
  const modo = modoCru === "nenhum" || modoCru === "emylia" || modoCru === "proprio" ? modoCru : "";
  const itens = lerItensEfeito(cru.efeito);
  const porOpcao: Record<string, { valorEmylia: string; itens: ItemEfeito[] }> = {};
  for (const o of lista(cru.opcoes)) {
    if (!ehObjeto(o) || o.activa === false) continue;
    const chave = texto(o.chave);
    const valorEmylia = texto(o.valor_emylia) ?? "";
    const dosItens = lerItensEfeito(o.efeito);
    if (chave && (valorEmylia !== "" || dosItens.length > 0)) porOpcao[chave] = { valorEmylia, itens: dosItens };
  }
  if (campoEmylia === "" && modo === "" && itens.length === 0 && Object.keys(porOpcao).length === 0) return undefined;
  return { campoEmylia, modo, itens, porOpcao };
}

/** O tipo e as opções, o limite de caracteres e os limites do número de uma pergunta (só o que o tipo usa). */
function lerPergunta(cru: Obj, chave: string, tipo: TipoPergunta, rotulo: string, conhecidas: ReadonlySet<string>): PerguntaDef {
  const pergunta: PerguntaDef = { id: chave, rotulo: [rotulo, rotulo], literal: true, tipo, opcoes: tipo.startsWith("escolha") ? lerOpcoes(cru.opcoes) : [] };
  if (tipo === "texto") pergunta.textoMax = numeroOuNull(cru.texto_max) ?? TEXTO_MAX_OMISSAO;
  if (tipo === "numero") {
    const n: Obj = ehObjeto(cru.numero) ? cru.numero : {};
    const numero: NumeroDef = { min: numeroOuNull(n.min), max: numeroOuNull(n.max), casas: numeroOuNull(n.casas), unidade: texto(n.unidade) };
    pergunta.numero = numero;
  }
  const efeitoCfg = lerEfeitoCfg(cru);
  if (efeitoCfg) pergunta.efeitoCfg = efeitoCfg;
  const dep = ehObjeto(cru.depende) ? cru.depende : null;
  const alvo = dep ? texto(dep.pergunta_chave) : null;
  // Sem pergunta de que depender (ou uma que a configuração nem tem), a pergunta vê-se: nunca se esconde uma pergunta por uma condição que não se cumpre.
  if (dep && alvo && conhecidas.has(alvo)) {
    const valores = lista(dep.opcoes).filter((v): v is string => typeof v === "string");
    pergunta.se = { pergunta: alvo, valores: dep.sem_resposta === true ? [...valores, ""] : valores };
  }
  return pergunta;
}

/** Perguntas seguidas com o mesmo subtítulo ficam no mesmo bloco (D2); sem subtítulo, o bloco não tem título. */
function emBlocos(seccao: string, perguntas: readonly { bloco: string | null; pergunta: PerguntaDef }[]): BlocoDef[] {
  const blocos: { bloco: string | null; perguntas: PerguntaDef[] }[] = [];
  for (const { bloco, pergunta } of perguntas) {
    const ultimo = blocos[blocos.length - 1];
    if (ultimo && ultimo.bloco === bloco) ultimo.perguntas.push(pergunta);
    else blocos.push({ bloco, perguntas: [pergunta] });
  }
  return blocos.map((b, i) => ({ id: `${seccao}-${i}`, perguntas: b.perguntas, literal: true, ...(b.bloco ? { titulo: [b.bloco, b.bloco] as const } : {}) }));
}

function lerSeccao(cru: unknown, conhecidas: ReadonlySet<string>): SeccaoDef | null {
  if (!ehObjeto(cru) || cru.activa === false) return null;
  const chave = texto(cru.chave);
  const titulo = texto(cru.titulo);
  if (!chave || titulo === null) return null;
  const especial = cru.especial === "visitas" || cru.especial === "medidas" ? cru.especial : undefined;
  const perguntas = especial ? [] : lista(cru.perguntas).flatMap((p) => {
    if (!ehObjeto(p) || p.activa === false) return [];
    const pChave = texto(p.chave);
    const rotulo = texto(p.texto);
    const tipo = TIPOS.find((t) => t === p.tipo);
    if (!pChave || rotulo === null || !tipo) return [];
    return [{ bloco: texto(p.bloco)?.trim() || null, pergunta: lerPergunta(p, pChave, tipo, rotulo, conhecidas) }];
  });
  return {
    id: chave, titulo: [titulo, titulo], literal: true, aba: cru.aba === "qualificacao" ? "qualificacao" : "visita",
    blocos: emBlocos(chave, perguntas), ...(especial ? { especial } : {}),
  };
}

/** As chaves de todas as perguntas (ativas ou não): uma condição só se perde se a pergunta de que depende nem existe. */
function chavesConhecidas(seccoes: readonly unknown[]): Set<string> {
  return new Set(seccoes.flatMap((s) => (ehObjeto(s) ? lista(s.perguntas) : [])).flatMap((p) => (ehObjeto(p) && texto(p.chave) ? [p.chave as string] : [])));
}

/**
 * Lê a resposta de neg_questionario_levantamento pedida SEM inativas (a de quem preenche): secções, perguntas e opções inativas não entram.
 * Devolve null se não for um questionário (nunca inventa perguntas). Itens que não se reconhecem ficam de fora.
 */
export function lerQuestionarioForm(cru: unknown): QuestionarioForm | null {
  if (!ehObjeto(cru)) return null;
  const { versao, seccoes } = cru;
  if (typeof versao !== "number" || !Number.isInteger(versao) || versao < 1 || !Array.isArray(seccoes)) return null;
  const conhecidas = chavesConhecidas(seccoes);
  return { versao, semBase: false, seccoes: seccoes.flatMap((s) => lerSeccao(s, conhecidas) ?? []) };
}
