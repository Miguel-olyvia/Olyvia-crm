// O funil e a pontuação das leads (Definições da V2, 13/10/2026). Substitui o diálogo de 5 separadores
// de Leads (LeadWorkflowConfig: etapas, regras de etapa, qualificação MQL/SQL e "dry run"). Funções puras:
// as fases são as seis fixas; cada uma avança por um facto escolhido de uma lista (não se escreve), e a
// pontuação são linhas "Se [campo] [é] [valor] → +N pontos". Nada aqui toca no Estado.
import { FASES } from "../motor";
import { ORIGENS } from "../toquesDocs";

/** Os factos que a Olyvia regista sozinha numa lead (é deles que as fases avançam). */
export type Facto =
  | "formulario" | "chamada" | "email_respondido" | "visita_marcada" | "visita_feita"
  | "orcamento_enviado" | "proposta_aceite" | "contrato_assinado" | "sinal_pago" | "obra_marcada";

export const FACTOS: Record<Facto, string> = {
  formulario: "chegar um formulário",
  chamada: "houver chamada registada",
  email_respondido: "a pessoa responder a um email",
  visita_marcada: "houver visita marcada",
  visita_feita: "a visita estiver feita",
  orcamento_enviado: "o orçamento for enviado",
  proposta_aceite: "a proposta for aceite",
  contrato_assinado: "o contrato estiver assinado",
  sinal_pago: "o sinal estiver pago",
  obra_marcada: "a obra tiver data marcada",
};

/** O que se pode escolher para cada fase (índice da fase → factos possíveis). A fase 0 (Lead) é a entrada. */
export const OPCOES_AVANCO: Record<number, Facto[]> = {
  1: ["chamada", "email_respondido"],
  2: ["visita_marcada", "visita_feita"],
  3: ["orcamento_enviado", "proposta_aceite"],
  4: ["contrato_assinado", "proposta_aceite"],
  5: ["sinal_pago", "obra_marcada"],
};

/** A regra de avanço de cada fase, pela ordem das fases (a posição 0, Lead, fica a null). */
export type RegrasAvanco = (Facto | null)[];

export const AVANCO_INICIAL: RegrasAvanco = [null, "chamada", "visita_marcada", "orcamento_enviado", "contrato_assinado", "sinal_pago"];

/** "Passa a Contacto quando houver chamada registada." */
export function fraseAvanco(fase: number, facto: Facto | null, nomes: readonly string[] = FASES): string {
  if (fase === 0 || !facto) return `Entra como ${nomes[0]} quando chega um formulário, uma chamada ou alguém a cria à mão.`;
  return `Passa a ${nomes[fase]} quando ${FACTOS[facto]}.`;
}

/**
 * A fase de uma lead pelos factos que tem: avança fase a fase enquanto a regra da fase seguinte se cumprir
 * (sem saltar fases: sem chamada não chega à Visita, mesmo que a visita esteja marcada).
 */
export function faseDe(factos: readonly Facto[], regras: RegrasAvanco): number {
  let f = 0;
  for (let i = 1; i < FASES.length; i++) {
    const r = regras[i];
    if (!r || !factos.includes(r)) break;
    f = i;
  }
  return f;
}

/* ------------------------------------------------------------------ pontuação */

export type CampoLead = "origem" | "servico" | "orcamento" | "prazo" | "zona";
export type Operador = "e" | "nao_e";

/** Os campos com que se pontua e os valores que se escolhem (os mesmos dos formulários). */
export const CAMPOS_PONTOS: Record<CampoLead, { nome: string; valores: readonly string[] }> = {
  origem: { nome: "Origem", valores: ORIGENS },
  servico: { nome: "Serviço", valores: ["Casa de banho", "Cozinha", "Outro"] },
  orcamento: { nome: "Orçamento estimado", valores: ["Até 3.000 €", "3.000 a 6.000 €", "6.000 a 10.000 €", "Mais de 10.000 €"] },
  prazo: { nome: "Prazo desejado", valores: ["O mais depressa possível", "1 a 3 meses", "3 a 6 meses"] },
  zona: { nome: "Zona", valores: ["Até 15 km", "15 a 30 km", "Mais de 30 km"] },
};

export const OPERADORES: Record<Operador, string> = { e: "é", nao_e: "não é" };

/** Os pontos que se escolhem numa regra (não se escreve o número). */
export const OPCOES_PONTOS: readonly number[] = [-20, -10, -5, 5, 10, 15, 20, 30];

export interface RegraPontos { id: string; campo: CampoLead; op: Operador; valor: string; pontos: number }

export interface Limiares { mql: number; sql: number }

export const LIMIARES_INICIAIS: Limiares = { mql: 20, sql: 40 };

