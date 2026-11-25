// As variáveis nos textos do template de PROPOSTA (23/11, pedido do dono: os «Termos e condições» dependem das «Condições de
// pagamento» do negócio). Os textos do template (header_text, description, terms_conditions, thank_you_message, footer_text) podem
// ter {{condicoes_pagamento}}, {{validade}}, {{prazo}}, {{garantia}} e {{cliente_nome}}; quem mostra o documento (o portal, a
// pré-visualização do passo «Proposta» no CRM e o PDF) troca-as pelos dados do negócio.
// Regras:
//  · um texto sem estas variáveis sai byte a byte igual (os templates de hoje não mudam);
//  · uma variável conhecida sem dados (proposta sem negócio, ou negócio sem a vista) fica VAZIA: o cliente nunca vê as chavetas;
//  · uma variável desconhecida ({{outra}}) fica como está;
//  · em HTML o valor é escapado (o texto do template é HTML e passa depois pelo DOMPurify).

export type VariavelDaProposta = "condicoes_pagamento" | "validade" | "prazo" | "garantia" | "cliente_nome";
export type VariaveisDaProposta = Partial<Record<VariavelDaProposta, string>>;

/** As variáveis disponíveis, pela ordem do editor, com o que dizem (em português; o editor de templates é do CRM). */
export const VARIAVEIS_DA_PROPOSTA: readonly { chave: VariavelDaProposta; descricao: string; exemplo: string }[] = [
  { chave: "condicoes_pagamento", descricao: "As prestações escolhidas nas «Condições de pagamento» do negócio", exemplo: "50% - Adjudicação / 50% - Fim da obra" },
  { chave: "validade", descricao: "Até quando a proposta é válida", exemplo: "30/12/2026" },
  { chave: "prazo", descricao: "O prazo da obra", exemplo: "12 dias úteis" },
  { chave: "garantia", descricao: "A garantia da obra", exemplo: "2 anos" },
  { chave: "cliente_nome", descricao: "O nome do cliente (o fiscal, se houver)", exemplo: "Ana Silva" },
];

const CONHECIDAS = new Set<string>(VARIAVEIS_DA_PROPOSTA.map((x) => x.chave));
const PADRAO = /\{\{\s*([a-z_]+)\s*\}\}/g;

const escaparHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Troca as variáveis conhecidas pelos valores (vazio sem valor); as desconhecidas ficam. `html`: escapa o valor. */
export function substituirVariaveis(texto: string, valores: VariaveisDaProposta | null | undefined, op: { html?: boolean } = {}): string {
  return texto.replace(PADRAO, (inteiro, nome: string) => {
    if (!CONHECIDAS.has(nome)) return inteiro;
    const v = valores?.[nome as VariavelDaProposta] ?? "";
    return op.html ? escaparHtml(v) : v;
  });
}

/** O texto tem alguma das variáveis conhecidas? */
export function temVariaveisConhecidas(texto: string | null | undefined): boolean {
  if (!texto) return false;
  for (const m of texto.matchAll(PADRAO)) if (CONHECIDAS.has(m[1])) return true;
  return false;
}

/** O valor é texto com alguma coisa escrita, sem contar as etiquetas HTML («<p></p>» não conta). */
export function temTextoUtil(v: unknown): boolean {
  return typeof v === "string" && v.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length > 0;
}

/** Os textos do template que aceitam variáveis. */
export const TEXTOS_COM_VARIAVEIS = ["header_text", "description", "terms_conditions", "thank_you_message", "footer_text"] as const;

/** O template com as variáveis trocadas nos cinco textos (são HTML: valores escapados). Sem variáveis, devolve o MESMO objeto.
 *  Aceita qualquer objeto (os templates chegam com tipos diferentes: a linha da base, o modelo do PDF, o do editor). */
export function textosComVariaveis<T extends object>(tpl: T | null | undefined, valores: VariaveisDaProposta | null | undefined): T | null {
  if (!tpl) return null;
  let novo: Record<string, unknown> | null = null;
  for (const k of TEXTOS_COM_VARIAVEIS) {
    const v = (tpl as Record<string, unknown>)[k];
    if (typeof v === "string" && temVariaveisConhecidas(v)) {
      novo = novo ?? { ...(tpl as Record<string, unknown>) };
      novo[k] = substituirVariaveis(v, valores, { html: true });
    }
  }
  return novo ? (novo as T) : tpl;
}

/** O momento da prestação como o dono o escreve no template («Adjudicação», «Início da obra», «Fim da obra»); os outros como a Emylia os escreve. */
const MOMENTO: Record<string, string> = {
  "Na adjudicação": "Adjudicação",
  "No arranque da obra": "Início da obra",
  "A meio da obra": "Meio da obra",
  "No fim da obra": "Fim da obra",
  "No fim, antes da entrega": "Fim da obra",
};

const percentagem = (p: number): string => String(Math.round(p * 1000) / 10).replace(".", ",");

/** As prestações em texto: «50% - Adjudicação / 25% - Início da obra / 25% - Fim da obra». */
export function condicoesDePagamentoTexto(prestacoes: readonly { l: string; p: number }[]): string {
  return prestacoes.map((x) => `${percentagem(x.p)}% - ${MOMENTO[x.l] ?? x.l}`).join(" / ");
}

/** O texto tem as condições de pagamento escritas à mão (percentagens junto de «pagamento»/«adjudicação») em vez da variável? */
export function pagamentoFixoEscritoAMao(texto: string | null | undefined): boolean {
  if (!texto || /\{\{\s*condicoes_pagamento\s*\}\}/.test(texto)) return false;
  const limpo = texto.replace(/<[^>]*>/g, " ");
  return /pagamento|adjudica/i.test(limpo) && /\d{1,3}\s*%/.test(limpo);
}

/** «3. Condições de Pagamento: 50% - Adjudicação / …» → o que vem depois dos dois pontos. */
const LINHA_DO_PAGAMENTO = /(condi[çc][õo]es de pagamento\s*:\s*)([^\n<]*\d{1,3}\s*%[^\n<]*)/i;

/** Os termos com o pagamento escrito à mão trocado por {{condicoes_pagamento}}; null se não há a linha «Condições de pagamento: …». */
export function trocarPagamentoPelaVariavel(termos: string): string | null {
  return LINHA_DO_PAGAMENTO.test(termos) ? termos.replace(LINHA_DO_PAGAMENTO, "$1{{condicoes_pagamento}}") : null;
}
