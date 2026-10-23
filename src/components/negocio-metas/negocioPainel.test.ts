import { describe, expect, it } from "vitest";
import { verificarDetalhes, type DetalheNegocio } from "./negocioDetalhes";
import { DETALHES_EXEMPLO } from "./negocioDetalhesExemplo";
import type { NegocioMes } from "./negocioMetas";
import { DADOS_EXEMPLO, HOJE_EXEMPLO } from "./negocioMetasExemplo";
import { abasDoNegocio, ehAba, estadoValidade, formatarData } from "./negocioPainel";
import { textoOrcamentos } from "./saudeTexto";

const { negocios } = DADOS_EXEMPLO;
const por = (id: string) => negocios.find((n) => n.id === id) as NegocioMes;
const ids = (n: NegocioMes) => abasDoNegocio(n).map((a) => a.id);

describe("abasDoNegocio", () => {
  it("Resumo, Pessoa e Orçamentos há sempre, com o número de orçamentos", () => {
    const semNada = { ...por("n8"), proposta: null, contrato: null };
    expect(ids(semNada)).toEqual(["resumo", "pessoa", "orcamentos"]);
    expect(abasDoNegocio(semNada).find((a) => a.id === "orcamentos")?.contador).toBe(2);
    expect(abasDoNegocio(semNada).filter((a) => a.contador !== undefined)).toHaveLength(1);
  });
  it("Proposta só se o negócio tem proposta; Contrato só se tem contrato", () => {
    expect(ids(por("n9"))).toEqual(["resumo", "pessoa", "orcamentos", "proposta"]);
    expect(ids(por("n10"))).toEqual(["resumo", "pessoa", "orcamentos", "proposta", "contrato"]);
  });
  it("um negócio sem orçamentos mostra Orçamentos (0)", () => {
    const vazio = { ...por("n8"), orcamentos: [] };
    expect(abasDoNegocio(vazio).find((a) => a.id === "orcamentos")?.contador).toBe(0);
  });
});

describe("ehAba", () => {
  it("só aceita os separadores que o negócio tem", () => {
    expect(ehAba("resumo", por("n8"))).toBe(true);
    expect(ehAba("proposta", por("n8"))).toBe(false);
    expect(ehAba("contrato", por("n9"))).toBe(false);
    expect(ehAba("contrato", por("n10"))).toBe(true);
    expect(ehAba("inventada", por("n10"))).toBe(false);
  });
});

describe("textoOrcamentos", () => {
  const t = (chave: string, params?: Record<string, string | number>) => `${chave}|${params?.count ?? ""}|${params?.chosen ?? ""}`;
  it("usa o singular com um orçamento e o plural nos outros casos", () => {
    expect(textoOrcamentos(por("n3"), t)).toContain("mini.quotesOne");
    expect(textoOrcamentos(por("n1"), t)).toContain("mini.quotes|2|");
    expect(textoOrcamentos({ ...por("n1"), orcamentos: [] }, t)).toContain("mini.quotes|0|");
  });
  it("diz se há um orçamento escolhido", () => {
    expect(textoOrcamentos(por("n3"), t)).toContain("chosenOne");
    expect(textoOrcamentos(por("n8"), t)).toContain("chosenNone");
  });
});

describe("estadoValidade", () => {
  it("válida até ao próprio dia, inclusive", () => {
    expect(estadoValidade("2026-10-13", "2026-10-13")).toEqual({ tipo: "valida", ate: "2026-10-13" });
    expect(estadoValidade("2026-11-12", "2026-10-13")).toEqual({ tipo: "valida", ate: "2026-11-12" });
  });
  it("expirada há N dias a partir do dia seguinte", () => {
    expect(estadoValidade("2026-10-12", "2026-10-13")).toEqual({ tipo: "expirada", dias: 1 });
    expect(estadoValidade("2026-10-01", "2026-10-13")).toEqual({ tipo: "expirada", dias: 12 });
  });
  it("atravessa a mudança de mês e de ano", () => {
    expect(estadoValidade("2026-12-30", "2027-01-02")).toEqual({ tipo: "expirada", dias: 3 });
  });
});

describe("formatarData", () => {
  it("escreve AAAA-MM-DD como DD/MM/AAAA e deixa o resto como está", () => {
    expect(formatarData("2026-10-13")).toBe("13/10/2026");
    expect(formatarData("amanhã")).toBe("amanhã");
  });
});

describe("verificarDetalhes", () => {
  it("os dados de exemplo são coerentes com os negócios", () => {
    expect(verificarDetalhes(negocios, DETALHES_EXEMPLO)).toEqual([]);
  });
  it("há detalhes para os 10 negócios e a proposta enviada do n6 já expirou", () => {
    expect(Object.keys(DETALHES_EXEMPLO)).toHaveLength(negocios.length);
    const validaAte = DETALHES_EXEMPLO.n6.proposta?.validaAte as string;
    expect(estadoValidade(validaAte, HOJE_EXEMPLO)).toEqual({ tipo: "expirada", dias: 2 });
  });
  it("o rascunho (n9) não tem data de envio nem validade", () => {
    expect(DETALHES_EXEMPLO.n9.proposta).toEqual({ orcamentoIds: ["n9-o1"] });
  });
  it("apanha um negócio ou um orçamento que não existe", () => {
    const d: Record<string, DetalheNegocio> = {
      nX: {}, n8: { orcamentos: { "n8-oX": { data: "2026-10-01", estado: "enviado" } } },
    };
    expect(verificarDetalhes(negocios, d)).toEqual([
      "detalhe nX: o negócio não existe", "detalhe n8: o orçamento n8-oX não existe",
    ]);
  });
  it("apanha uma proposta sem o orçamento escolhido", () => {
    const d: Record<string, DetalheNegocio> = { n9: { proposta: { orcamentoIds: [] } } };
    expect(verificarDetalhes(negocios, d)).toEqual(["detalhe n9: a proposta não inclui o orçamento escolhido"]);
  });
  it("apanha um contrato assinado sem data de assinatura", () => {
    const d: Record<string, DetalheNegocio> = { n1: { ...DETALHES_EXEMPLO.n1, contrato: { criadoEm: "2026-10-01" } } };
    expect(verificarDetalhes(negocios, d)).toEqual(["detalhe n1: contrato assinado sem data de assinatura"]);
  });
  it("apanha linhas que não somam o valor do orçamento", () => {
    const d: Record<string, DetalheNegocio> = {
      n3: { ...DETALHES_EXEMPLO.n3, orcamentos: { "n3-o1": { data: "2026-10-01", estado: "aceite", linhas: [{ descricao: "x", valor: 1 }] } } },
    };
    expect(verificarDetalhes(negocios, d)).toEqual(["detalhe n3: as linhas de n3-o1 somam 1, não 7400"]);
  });
  it("apanha uma proposta enviada sem data de envio", () => {
    const d: Record<string, DetalheNegocio> = { n6: { ...DETALHES_EXEMPLO.n6, proposta: { orcamentoIds: ["n6-o1"] } } };
    expect(verificarDetalhes(negocios, d)).toEqual(["detalhe n6: proposta enviada sem data de envio"]);
  });
});
