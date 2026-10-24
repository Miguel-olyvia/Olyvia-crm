// DADOS DE EXEMPLO dos detalhes de cada negócio do painel. Não vêm da base de dados: as datas são
// relativas a HOJE_EXEMPLO (para não envelhecerem) e as linhas dos orçamentos são inventadas (a interface acrescenta "(exemplo)"), mas somam o valor
// de cada orçamento (ver `verificarDetalhes`). `DADOS_EXEMPLO` não muda.
import type { DetalheNegocio, OrcamentoDetalhe, EstadoOrcamentoDetalhe } from "./negocioDetalhes";
import { HOJE_EXEMPLO } from "./negocioMetasExemplo";

const MS_DIA = 86_400_000;

/** O dia que fica `dias` dias antes (ou, com valor negativo, depois) de hoje, em AAAA-MM-DD. */
function antes(dias: number): string {
  const [ano, mes, dia] = HOJE_EXEMPLO.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia) - dias * MS_DIA).toISOString().slice(0, 10);
}

/** Um orçamento com duas linhas de exemplo que somam `valor` (cerca de dois terços na primeira). */
function orc(valor: number, estado: EstadoOrcamentoDetalhe, dias: number): OrcamentoDetalhe {
  const primeira = Math.round((valor * 0.65) / 100) * 100;
  return {
    data: antes(dias), estado,
    linhas: [
      { descricao: "Mão de obra", valor: primeira },
      { descricao: "Materiais", valor: valor - primeira },
    ],
  };
}

/** Uma proposta enviada `enviada` dias atrás, válida `validade` dias. */
const proposta = (enviada: number, validade: number, ids: string[]) => ({
  enviadaEm: antes(enviada), validaAte: antes(enviada - validade), orcamentoIds: ids,
});

/** Um contrato criado e assinado em dias passados, assinado por quem o negócio é. */
const assinado = (criado: number, assinadoHa: number, quem: string, como: "digital" | "presencial" = "digital") => ({
  criadoEm: antes(criado), assinadoEm: antes(assinadoHa), assinatura: { quem, como },
});

/** Os detalhes por id de negócio (os 10 do `DADOS_EXEMPLO`). */
export const DETALHES_EXEMPLO: Record<string, DetalheNegocio> = {
  n1: {
    orcamentos: { "n1-o1": orc(9800, "aceite", 26), "n1-o2": orc(11200, "recusado", 26) },
    proposta: proposta(18, 30, ["n1-o1"]), contrato: assinado(8, 5, "Marta Silveira"),
  },
  n2: {
    orcamentos: { "n2-o1": orc(16900, "recusado", 38), "n2-o2": orc(18500, "aceite", 36), "n2-o3": orc(21000, "recusado", 36) },
    proposta: proposta(22, 30, ["n2-o2"]), contrato: assinado(12, 9, "Rui Figueiredo", "presencial"),
  },
  n3: {
    orcamentos: { "n3-o1": orc(7400, "aceite", 22) },
    proposta: proposta(15, 30, ["n3-o1"]), contrato: assinado(7, 4, "Helena Tavares"),
  },
  n4: {
    orcamentos: { "n4-o1": orc(14200, "aceite", 30), "n4-o2": orc(15800, "recusado", 30) },
    proposta: proposta(20, 30, ["n4-o1"]), contrato: assinado(10, 6, "Paulo Neves", "presencial"),
  },
  n5: {
    orcamentos: { "n5-o1": orc(12900, "aceite", 25) },
    proposta: proposta(14, 30, ["n5-o1"]), contrato: assinado(6, 3, "Sofia Matos"),
  },
  n6: {
    // Enviada há 9 dias, com 7 de validade: já expirou (mostra o estado "expirada").
    orcamentos: { "n6-o1": orc(8600, "aceite", 11), "n6-o2": orc(9400, "enviado", 11) },
    proposta: proposta(9, 7, ["n6-o1"]),
  },
  n7: {
    orcamentos: { "n7-o1": orc(6700, "aceite", 18) },
    proposta: proposta(12, 30, ["n7-o1"]), contrato: assinado(5, 2, "Inês Pacheco"),
  },
  n8: {
    orcamentos: { "n8-o1": orc(5200, "enviado", 15), "n8-o2": orc(6100, "enviado", 12) },
  },
  n9: {
    // A proposta ainda é rascunho: sem data de envio nem validade.
    orcamentos: { "n9-o1": orc(15200, "aceite", 5) },
    proposta: { orcamentoIds: ["n9-o1"] },
  },
  n10: {
    orcamentos: { "n10-o1": orc(24000, "aceite", 13), "n10-o2": orc(27500, "recusado", 13) },
    proposta: proposta(8, 30, ["n10-o1"]), contrato: { criadoEm: antes(3) },
  },
};
