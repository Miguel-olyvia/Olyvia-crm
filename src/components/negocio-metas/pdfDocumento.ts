// O PDF de exemplo de cada documento do negócio (orçamento, proposta, contrato). Lógica pura: o nome do ficheiro e o
// conteúdo (título, campos e linhas já escritos) saem dos dados do negócio; nada aqui toca no DOM nem grava nada. Quem
// desenha o PDF e o descarrega está em `pdfGerar.ts`.
import { formatarMeta } from "./formatoMetas";
import type { DetalheNegocio } from "./negocioDetalhes";
import { valorDoNegocio, type NegocioMes, type OrcamentoNegocio } from "./negocioMetas";
import { formatarData } from "./negocioPainel";

export type DocumentoPdf =
  | { tipo: "orcamento"; orcamento: OrcamentoNegocio }
  | { tipo: "proposta" }
  | { tipo: "contrato" };

export type Traduzir = (chave: string, params?: Record<string, string | number>) => string;

export interface ConteudoPdf {
  /** O título, com "(minuta)" quando o documento ainda não está fechado. */
  titulo: string;
  minuta: boolean;
  campos: { rotulo: string; valor: string }[];
  /** Cabeçalho e linhas do orçamento (só um orçamento com linhas as tem). */
  tituloLinhas: string;
  linhas: { descricao: string; valor: string }[];
  rodape: string;
}

const P = "businessGoals.painel.";

/** O valor do documento: o do próprio orçamento, ou o do orçamento escolhido na proposta e no contrato. */
export function valorDoDocumento(documento: DocumentoPdf, negocio: NegocioMes): number {
  return documento.tipo === "orcamento" ? documento.orcamento.valor : valorDoNegocio(negocio);
}

/** "orcamento-n1-8600.pdf": tipo, negócio e valor (euros inteiros), só com letras minúsculas, números e hífenes. */
export function nomeFicheiroPdf(documento: DocumentoPdf, negocio: NegocioMes): string {
  const id = negocio.id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "negocio";
  return `${documento.tipo}-${id}-${Math.round(valorDoDocumento(documento, negocio))}.pdf`;
}

/** Minuta: o orçamento em rascunho, a proposta em rascunho e o contrato por assinar (o PDF é uma pré-visualização). */
export function ehMinuta(documento: DocumentoPdf, negocio: NegocioMes, detalhe: DetalheNegocio | null): boolean {
  if (documento.tipo === "orcamento") return detalhe?.orcamentos?.[documento.orcamento.id]?.estado === "rascunho";
  if (documento.tipo === "proposta") return negocio.proposta?.estado === "rascunho";
  return negocio.contrato?.estado === "pendente";
}

type Campos = ConteudoPdf["campos"];

const comum = (negocio: NegocioMes, t: Traduzir): Campos => [
  { rotulo: t(`${P}pdf.field.person`), valor: negocio.pessoa },
  { rotulo: t(`${P}pdf.field.service`), valor: negocio.servico || "—" },
  { rotulo: t(`${P}pdf.field.salesperson`), valor: negocio.comercial },
];

function camposOrcamento(orcamento: OrcamentoNegocio, detalhe: DetalheNegocio | null, t: Traduzir): Campos {
  const d = detalhe?.orcamentos?.[orcamento.id];
  return [
    { rotulo: t(`${P}proposal.value`), valor: formatarMeta("euro", orcamento.valor) },
    ...(d ? [
      { rotulo: t(`${P}proposal.state`), valor: t(`${P}quotes.state.${d.estado}`) },
      { rotulo: t(`${P}pdf.field.date`), valor: formatarData(d.data) },
    ] : []),
    ...(orcamento.escolhido ? [{ rotulo: t(`${P}pdf.field.chosen`), valor: t(`${P}pdf.yes`) }] : []),
  ];
}

function camposProposta(negocio: NegocioMes, detalhe: DetalheNegocio | null, t: Traduzir): Campos {
  const proposta = negocio.proposta;
  const d = detalhe?.proposta;
  if (!proposta) return [];
  const incluidos = negocio.orcamentos.filter((o) => d?.orcamentoIds.includes(o.id));
  return [
    { rotulo: t(`${P}proposal.state`), valor: t(`businessGoals.proposal.${proposta.estado}`) },
    { rotulo: t(`${P}proposal.value`), valor: formatarMeta("euro", valorDoNegocio(negocio)) },
    { rotulo: t(`${P}proposal.sentOn`), valor: proposta.estado === "rascunho" || !d?.enviadaEm ? t(`${P}proposal.notSent`) : formatarData(d.enviadaEm) },
    ...(d?.validaAte && proposta.estado !== "rascunho" ? [{ rotulo: t(`${P}pdf.field.validUntil`), valor: formatarData(d.validaAte) }] : []),
    ...(incluidos.length > 0 ? [{ rotulo: t(`${P}proposal.quotes`), valor: incluidos.map((o) => formatarMeta("euro", o.valor)).join(" · ") }] : []),
  ];
}

function camposContrato(negocio: NegocioMes, detalhe: DetalheNegocio | null, t: Traduzir): Campos {
  const contrato = negocio.contrato;
  const d = detalhe?.contrato;
  if (!contrato) return [];
  const assinado = contrato.estado === "assinado";
  return [
    { rotulo: t(`${P}contract.state`), valor: t(`businessGoals.contract.${contrato.estado}`) },
    { rotulo: t(`${P}contract.value`), valor: formatarMeta("euro", valorDoNegocio(negocio)) },
    ...(d?.criadoEm ? [{ rotulo: t(`${P}contract.created`), valor: formatarData(d.criadoEm) }] : []),
    { rotulo: t(`${P}contract.signedOn`), valor: assinado && d?.assinadoEm ? formatarData(d.assinadoEm) : t(`${P}contract.awaiting`) },
    ...(assinado && d?.assinatura
      ? [{ rotulo: t(`${P}contract.signedBy`), valor: t(`${P}contract.signature`, { quem: d.assinatura.quem, como: t(`${P}contract.how.${d.assinatura.como}`) }) }]
      : []),
  ];
}

const TITULO = { orcamento: "pdf.title.quote", proposta: "pdf.title.proposal", contrato: "pdf.title.contract" } as const;

/** Tudo o que o PDF mostra, já traduzido e formatado. Sem tocar no DOM. */
export function montarConteudoPdf(
  documento: DocumentoPdf, negocio: NegocioMes, detalhe: DetalheNegocio | null, t: Traduzir,
): ConteudoPdf {
  const minuta = ehMinuta(documento, negocio, detalhe);
  const proprios = documento.tipo === "orcamento" ? camposOrcamento(documento.orcamento, detalhe, t)
    : documento.tipo === "proposta" ? camposProposta(negocio, detalhe, t) : camposContrato(negocio, detalhe, t);
  const linhas = documento.tipo === "orcamento" ? detalhe?.orcamentos?.[documento.orcamento.id]?.linhas ?? [] : [];
  const titulo = t(`${P}${TITULO[documento.tipo]}`);
  return {
    titulo: minuta ? `${titulo} ${t(`${P}pdf.draftMark`)}` : titulo,
    minuta,
    campos: [...comum(negocio, t), ...proprios],
    tituloLinhas: t(`${P}quotes.lines`),
    linhas: linhas.map((l) => ({ descricao: l.descricao, valor: formatarMeta("euro", l.valor) })),
    rodape: t(`${P}pdf.footer`),
  };
}
