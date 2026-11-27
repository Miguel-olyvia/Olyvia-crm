/**
 * O que `rpc_ativos_por_devolver` responde, lido com tolerância: as pessoas que saem (ou já saíram) com itens ainda por devolver
 * (equipamento do RH atribuído e viaturas da Frota). Sem o acesso completo, a base responde `detalhe = false`: só as contagens
 * (`total_pessoas`, `total_itens`), com `pessoas` vazio. Aqui isso fica garantido: com `detalhe = false` as pessoas nunca passam,
 * mesmo que a resposta as trouxesse. Quem decide o que cada pessoa vê é a base; o ecrã só apresenta.
 */

export type OrigemDaSaida = "data_saida" | "fim_contrato" | "fim_decidido";
export type OrigemDoItem = "ativo" | "frota";

export interface ItemPorDevolver {
  origem: OrigemDoItem;
  itemId: string;
  /** O ativo (origem «ativo») ou a viatura (origem «frota»). */
  refId: string | null;
  /** O código do ativo, ou a matrícula da viatura. */
  codigo: string | null;
  nome: string | null;
  /** Desde quando está na posse da pessoa (AAAA-MM-DD). */
  desde: string | null;
}

export interface PessoaPorDevolver {
  pessoaId: string;
  /** `null` sem `hr.pessoas.view` (e sem ser a chefia direta). */
  nome: string | null;
  /** A data de saída (AAAA-MM-DD). */
  saidaPrevista: string | null;
  origem: OrigemDaSaida;
  /** Negativo = já saiu. */
  diasRestantes: number | null;
  vinculoId: string | null;
  nItens: number;
  itens: ItemPorDevolver[];
}

export interface PorDevolver {
  hoje: string | null;
  dias: number;
  /** Falso = só contagens (sem pessoas nem itens). */
  detalhe: boolean;
  totalPessoas: number;
  totalItens: number;
  pessoas: PessoaPorDevolver[];
}

const ORIGENS_SAIDA: readonly OrigemDaSaida[] = ["data_saida", "fim_contrato", "fim_decidido"];

const registo = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const texto = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const numeroOuNull = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};
const numero = (v: unknown): number => numeroOuNull(v) ?? 0;

function itemDaResposta(bruto: unknown): ItemPorDevolver | null {
  const r = registo(bruto);
  const itemId = texto(r?.item_id);
  if (!r || !itemId) return null;
  return {
    origem: r.origem === "frota" ? "frota" : "ativo",
    itemId,
    refId: texto(r.ref_id),
    codigo: texto(r.codigo),
    nome: texto(r.nome),
    desde: texto(r.desde),
  };
}

function pessoaDaResposta(bruto: unknown): PessoaPorDevolver | null {
  const r = registo(bruto);
  const pessoaId = texto(r?.pessoa_id);
  if (!r || !pessoaId) return null;
  const itens = (Array.isArray(r.itens) ? r.itens : []).map(itemDaResposta).filter((i): i is ItemPorDevolver => i !== null);
  return {
    pessoaId,
    nome: texto(r.nome),
    saidaPrevista: texto(r.saida_prevista),
    origem: ORIGENS_SAIDA.includes(r.origem as OrigemDaSaida) ? (r.origem as OrigemDaSaida) : "fim_contrato",
    diasRestantes: numeroOuNull(r.dias_restantes),
    vinculoId: texto(r.vinculo_id),
    nItens: numeroOuNull(r.n_itens) ?? itens.length,
    itens,
  };
}

/** O jsonb da base num formato seguro. Uma resposta vazia ou estranha dá zeros e nenhuma pessoa. */
export function porDevolverDaResposta(bruto: unknown): PorDevolver {
  const r = registo(bruto);
  const detalhe = r?.detalhe === true;
  const pessoas = detalhe && Array.isArray(r?.pessoas)
    ? r.pessoas.map(pessoaDaResposta).filter((p): p is PessoaPorDevolver => p !== null)
    : [];
  return {
    hoje: texto(r?.hoje),
    dias: numero(r?.dias),
    detalhe,
    totalPessoas: numero(r?.total_pessoas),
    totalItens: numero(r?.total_itens),
    pessoas,
  };
}

/** A chave do texto dos dias que faltam: «já saiu», «hoje», «amanhã» ou «daqui a N dias» (com `{n}`). */
export function chaveDiasRestantes(dias: number | null): string {
  if (dias === null) return "ativos.saidas.semData";
  if (dias < 0) return "ativos.saidas.jaSaiu";
  if (dias === 0) return "ativos.saidas.hoje";
  return dias === 1 ? "ativos.saidas.amanha" : "ativos.saidas.diasRestantes";
}

/** A chave do texto da faixa («X pessoas saem… com Y itens por devolver»), pelo singular ou plural de cada número; `null` sem ninguém. */
export function resumoDaFaixa(p: Pick<PorDevolver, "totalPessoas" | "totalItens">): string | null {
  if (p.totalPessoas <= 0) return null;
  return `ativos.faixa.${p.totalPessoas === 1 ? "pessoa" : "pessoas"}.${p.totalItens === 1 ? "item" : "itens"}`;
}