export const REGRAS_PONTOS_INICIAIS: RegraPontos[] = [
  { id: "r1", campo: "origem", op: "e", valor: "Indicação", pontos: 20 },
  { id: "r2", campo: "servico", op: "nao_e", valor: "Outro", pontos: 10 },
  { id: "r3", campo: "orcamento", op: "e", valor: "Mais de 10.000 €", pontos: 20 },
  { id: "r4", campo: "prazo", op: "e", valor: "O mais depressa possível", pontos: 10 },
  { id: "r5", campo: "zona", op: "e", valor: "Mais de 30 km", pontos: -10 },
];

/** "Se Origem é Indicação → +20 pontos". */
export function fraseRegra(r: RegraPontos): string {
  const p = r.pontos > 0 ? `+${r.pontos}` : `${r.pontos}`;
  return `Se ${CAMPOS_PONTOS[r.campo].nome} ${OPERADORES[r.op]} ${r.valor} → ${p} ${Math.abs(r.pontos) === 1 ? "ponto" : "pontos"}`;
}

export interface LeadExemplo { id: string; nome: string; campos: Record<CampoLead, string>; factos: Facto[] }

export const cumpre = (r: RegraPontos, campos: Record<CampoLead, string>): boolean =>
  r.op === "e" ? campos[r.campo] === r.valor : campos[r.campo] !== r.valor;

export interface Pontuacao { total: number; razoes: { regra: RegraPontos; pontos: number }[] }

/** Soma os pontos das regras que a lead cumpre (nunca abaixo de 0), com as razões pela ordem das regras. */
export function pontuar(campos: Record<CampoLead, string>, regras: readonly RegraPontos[]): Pontuacao {
  const razoes = regras.filter((r) => cumpre(r, campos)).map((regra) => ({ regra, pontos: regra.pontos }));
  return { total: Math.max(0, razoes.reduce((s, x) => s + x.pontos, 0)), razoes };
}

export type Qualificacao = "SQL" | "MQL" | "Por qualificar";

export function qualificar(total: number, l: Limiares): Qualificacao {
  if (total >= l.sql) return "SQL";
  if (total >= l.mql) return "MQL";
  return "Por qualificar";
}

/** O MQL nunca passa o SQL, e nenhum desce abaixo de 0. */
export function acertarLimiares(l: Limiares, mudou: keyof Limiares): Limiares {
  const mql = Math.max(0, l.mql), sql = Math.max(0, l.sql);
  if (mql <= sql) return { mql, sql };
  return mudou === "mql" ? { mql: sql, sql } : { mql, sql: mql };
}

/** As três leads de exemplo do bloco "Experimentar". */
export const LEADS_EXEMPLO: LeadExemplo[] = [
  {
    id: "x1", nome: "Teresa Gomes",
    campos: { origem: "Indicação", servico: "Cozinha", orcamento: "Mais de 10.000 €", prazo: "1 a 3 meses", zona: "Até 15 km" },
    factos: ["formulario", "chamada", "visita_marcada", "visita_feita", "orcamento_enviado"],
  },
  {
    id: "x2", nome: "Paulo Antunes",
    campos: { origem: "Meta Ads", servico: "Casa de banho", orcamento: "3.000 a 6.000 €", prazo: "O mais depressa possível", zona: "15 a 30 km" },
    factos: ["formulario", "chamada"],
  },
  {
    id: "x3", nome: "Helena Costa",
    campos: { origem: "Panfleto", servico: "Outro", orcamento: "Até 3.000 €", prazo: "3 a 6 meses", zona: "Mais de 30 km" },
    factos: ["formulario", "visita_marcada"],
  },
];

export interface Experiencia { lead: LeadExemplo; pontos: Pontuacao; qualificacao: Qualificacao; fase: number }

/** Aplica as regras às leads de exemplo: pontos, qualificação e fase de cada uma. */
export function experimentar(
  leads: readonly LeadExemplo[], cfg: { regras: readonly RegraPontos[]; limiares: Limiares; avanco: RegrasAvanco },
): Experiencia[] {
  return leads.map((lead) => {
    const pontos = pontuar(lead.campos, cfg.regras);
    return { lead, pontos, qualificacao: qualificar(pontos.total, cfg.limiares), fase: faseDe(lead.factos, cfg.avanco) };
  });
}

/** Uma regra nova (a primeira opção de cada lista), com um id que não se repete. */
export function regraNova(regras: readonly RegraPontos[]): RegraPontos {
  let n = regras.length + 1;
  while (regras.some((r) => r.id === `r${n}`)) n++;
  return { id: `r${n}`, campo: "origem", op: "e", valor: CAMPOS_PONTOS.origem.valores[0], pontos: 10 };
}
