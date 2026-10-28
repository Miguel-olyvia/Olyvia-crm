// O efeito que uma pergunta (ou uma opção de resposta) do levantamento tem no orçamento, como a organização o configura. Só forma e validação:
// quem aplica o efeito ao orçamento é a Emylia (visitaConfiguravel/). Nada tem valores por omissão: o que não se escreveu não conta.
// A base guarda isto em colunas novas (rascunho supabase/rascunhos/NOVO-20261231998000_levantamento_efeitos.sql, ainda por aplicar): enquanto não
// houver migration, o editor só deixa de mandar estes campos quando estão vazios, e por isso nada do que já se guarda muda.

/** nenhum: a pergunta não mexe no orçamento; emylia: vale o efeito que o campo da Emylia já tem; proprio: valem os efeitos definidos aqui. */
export type ModoEfeito = "nenhum" | "emylia" | "proprio";
export const MODOS_EFEITO: readonly ModoEfeito[] = ["nenhum", "emylia", "proprio"];

/** valor: uma quantia fixa (custo e preço); horas: n horas a um custo/h e a um preço/h; percentagem: % sobre os serviços do orçamento. */
export type TipoItemEfeito = "valor" | "horas" | "percentagem";
export const TIPOS_ITEM_EFEITO: readonly TipoItemEfeito[] = ["valor", "horas", "percentagem"];

export const LIMITES_EFEITO = { itens: 5, descricao: 120, valorMax: 99999999, pctMax: 1000 } as const;

/** Um efeito como a base o guarda e o orçamento o aplica (números). */
export interface ItemEfeito {
  tipo: TipoItemEfeito;
  /** O motivo: é o texto da linha no orçamento e da nota ao vivo. */
  descricao: string;
  custo?: number;
  preco?: number;
  horas?: number;
  custo_hora?: number;
  preco_hora?: number;
  /** Em %, por exemplo 10 = +10% sobre os serviços. */
  pct?: number;
}

/** O mesmo efeito no editor: tudo em texto (vazio = por preencher). */
export interface ItemEfeitoEd {
  tipo: TipoItemEfeito;
  descricao: string;
  custo: string;
  preco: string;
  horas: string;
  custoHora: string;
  precoHora: string;
  pct: string;
}

export const criarItemEfeito = (tipo: TipoItemEfeito = "valor"): ItemEfeitoEd => ({ tipo, descricao: "", custo: "", preco: "", horas: "", custoHora: "", precoHora: "", pct: "" });

type Obj = Record<string, unknown>;
const ehObjeto = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const txt = (v: number | undefined): string => (v === undefined ? "" : String(v));

/** Lê um efeito vindo da base; o que não se reconhece fica de fora (nunca se inventa um efeito). */
export function lerItemEfeito(cru: unknown): ItemEfeito | null {
  if (!ehObjeto(cru)) return null;
  const tipo = TIPOS_ITEM_EFEITO.find((t) => t === cru.tipo);
  if (!tipo || typeof cru.descricao !== "string") return null;
  const item: ItemEfeito = { tipo, descricao: cru.descricao };
  const campos: [keyof ItemEfeito, number | undefined][] = [
    ["custo", num(cru.custo)], ["preco", num(cru.preco)], ["horas", num(cru.horas)], ["custo_hora", num(cru.custo_hora)], ["preco_hora", num(cru.preco_hora)], ["pct", num(cru.pct)],
  ];
  for (const [k, v] of campos) if (v !== undefined) Object.assign(item, { [k]: v });
  return item;
}

export const lerItensEfeito = (cru: unknown): ItemEfeito[] => (Array.isArray(cru) ? cru.map(lerItemEfeito).filter((i): i is ItemEfeito => i !== null) : []);

export const modoDeEfeito = (cru: unknown): ModoEfeito | "" => MODOS_EFEITO.find((m) => m === cru) ?? "";

export const itemParaEditor = (i: ItemEfeito): ItemEfeitoEd => ({
  tipo: i.tipo, descricao: i.descricao, custo: txt(i.custo), preco: txt(i.preco), horas: txt(i.horas), custoHora: txt(i.custo_hora), precoHora: txt(i.preco_hora), pct: txt(i.pct),
});

const numeroTexto = (v: string): number | null => {
  const t = v.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** O efeito como a base o recebe: só os campos do tipo, em números. Um efeito por preencher não chega aqui (a validação recusa-o antes). */
export function itemParaEnvio(i: ItemEfeitoEd): ItemEfeito {
  const base: ItemEfeito = { tipo: i.tipo, descricao: i.descricao.trim() };
  if (i.tipo === "valor") return { ...base, custo: numeroTexto(i.custo) ?? 0, preco: numeroTexto(i.preco) ?? 0 };
  if (i.tipo === "horas") return { ...base, horas: numeroTexto(i.horas) ?? 0, custo_hora: numeroTexto(i.custoHora) ?? 0, preco_hora: numeroTexto(i.precoHora) ?? 0 };
  return { ...base, pct: numeroTexto(i.pct) ?? 0 };
}

/** O que está mal num efeito, em texto para a pessoa; `null` se está bem. */
export function problemaDoItem(i: ItemEfeitoEd): string | null {
  if (i.descricao.trim() === "") return "Escreve o motivo: é o texto que aparece no orçamento.";
  if (i.descricao.trim().length > LIMITES_EFEITO.descricao) return `O motivo tem no máximo ${LIMITES_EFEITO.descricao} caracteres.`;
  const campos: [string, string][] = i.tipo === "valor" ? [["custo", i.custo], ["preço", i.preco]]
    : i.tipo === "horas" ? [["horas", i.horas], ["custo por hora", i.custoHora], ["preço por hora", i.precoHora]]
      : [["percentagem", i.pct]];
  for (const [nome, v] of campos) {
    const n = numeroTexto(v);
    if (n === null) return `Preenche o ${nome}: sem valores por omissão.`;
    if (n < 0) return `O ${nome} não pode ser negativo.`;
    if (n > (i.tipo === "percentagem" ? LIMITES_EFEITO.pctMax : LIMITES_EFEITO.valorMax)) return `O ${nome} é demasiado grande.`;
  }
  return null;
}

/** O primeiro problema de uma lista de efeitos (o limite incluído); `null` se está tudo bem. */
export function problemaDosItens(itens: readonly ItemEfeitoEd[]): string | null {
  if (itens.length > LIMITES_EFEITO.itens) return `No máximo ${LIMITES_EFEITO.itens} efeitos.`;
  for (const i of itens) {
    const p = problemaDoItem(i);
    if (p) return p;
  }
  return null;
}
