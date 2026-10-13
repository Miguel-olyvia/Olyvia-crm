// Os detalhes de um negócio que o painel mostra e que `NegocioMes` não guarda: as linhas e as datas dos
// orçamentos, a proposta e o contrato. Só tipos e uma verificação pura; os dados de exemplo estão em
// `negocioDetalhesExemplo.ts`. `NegocioMes` não muda: totais, metas e contagens saem dele, nunca daqui.
import type { NegocioMes } from "./negocioMetas";

export type EstadoOrcamentoDetalhe = "rascunho" | "enviado" | "aceite" | "recusado";

export interface LinhaOrcamento {
  descricao: string;
  valor: number;
}

export interface OrcamentoDetalhe {
  /** AAAA-MM-DD. */
  data: string;
  estado: EstadoOrcamentoDetalhe;
  linhas?: LinhaOrcamento[];
}

export interface PropostaDetalhe {
  /** AAAA-MM-DD; sem data enquanto é rascunho. */
  enviadaEm?: string;
  /** AAAA-MM-DD; sem data enquanto é rascunho. */
  validaAte?: string;
  orcamentoIds: string[];
}

export interface AssinaturaContrato {
  quem: string;
  como: "digital" | "presencial";
}

export interface ContratoDetalhe {
  criadoEm: string;
  assinadoEm?: string;
  assinatura?: AssinaturaContrato;
}

export interface DetalheNegocio {
  /** Por id do orçamento. */
  orcamentos?: Record<string, OrcamentoDetalhe>;
  proposta?: PropostaDetalhe;
  contrato?: ContratoDetalhe;
}

/** Lista o que não bate certo entre os detalhes e os negócios; vazia quando tudo é coerente. */
export function verificarDetalhes(negocios: readonly NegocioMes[], detalhes: Record<string, DetalheNegocio>): string[] {
  const problemas: string[] = [];
  for (const [id, d] of Object.entries(detalhes)) {
    const negocio = negocios.find((n) => n.id === id);
    if (!negocio) { problemas.push(`detalhe ${id}: o negócio não existe`); continue; }
    const ids = new Set(negocio.orcamentos.map((o) => o.id));
    for (const [oid, o] of Object.entries(d.orcamentos ?? {})) {
      if (!ids.has(oid)) { problemas.push(`detalhe ${id}: o orçamento ${oid} não existe`); continue; }
      const valor = negocio.orcamentos.find((x) => x.id === oid)?.valor;
      const soma = o.linhas?.reduce((s, l) => s + l.valor, 0);
      if (soma !== undefined && soma !== valor) problemas.push(`detalhe ${id}: as linhas de ${oid} somam ${soma}, não ${valor}`);
    }
    const escolhido = negocio.orcamentos.find((o) => o.escolhido)?.id;
    if (d.proposta && (!escolhido || !d.proposta.orcamentoIds.includes(escolhido))) {
      problemas.push(`detalhe ${id}: a proposta não inclui o orçamento escolhido`);
    }
    if (d.proposta && !negocio.proposta) problemas.push(`detalhe ${id}: proposta nos detalhes, mas o negócio não tem`);
    if (negocio.proposta && negocio.proposta.estado !== "rascunho" && !d.proposta?.enviadaEm) {
      problemas.push(`detalhe ${id}: proposta enviada sem data de envio`);
    }
    if (d.contrato && !negocio.contrato) problemas.push(`detalhe ${id}: contrato nos detalhes, mas o negócio não tem`);
    if (negocio.contrato?.estado === "assinado" && !d.contrato?.assinadoEm) {
      problemas.push(`detalhe ${id}: contrato assinado sem data de assinatura`);
    }
  }
  return problemas;
}
