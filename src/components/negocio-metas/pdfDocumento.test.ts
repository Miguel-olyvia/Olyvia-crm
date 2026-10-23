import { describe, expect, it } from "vitest";
import { negocioMetasTranslations } from "@/translations/negocioMetas";
import { DETALHES_EXEMPLO } from "./negocioDetalhesExemplo";
import type { DetalheNegocio } from "./negocioDetalhes";
import type { NegocioMes } from "./negocioMetas";
import { DADOS_EXEMPLO } from "./negocioMetasExemplo";
import { ehMinuta, montarConteudoPdf, nomeFicheiroPdf, valorDoDocumento, type DocumentoPdf } from "./pdfDocumento";

const t = (chave: string, params?: Record<string, string | number>): string =>
  Object.entries(params ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), negocioMetasTranslations.pt[chave] ?? chave);

const negocio = (id: string): NegocioMes => DADOS_EXEMPLO.negocios.find((n) => n.id === id)!;
const orcamento = (n: NegocioMes, id: string) => n.orcamentos.find((o) => o.id === id)!;

describe("nomeFicheiroPdf", () => {
  it("diz o tipo, o negócio e o valor em euros inteiros", () => {
    const n6 = negocio("n6");
    expect(nomeFicheiroPdf({ tipo: "orcamento", orcamento: orcamento(n6, "n6-o1") }, n6)).toBe("orcamento-n6-8600.pdf");
    expect(nomeFicheiroPdf({ tipo: "proposta" }, n6)).toBe("proposta-n6-8600.pdf");
    expect(nomeFicheiroPdf({ tipo: "contrato" }, negocio("n10"))).toBe("contrato-n10-24000.pdf");
  });

  it("o valor da proposta e do contrato é o do orçamento escolhido, e o de um orçamento é o dele", () => {
    const n1 = negocio("n1");
    expect(valorDoDocumento({ tipo: "proposta" }, n1)).toBe(9800);
    expect(valorDoDocumento({ tipo: "orcamento", orcamento: orcamento(n1, "n1-o2") }, n1)).toBe(11200);
  });

  it("não deixa caracteres estranhos do id no nome e arredonda o valor", () => {
    const estranho: NegocioMes = { ...negocio("n6"), id: "N Novo/1 ✓", orcamentos: [{ id: "x", valor: 1234.6, escolhido: true }] };
    expect(nomeFicheiroPdf({ tipo: "proposta" }, estranho)).toBe("proposta-n-novo-1-1235.pdf");
    expect(nomeFicheiroPdf({ tipo: "proposta" }, { ...estranho, id: "///" })).toBe("proposta-negocio-1235.pdf");
  });
});

describe("ehMinuta", () => {
  it("é minuta o rascunho e o contrato por assinar", () => {
    const n9 = negocio("n9");
    const n10 = negocio("n10");
    expect(ehMinuta({ tipo: "proposta" }, n9, null)).toBe(true);
    expect(ehMinuta({ tipo: "proposta" }, negocio("n6"), null)).toBe(false);
    expect(ehMinuta({ tipo: "contrato" }, n10, null)).toBe(true);
    expect(ehMinuta({ tipo: "contrato" }, negocio("n1"), null)).toBe(false);
  });

  it("um orçamento só é minuta se o detalhe o diz rascunho", () => {
    const n = negocio("n9");
    const o = n.orcamentos[0];
    const detalhe: DetalheNegocio = { orcamentos: { [o.id]: { data: "2026-10-01", estado: "rascunho" } } };
    expect(ehMinuta({ tipo: "orcamento", orcamento: o }, n, detalhe)).toBe(true);
    expect(ehMinuta({ tipo: "orcamento", orcamento: o }, n, null)).toBe(false);
  });
});

describe("montarConteudoPdf", () => {
  it("o orçamento leva pessoa, serviço, valor, estado, data e as linhas", () => {
    const n = negocio("n10");
    const o = orcamento(n, "n10-o1");
    const detalhe: DetalheNegocio = {
      orcamentos: { "n10-o1": { data: "2026-09-30", estado: "aceite", linhas: [{ descricao: "Obra", valor: 24000 }] } },
    };
    const c = montarConteudoPdf({ tipo: "orcamento", orcamento: o }, n, detalhe, t);
    expect(c.titulo).toBe("Orçamento");
    expect(c.minuta).toBe(false);
    const campos = Object.fromEntries(c.campos.map((x) => [x.rotulo, x.valor]));
    expect(campos).toMatchObject({
      Pessoa: "Vasco Pinto", "Serviço": "Remodelação total", Comercial: "Ana Ribeiro", Estado: "Aceite", Data: "30/09/2026",
      "Orçamento escolhido": "Sim",
    });
    expect(campos.Valor).toContain("24.000");
    expect(c.linhas).toHaveLength(1);
    expect(c.linhas[0].descricao).toBe("Obra");
    expect(c.rodape).toMatch(/exemplo/);
  });

  it("a proposta enviada leva a data de envio e a validade; o rascunho diz que ainda não foi enviada e fica marcado como minuta", () => {
    const enviada = montarConteudoPdf({ tipo: "proposta" }, negocio("n6"), DETALHES_EXEMPLO.n6 ?? null, t);
    expect(enviada.titulo).toBe("Proposta");
    expect(enviada.campos.map((x) => x.rotulo)).toContain("Válida até");
    const rascunho = montarConteudoPdf({ tipo: "proposta" }, negocio("n9"), DETALHES_EXEMPLO.n9 ?? null, t);
    expect(rascunho.titulo).toBe("Proposta (minuta)");
    expect(rascunho.minuta).toBe(true);
    const enviadaEm = rascunho.campos.find((x) => x.rotulo === "Enviada em");
    expect(enviadaEm?.valor).toBe("Ainda não enviada");
    expect(rascunho.campos.map((x) => x.rotulo)).not.toContain("Válida até");
  });

  it("o contrato pendente aguarda assinatura; o assinado diz quando e como", () => {
    const pendente = montarConteudoPdf({ tipo: "contrato" }, negocio("n10"), null, t);
    expect(pendente.titulo).toBe("Contrato (minuta)");
    expect(pendente.campos.find((x) => x.rotulo === "Assinado em")?.valor).toBe("Aguarda assinatura");
    const detalhe: DetalheNegocio = {
      contrato: { criadoEm: "2026-09-01", assinadoEm: "2026-09-05", assinatura: { quem: "Marta Silveira", como: "digital" } },
    };
    const assinado = montarConteudoPdf({ tipo: "contrato" }, negocio("n1"), detalhe, t);
    const campos = Object.fromEntries(assinado.campos.map((x) => [x.rotulo, x.valor]));
    expect(assinado.minuta).toBe(false);
    expect(campos["Assinado em"]).toBe("05/09/2026");
    expect(campos["Criado em"]).toBe("01/09/2026");
    expect(campos.Assinatura).toBe("Marta Silveira · digital");
  });

  it("um documento que o negócio não tem fica só com os dados comuns, sem rebentar", () => {
    const semProposta = montarConteudoPdf({ tipo: "proposta" } as DocumentoPdf, negocio("n8"), null, t);
    expect(semProposta.campos.map((x) => x.rotulo)).toEqual(["Pessoa", "Serviço", "Comercial"]);
    const semContrato = montarConteudoPdf({ tipo: "contrato" }, negocio("n8"), null, t);
    expect(semContrato.campos).toHaveLength(3);
  });
});
