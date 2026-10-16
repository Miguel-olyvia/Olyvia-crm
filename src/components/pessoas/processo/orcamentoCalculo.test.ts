import { describe, expect, it } from "vitest";
import { CATALOGO, novaLinhaDoCatalogo, type ChaveTrabalho } from "./catalogoTrabalhos";
import {
  DESCONTO_MAXIMO, MARGEM_ALVO, MARGEM_MIN, totaisDoOrcamento, verificarOrcamento, type LinhaTrabalho,
} from "./orcamentoCalculo";

/** Uma linha do catálogo, com a quantidade e (se se quiser) outro preço unitário. */
const linha = (trabalho: ChaveTrabalho, quantidade: number, precoUnitario?: number, id = `l-${trabalho}`): LinhaTrabalho => ({
  ...novaLinhaDoCatalogo(trabalho, id), quantidade, ...(precoUnitario === undefined ? {} : { precoUnitario }),
});

describe("constantes da margem", () => {
  it("o mínimo é 28 %, o alvo 35 % e o desconto máximo 50 %", () => {
    expect(MARGEM_MIN).toBe(0.28);
    expect(MARGEM_ALVO).toBe(0.35);
    expect(DESCONTO_MAXIMO).toBe(50);
  });
});

describe("totaisDoOrcamento", () => {
  it("mão de obra leva 6 % de IVA: 10 m² de pavimento a 30 € dão 300 + 18 = 318 €, com custo de 180 € e 40 % de margem", () => {
    const t = totaisDoOrcamento({ linhas: [linha("pavimento", 10)], desconto: 0 });
    expect(t.semDesconto).toBeCloseTo(300, 9);
    expect(t.semIva).toBeCloseTo(300, 9);
    expect(t.iva).toBeCloseTo(18, 9);
    expect(t.total).toBeCloseTo(318, 9);
    expect(t.custo).toBe(180);
    expect(t.margem).toBeCloseTo(0.4, 9);
  });

  it("materiais levam 23 % de IVA: 10 m² de azulejos a 34 € dão 340 + 78,20 = 418,20 €", () => {
    const t = totaisDoOrcamento({ linhas: [linha("azulejos", 10)], desconto: 0 });
    expect(t.semIva).toBeCloseTo(340, 9);
    expect(t.iva).toBeCloseTo(78.2, 9);
    expect(t.total).toBeCloseTo(418.2, 9);
  });

  it("uma obra com mão de obra e materiais soma cada IVA à sua taxa", () => {
    const t = totaisDoOrcamento({ linhas: [linha("pavimento", 10), linha("azulejos", 10)], desconto: 0 });
    expect(t.semIva).toBeCloseTo(640, 9);
    expect(t.iva).toBeCloseTo(18 + 78.2, 9);
    expect(t.total).toBeCloseTo(640 + 18 + 78.2, 9);
    expect(t.custo).toBe(10 * 18 + 10 * 20);
  });

  it("o desconto desce o valor sem IVA e o IVA, mas não o custo: a margem calcula-se depois do desconto", () => {
    const t = totaisDoOrcamento({ linhas: [linha("pavimento", 10)], desconto: 10 });
    expect(t.semDesconto).toBeCloseTo(300, 9);
    expect(t.semIva).toBeCloseTo(270, 9);
    expect(t.iva).toBeCloseTo(16.2, 9);
    expect(t.total).toBeCloseTo(286.2, 9);
    expect(t.custo).toBe(180);
    expect(t.margem).toBeCloseTo((270 - 180) / 270, 9);
  });

  it("sem linhas tudo é zero, sem dividir por zero", () => {
    expect(totaisDoOrcamento({ linhas: [], desconto: 0 })).toEqual({ semDesconto: 0, semIva: 0, iva: 0, total: 0, custo: 0, margem: 0 });
  });

  it("a margem é sobre o valor sem IVA (o IVA nunca a infla)", () => {
    const a = totaisDoOrcamento({ linhas: [linha("azulejos", 1)], desconto: 0 });
    expect(a.margem).toBeCloseTo((34 - 20) / 34, 9);
  });
});

