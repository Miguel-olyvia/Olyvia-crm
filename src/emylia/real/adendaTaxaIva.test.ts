// 19/11 (auditoria, lote 2, ponto 4): a taxa de IVA das linhas das adendas vem da base (20270124030000: quote_lines.iva_percent com
// iva_explicita, devolvida como taxa_iva). A dedução pelo nome (a linha dos produtos do acerto a 23%) fica só para as linhas antigas.
import { describe, expect, it } from "vitest";
import { LINHA_ACERTO_PRODUTOS } from "../adendas";
import { adendaDeLinhas, ivaDaLinhaLida, type LinhaAdendaLinha } from "./negocioReal";

const lida = (o: Partial<LinhaAdendaLinha>): LinhaAdendaLinha => ({
  ordem: 0, servico: null, chave: "x", livre: true, descricao: "Linha", unidade: "vg", quantidade: 1, preco_un: 100, horas_un: 0, perfil: "",
  perfil_chave: null, custo_un: null, mao_obra_un: null, materiais: null, ...o,
});

describe("ivaDaLinhaLida", () => {
  it("a taxa da base vale primeiro, mesmo contra o nome", () => {
    expect(ivaDaLinhaLida(lida({ taxa_iva: 23 }))).toEqual({ iva: 23 });
    expect(ivaDaLinhaLida(lida({ taxa_iva: 6, descricao: `${LINHA_ACERTO_PRODUTOS} da medida`, chave: "acerto-p" }))).toEqual({ iva: 6 });
    // a base devolve numeric: "23.00" ou 23.00 contam como 23
    expect(ivaDaLinhaLida(lida({ taxa_iva: "23.00" as unknown as number }))).toEqual({ iva: 23 });
  });
  it("19/11 (1009): sem taxa na base é uma linha antiga, assinada a 6%: nada se deduz pelo nome (não muda o total de uma adenda assinada)", () => {
    expect(ivaDaLinhaLida(lida({ taxa_iva: null, descricao: `${LINHA_ACERTO_PRODUTOS} da medida`, chave: "acerto-p" }))).toEqual({});
    expect(ivaDaLinhaLida(lida({ descricao: `${LINHA_ACERTO_PRODUTOS} da medida`, chave: "acerto-p6" }))).toEqual({});
    expect(ivaDaLinhaLida(lida({ descricao: "Mão de obra" }))).toEqual({});
  });
  it("uma taxa que não é 6 nem 23 não se usa nem se deduz", () => {
    expect(ivaDaLinhaLida(lida({ taxa_iva: 13, descricao: `${LINHA_ACERTO_PRODUTOS} da medida`, chave: "acerto-p" }))).toEqual({});
  });
});

describe("a adenda lida da base", () => {
  it("cada linha fica com a taxa que a base devolve", () => {
    const L = {
      numero: 1, referencia: "AD 2026/1031-1", estado: "rascunho", motivo: "Teste", criada_em: null, enviada_em: null, aceite_em: null, assinada_em: null,
      recusada_em: null, recusa: null, vista: false, total: 250, total_com_iva: 0, origem: null, contratos: [], faturas: [],
      versoes: [{ versao: 1, estado: "rascunho", desconto: 0, verificado: false, aprovacao: null, motivos: [], nota: null, pedido_cliente: null,
        enviado_em: null, aceite_em: null, substituido_em: null, total: 250, total_com_iva: null,
        linhas: [lida({ ordem: 0, taxa_iva: 23 }), lida({ ordem: 1, taxa_iva: 6 }), lida({ ordem: 2, taxa_iva: null })] }],
    } as unknown as Parameters<typeof adendaDeLinhas>[0];
    expect(adendaDeLinhas(L).linhas.map((x) => x.iva)).toEqual([23, 6, undefined]);
  });
});
