// As condições da proposta como se guardam em `proposals.terms` (jsonb): prazo de execução, início previsto, pagamento e garantia. A validade
// e as notas NÃO entram: a validade tem a coluna `valid_until` e as notas a coluna `notes`. `terms` chega ao portal anónimo da proposta (vai no
// snapshot publicado), por isso nunca leva nada interno (margens, custos, notas da equipa). A base só exige que seja um objeto: o formato é este.
// Funções puras, sem base.

export const PAGAMENTOS_TERMOS = ["adjudicacao", "metade", "tres", "fases"] as const;
export const GARANTIAS_TERMOS = [1, 2, 5] as const;

export type PagamentoTermos = (typeof PAGAMENTOS_TERMOS)[number];
export type GarantiaTermos = (typeof GARANTIAS_TERMOS)[number];

export interface CondicoesTermos {
  /** Dias úteis de obra. */
  prazo: number;
  /** AAAA-MM-DD. */
  inicio: string;
  pagamento: PagamentoTermos;
  /** Anos. */
  garantia: GarantiaTermos;
}

/** O que se lê de `terms`: as condições, ou `null` se não há; `legivel: false` quando há conteúdo num formato que esta página não conhece. */
export interface TermosLidos {
  condicoes: CondicoesTermos | null;
  legivel: boolean;
}

/** Exatamente as quatro chaves, e mais nada (mesmo que o objeto de entrada traga outras). */
export function paraTermos(c: CondicoesTermos): Record<string, string | number> {
  return { prazo_execucao_dias: c.prazo, inicio_previsto: c.inicio, pagamento: c.pagamento, garantia_anos: c.garantia };
}

const DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

function diaExiste(texto: string): boolean {
  const m = DIA.exec(texto);
  if (!m) return false;
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const data = new Date(Date.UTC(a, mes - 1, d));
  return data.getUTCFullYear() === a && data.getUTCMonth() === mes - 1 && data.getUTCDate() === d;
}

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Lê `proposals.terms`. Sem conteúdo (null, undefined, `{}`) é legível e vazio; um formato desconhecido ou incompleto nunca rebenta. */
export function lerTermos(terms: unknown): TermosLidos {
  if (terms === null || terms === undefined) return { condicoes: null, legivel: true };
  if (!ehObjeto(terms)) return { condicoes: null, legivel: false };
  if (Object.keys(terms).length === 0) return { condicoes: null, legivel: true };
  const { prazo_execucao_dias: prazo, inicio_previsto: inicio, pagamento, garantia_anos: garantia } = terms;
  const valido = typeof prazo === "number" && Number.isInteger(prazo) && prazo > 0
    && typeof inicio === "string" && diaExiste(inicio)
    && PAGAMENTOS_TERMOS.some((p) => p === pagamento)
    && GARANTIAS_TERMOS.some((g) => g === garantia);
  if (!valido) return { condicoes: null, legivel: false };
  return { condicoes: { prazo, inicio, pagamento: pagamento as PagamentoTermos, garantia: garantia as GarantiaTermos }, legivel: true };
}