describe("verificarOrcamento: a margem exata", () => {
  // Pavimento: custo 18 €. A 25 € a margem é exatamente 28 %.
  it("28 % passa: sem bloqueios (só o aviso de estar abaixo do alvo)", () => {
    const v = verificarOrcamento({ linhas: [linha("pavimento", 10, 25)], desconto: 0 });
    expect(v.totais.margem).toBeCloseTo(0.28, 9);
    expect(v.bloqueios).toEqual([]);
    expect(v.duro).toBe(false);
    expect(v.avisos).toEqual([{ tipo: "abaixoDoAlvo", margem: v.totais.margem }]);
  });

  it("27,9 % bloqueia: margem abaixo do mínimo, sem o preço estar abaixo do custo", () => {
    // Eletricidade: custo 40 €. A 55,50 € a margem é 27,93 %.
    const v = verificarOrcamento({ linhas: [linha("eletricidade", 4, 55.5)], desconto: 0 });
    expect(v.totais.margem).toBeGreaterThan(0.279);
    expect(v.totais.margem).toBeLessThan(0.28);
    expect(v.bloqueios).toEqual([{ tipo: "margemBaixa", margem: v.totais.margem }]);
    expect(v.duro).toBe(false);
    expect(v.avisos).toEqual([]);
  });

  it("um cêntimo abaixo dos 28 % já bloqueia (24,99 € contra 25 €)", () => {
    expect(verificarOrcamento({ linhas: [linha("pavimento", 10, 25)], desconto: 0 }).bloqueios).toEqual([]);
    expect(verificarOrcamento({ linhas: [linha("pavimento", 10, 24.99)], desconto: 0 }).bloqueios).toHaveLength(1);
  });

  it("abaixo do alvo (35 %) é só um aviso, e com 35 % exatos já não há aviso nenhum", () => {
    const abaixo = verificarOrcamento({ linhas: [linha("pavimento", 10, 27)], desconto: 0 });
    expect(abaixo.bloqueios).toEqual([]);
    expect(abaixo.avisos).toEqual([{ tipo: "abaixoDoAlvo", margem: abaixo.totais.margem }]);
    // Caixilharia: custo 260 €. A 400 € a margem é exatamente 35 %.
    const exata = verificarOrcamento({ linhas: [linha("caixilharia", 2, 400)], desconto: 0 });
    expect(exata.totais.margem).toBeCloseTo(0.35, 9);
    expect(exata.avisos).toEqual([]);
    expect(exata.bloqueios).toEqual([]);
  });
});

describe("verificarOrcamento: preço abaixo do custo (bloqueio duro)", () => {
  it("um preço unitário abaixo do custo é um bloqueio duro, com a sugestão custo/(1 - 0,28) arredondada para cima", () => {
    const v = verificarOrcamento({ linhas: [linha("pavimento", 10, 17, "p1")], desconto: 0 });
    expect(v.duro).toBe(true);
    expect(v.bloqueios).toEqual([
      { tipo: "abaixoDoCusto", linha: "p1", trabalho: "pavimento", precoUnitario: 17, custo: 18, sugestao: 25 },
    ]);
  });

  it("a sugestão arredonda sempre para cima: custo 320 € dá 445 € (444,44)", () => {
    const v = verificarOrcamento({ linhas: [linha("bancaPorDuche", 1, 300)], desconto: 0 });
    expect(v.bloqueios[0]).toMatchObject({ tipo: "abaixoDoCusto", custo: CATALOGO.bancaPorDuche.custo, sugestao: 445 });
  });

  it("com a sugestão aplicada o bloqueio desaparece (a margem fica nos 28 % ou acima)", () => {
    const v = verificarOrcamento({ linhas: [linha("canalizacao", 3, 50)], desconto: 0 });
    const b = v.bloqueios[0];
    if (b.tipo !== "abaixoDoCusto") throw new Error("devia ser abaixoDoCusto");
    const depois = verificarOrcamento({ linhas: [linha("canalizacao", 3, b.sugestao)], desconto: 0 });
    expect(depois.bloqueios).toEqual([]);
  });

  it("preço igual ao custo não é 'abaixo do custo' (cai no bloqueio mole da margem)", () => {
    const v = verificarOrcamento({ linhas: [linha("pavimento", 10, 18)], desconto: 0 });
    expect(v.duro).toBe(false);
    expect(v.bloqueios).toEqual([{ tipo: "margemBaixa", margem: 0 }]);
  });

  it("cada linha abaixo do custo tem o seu bloqueio, e enquanto houver um duro não há bloqueio mole nem aviso", () => {
    const v = verificarOrcamento({ linhas: [linha("pavimento", 10, 10, "a"), linha("pintura", 10, 2, "b"), linha("paredes", 10)], desconto: 0 });
    expect(v.bloqueios.map((b) => b.tipo)).toEqual(["abaixoDoCusto", "abaixoDoCusto"]);
    expect(v.avisos).toEqual([]);
  });
});

