// Contratos do fluxo do Negócio (Emylia) na página de Contratos — 23/11/2026, auditoria de permissões (lote Contratos/Portal).
// A mesma regra do servidor (fn_neg_documento_do_fluxo_emylia): pelo negócio, pela adenda ou pelo orçamento (o contrato de suporte da
// venda direta não tem negocio_id). Nestes contratos só o cliente assina (no portal) e o contrato assinado anula-se no Negócio
// (neg_anular_contrato): a página não oferece «Marcar como Assinado» nem «Anular contrato» que o servidor recusaria sempre.
// Sem leitura de uma linha (RLS) o contrato conta como do CRM: o ecrã fica como estava e o servidor continua a decidir.

export interface ContratoParaFluxo {
  id: string;
  negocio_id?: string | null;
  adenda_id?: string | null;
  quote_id?: string | null;
}

export interface LinhasDoFluxo {
  negocios: { id: string; fluxo_emylia?: boolean | null }[];
  adendas: { id: string; negocio_id?: string | null }[];
  quotes: { id: string; fluxo_emylia?: boolean | null; negocio_id?: string | null }[];
}

/** Os ids a ler para decidir: negócios (do contrato, da adenda e do orçamento), adendas e orçamentos. */
export function idsParaFluxo(contratos: ContratoParaFluxo[]): { negocios: string[]; adendas: string[]; quotes: string[] } {
  const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];
  return {
    negocios: uniq(contratos.map((c) => c.negocio_id)),
    adendas: uniq(contratos.map((c) => c.adenda_id)),
    quotes: uniq(contratos.map((c) => c.quote_id)),
  };
}

/** Os ids dos contratos que são do fluxo do Negócio (Emylia). */
export function contratosDoFluxoNegocio(contratos: ContratoParaFluxo[], linhas: LinhasDoFluxo): Set<string> {
  const negEmylia = new Set(linhas.negocios.filter((n) => n.fluxo_emylia === true).map((n) => n.id));
  const adendaNeg = new Map(linhas.adendas.map((a) => [a.id, a.negocio_id ?? null]));
  const quoteDoFluxo = new Set(
    linhas.quotes.filter((q) => q.fluxo_emylia === true || (!!q.negocio_id && negEmylia.has(q.negocio_id))).map((q) => q.id),
  );
  const out = new Set<string>();
  for (const c of contratos) {
    const peloNegocio = !!c.negocio_id && negEmylia.has(c.negocio_id);
    const negDaAdenda = c.adenda_id ? adendaNeg.get(c.adenda_id) : null;
    const pelaAdenda = !!negDaAdenda && negEmylia.has(negDaAdenda);
    const peloOrcamento = !!c.quote_id && quoteDoFluxo.has(c.quote_id);
    if (peloNegocio || pelaAdenda || peloOrcamento) out.add(c.id);
  }
  return out;
}
