import { describe, expect, it } from "vitest";
import {
  cartoesDoMes, conversao, evolucaoMensal, faseDoNegocio, isNegocioGanho,
  percentagem, percentagemBarra, totaisPorComercial, valorDoNegocio, valorGanho,
  verificarCoerencia, type NegocioMes,
} from "./negocioMetas";
import { DADOS_EXEMPLO } from "./negocioMetasExemplo";

const base: NegocioMes = {
  id: "x", pessoa: "P", servico: "S", comercial: "C", dias: 1, parado: null, atraso: false,
  orcamentos: [{ id: "a", valor: 100, escolhido: true }, { id: "b", valor: 300, escolhido: false }],
  proposta: null, contrato: null,
};

describe("percentagem", () => {
  it("arredonda e protege meta 0", () => {
    expect(percentagem(1, 3)).toBe(33);
    expect(percentagem(2, 3)).toBe(67);
    expect(percentagem(5, 0)).toBe(0);
    expect(percentagem(Number.NaN, 10)).toBe(0);
    expect(percentagem(150, 100)).toBe(150);
  });
  it("limita a barra a 0-100", () => {
    expect(percentagemBarra(150, 100)).toBe(100);
    expect(percentagemBarra(-5, 100)).toBe(0);
    expect(percentagemBarra(50, 100)).toBe(50);
  });
});

describe("negócio", () => {
  it("o valor é o do orçamento escolhido", () => {
    expect(valorDoNegocio(base)).toBe(100);
    expect(valorDoNegocio({ ...base, orcamentos: [{ id: "a", valor: 9, escolhido: false }] })).toBe(0);
  });
  it("a fase segue a cadeia", () => {
    expect(faseDoNegocio(base)).toBe("orcamento");
    expect(faseDoNegocio({ ...base, proposta: { estado: "enviada" } })).toBe("proposta");
    expect(
      faseDoNegocio({ ...base, proposta: { estado: "aceite" }, contrato: { estado: "pendente" } }),
    ).toBe("contrato");
    expect(
      faseDoNegocio({ ...base, proposta: { estado: "aceite" }, contrato: { estado: "assinado" } }),
    ).toBe("financeiro");
  });
  it("só um contrato assinado é ganho", () => {
    expect(isNegocioGanho({ ...base, contrato: { estado: "pendente" } })).toBe(false);
    expect(isNegocioGanho({ ...base, contrato: { estado: "assinado" } })).toBe(true);
  });
});

describe("dados de exemplo", () => {
  const { negocios, metasComerciais, metasMes } = DADOS_EXEMPLO;

  it("são coerentes", () => {
    expect(verificarCoerencia(DADOS_EXEMPLO)).toEqual([]);
  });
  it("detecta incoerência", () => {
    const partido = { ...DADOS_EXEMPLO, metasMes: { ...metasMes, valor: 1 } };
    expect(verificarCoerencia(partido)).not.toEqual([]);
  });
  it("o valor ganho soma os contratos assinados", () => {
    expect(valorGanho(negocios)).toBe(9800 + 18500 + 7400 + 14200 + 12900 + 6700);
  });
  it("a soma por comercial é o valor ganho", () => {
    const totais = totaisPorComercial(negocios, metasComerciais);
    expect(totais.reduce((s, t) => s + t.atual, 0)).toBe(valorGanho(negocios));
    const ana = totais.find((t) => t.comercial === "Ana Ribeiro");
    expect(ana).toMatchObject({ atual: 28300, meta: 30000, percentagem: 94 });
  });
  it("a conversão é ganhos sobre negócios", () => {
    expect(conversao(negocios)).toBe(60);
  });
  it("os cartões batem com as metas", () => {
    const [valor, ganhos, conv, propostas] = cartoesDoMes(negocios, metasMes);
    expect(valor).toMatchObject({ atual: 69500, meta: 90000, percentagem: 77 });
    expect(ganhos).toMatchObject({ atual: 6, meta: 8, percentagem: 75 });
    expect(conv).toMatchObject({ atual: 60, meta: 65, percentagem: 92 });
    expect(propostas).toMatchObject({ atual: 8, meta: 10, percentagem: 80 });
  });
  it("a evolução termina no mês atual calculado", () => {
    const evolucao = evolucaoMensal(DADOS_EXEMPLO);
    expect(evolucao).toHaveLength(6);
    expect(evolucao[5]).toEqual({ mes: "2026-10", meta: 90000, ganho: valorGanho(negocios) });
  });
});