describe("verificarOrcamento: o desconto", () => {
  it("um desconto que baixa a margem de cima dos 28 % para baixo é o bloqueio 'descontoBaixaMargem' (a sugestão é tirá-lo)", () => {
    // A 30 € a margem é 40 %; com 20 % de desconto passa a 25 %.
    const v = verificarOrcamento({ linhas: [linha("pavimento", 10)], desconto: 20 });
    expect(v.totais.margem).toBeLessThan(MARGEM_MIN);
    expect(v.bloqueios).toEqual([{ tipo: "descontoBaixaMargem", margem: v.totais.margem }]);
    expect(v.duro).toBe(false);
  });

  it("tirar o desconto resolve o bloqueio", () => {
    const v = verificarOrcamento({ linhas: [linha("pavimento", 10)], desconto: 0 });
    expect(v.bloqueios).toEqual([]);
  });

  it("se mesmo sem desconto a margem já está abaixo dos 28 %, o bloqueio é a margem baixa (tirar o desconto não adiantava)", () => {
    const v = verificarOrcamento({ linhas: [linha("pavimento", 10, 20)], desconto: 5 });
    expect(v.bloqueios).toEqual([{ tipo: "margemBaixa", margem: v.totais.margem }]);
  });

  it("um desconto pequeno que mantém os 28 % não bloqueia", () => {
    const v = verificarOrcamento({ linhas: [linha("pavimento", 10)], desconto: 5 });
    expect(v.bloqueios).toEqual([]);
  });
});

describe("verificarOrcamento: sem alterar a entrada", () => {
  it("não muda as linhas que recebe", () => {
    const linhas = Object.freeze([Object.freeze(linha("pavimento", 10, 17))]);
    const antes = JSON.stringify(linhas);
    verificarOrcamento({ linhas, desconto: 0 });
    totaisDoOrcamento({ linhas, desconto: 0 });
    expect(JSON.stringify(linhas)).toBe(antes);
  });
});

describe("verificarOrcamento: uma venda abaixo do custo (margem negativa) é bloqueio duro", () => {
  // 5 m² de pavimento a 20 € = 100 € de venda, com custo de 5 x 18 = 90 €.
  const venda = (desconto: number) => verificarOrcamento({ linhas: [linha("pavimento", 5, 20)], desconto });

  it("100 € com custo de 90 € e 50 % de desconto: a venda (50 €) fica abaixo do custo, bloqueio duro que a Direção nunca aprova", () => {
    const v = venda(50);
    expect(v.duro).toBe(true);
    expect(v.bloqueios).toHaveLength(1);
    expect(v.bloqueios[0]).toMatchObject({ tipo: "vendaAbaixoDoCusto", custo: 90 });
    expect(v.avisos).toEqual([]);
  });

  it("o mesmo orçamento com 10 % de desconto fica a 90 € (margem 0 %): bloqueio mole, aprovável", () => {
    const v = venda(10);
    expect(v.duro).toBe(false);
    // Sem o desconto a margem já era de 10 %, abaixo dos 28 %: a causa é a margem baixa e não o desconto.
    expect(v.bloqueios).toEqual([{ tipo: "margemBaixa", margem: 0 }]);
  });

  it("um desconto que deixa a margem entre 0 % e 28 % continua a ser mole", () => {
    const v = venda(5);
    expect(v.totais.margem).toBeGreaterThan(0);
    expect(v.totais.margem).toBeLessThan(MARGEM_MIN);
    expect(v.duro).toBe(false);
    expect(v.bloqueios.map((b) => b.tipo)).toEqual(["margemBaixa"]);
  });

  it("o bloqueio traz a venda sem IVA e o custo (o ecrã diz os dois e sugere tirar o desconto, que é sempre a causa)", () => {
    expect(venda(50).bloqueios[0]).toEqual({ tipo: "vendaAbaixoDoCusto", semIva: 50, custo: 90 });
  });

  it("sem desconto não há venda abaixo do custo: cada linha já cobre o seu custo", () => {
    expect(verificarOrcamento({ linhas: [linha("pavimento", 5, 18)], desconto: 0 }).duro).toBe(false);
  });

  it("um preço unitário abaixo do custo continua a ser o bloqueio por linha, e vem primeiro", () => {
    const v = verificarOrcamento({ linhas: [linha("pavimento", 5, 10, "a")], desconto: 50 });
    expect(v.bloqueios.map((b) => b.tipo)).toEqual(["abaixoDoCusto"]);
  });
});
