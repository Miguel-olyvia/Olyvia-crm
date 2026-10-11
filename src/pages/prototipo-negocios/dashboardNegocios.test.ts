import { describe, expect, it } from "vitest";
import { seed } from "./motor";
import { cartoesV2 } from "./negociosDocs";
import { semPaginaPropria } from "./negociosApp";
import { SEM_FILTROS_N, linhasNegocios, selecionarQuadro, type ContextoN, type FiltrosN } from "./filtrosNegocios";
import {
  cartoesNegocios, funilFases, passosEmAtraso, perdidosPorMotivo, porFaixa, porFechar, porServicoN, porTipoN, resultadosN, tempoParado, valorPorComercial,
} from "./dashboardNegocios";

const S = seed();
const linhas = linhasNegocios(S);
const ctx = (f: Partial<FiltrosN> = {}, rapido = "todos"): ContextoN => ({ rapido, q: "", f: { ...SEM_FILTROS_N, ...f } });
const cartao = (id: string, c: ContextoN = ctx()) => cartoesNegocios(linhas, c).find((x) => x.id === id)!;
const soma = (b: { n: number }[]): number => b.reduce((a, x) => a + x.n, 0);
const somaEuros = (b: { euros?: number }[]): number => b.reduce((a, x) => a + (x.euros ?? 0), 0);
const FILTROS: [Partial<FiltrosN>, string][] = [[{}, "todos"], [{ fase: "proposta" }, "todos"], [{ distrito: "Setúbal" }, "meus"], [{ periodo: "7" }, "todos"], [{ tipo: "direta" }, "wc"], [{ faixa: "mais6" }, "coz"], [{ orcamentos: "2+" }, "todos"]];

describe("dashboard de Negócios · os cartões com os dados de exemplo (sem filtros)", () => {
  it("seis cartões: No Quadro, Por fechar, Ponderado, Ganhos, Conversão e Com 2 ou mais orçamentos", () => {
    expect(cartoesNegocios(linhas, ctx()).map((c) => c.id)).toEqual(["quadro", "porfechar", "ponderado", "ganhos", "conversao", "duas"]);
  });
  it("14 no Quadro; 10 por fechar (67.809,04 €) e 40.492,33 € ponderados só sobre esses 10", () => {
    expect(cartao("quadro").valor).toBe(14);
    expect(cartao("porfechar").valor).toBe(10);
    expect(cartao("porfechar").nota).toBe("no valor de 67.809,04 €: Orçamento, Proposta e Contrato por assinar");
    expect(cartao("ponderado").valor).toBeCloseTo(40492.328, 2); // 5 x 50 % + 4 x 70 % + 1 x 90 %, negócio a negócio (os 4 em Financeiro já não contam)
  });
  it("6 ganhos (39.992,66 €), 4 perdidos e 60 % de conversão, os três em todo o período", () => {
    expect(cartao("ganhos").valor).toBe(6);
    expect(cartao("ganhos").nota).toBe("em todo o período, no valor de 39.992,66 €.");
    expect(cartao("conversao").valor).toBe(60);
    expect(cartao("conversao").pct).toBe(true);
    expect(cartao("conversao").nota).toBe("6 ganhos e 4 perdidos, em todo o período.");
  });
  it("4 negócios com 2 ou mais orçamentos, e o filtro dá os mesmos 4 cartões do Quadro", () => {
    expect(cartao("duas").valor).toBe(4);
    expect(cartao("quadro", ctx({ orcamentos: "2+" })).valor).toBe(4);
  });
  it("nenhum negócio é contado em 'Por fechar' e em 'Ganhos' ao mesmo tempo (nem com filtros)", () => {
    for (const [f, r] of FILTROS) {
      const c = ctx(f, r), F = selecionarQuadro(linhas, c), ids = new Set(porFechar(F).map((l) => l.id));
      for (const g of resultadosN(linhas, c).ganhos) expect(ids.has(g.id), `${g.id} ${JSON.stringify(f)}`).toBe(false);
      expect(cartao("porfechar", c).valor).toBe(ids.size);
    }
    const F = selecionarQuadro(linhas, ctx());
    expect(porFechar(F).length + F.filter((l) => l.ganho).length).toBe(F.length); // cada negócio do Quadro é uma coisa ou a outra
  });
  it("com fase, 'Com atraso' ou parado ligados os cartões dos ganhos e da conversão avisam que não dependem deles", () => {
    for (const c of [ctx({ fase: "proposta" }), ctx({}, "atraso"), ctx({ parado: "ate7" })]) {
      expect(cartao("ganhos", c).nota).toContain("Não depende da fase, do atraso nem do tempo parado.");
      expect(cartao("conversao", c).nota).toContain("Não depende da fase, do atraso nem do tempo parado.");
    }
    expect(cartao("ganhos").nota).not.toContain("Não depende");
    expect(cartao("ganhos", ctx({ distrito: "Faro" })).nota).not.toContain("Não depende");
  });
  it("'Com atraso' e a fase não mexem nos ganhos nem nos perdidos, e o 'Com atraso' só muda o Quadro", () => {
    const r = resultadosN(linhas, ctx());
    for (const c of [ctx({}, "atraso"), ctx({ fase: "orcamento" }), ctx({ parado: "mais14" })]) {
      const x = resultadosN(linhas, c);
      expect([x.ganhos.length, x.perdidos.length]).toEqual([r.ganhos.length, r.perdidos.length]);
    }
  });
});

describe("dashboard de Negócios · os números batem com o Quadro e com os filtros", () => {
  it("no Quadro e 2 ou mais orçamentos são os dos cartões do Quadro com os mesmos filtros; por fechar são os que ainda não são ganhos", () => {
    for (const [f, r] of FILTROS) {
      const c = ctx(f, r), F = selecionarQuadro(linhas, c), cartoes = F.map((l) => l.cartao!);
      expect(cartao("quadro", c).valor, JSON.stringify(f) + r).toBe(cartoes.length);
      expect(cartao("duas", c).valor).toBe(cartoes.filter((x) => x.orcamentos >= 2).length);
      expect(cartao("porfechar", c).valor).toBe(F.filter((l) => !l.ganho).length);
      expect(cartao("ponderado", c).valor).toBeCloseTo(F.filter((l) => !l.ganho).reduce((a, l) => a + ((l.valor ?? 0) * l.prob) / 100, 0), 5);
    }
  });
  it("sem filtros, 'No Quadro' são os 14 de cartoesV2 e o valor do funil é a soma dos valores deles", () => {
    const todos = cartoesV2(S);
    expect(cartao("quadro").valor).toBe(todos.length);
    expect(somaEuros(funilFases(selecionarQuadro(linhas, ctx())))).toBeCloseTo(todos.reduce((a, c) => a + (c.valor ?? 0), 0), 5);
  });
  it("a soma das barras de cada gráfico é o total do Quadro (e o valor soma o valor do Quadro)", () => {
    for (const [f, r] of FILTROS) {
      const c = ctx(f, r), F = selecionarQuadro(linhas, c), total = F.length, valor = F.reduce((a, l) => a + (l.valor ?? 0), 0);
      for (const barras of [funilFases(F), porServicoN(F), porTipoN(F), porFaixa(F)]) expect(soma(barras), JSON.stringify(f)).toBe(total);
      expect(somaEuros(funilFases(F))).toBeCloseTo(valor, 5);
      expect(somaEuros(valorPorComercial(F))).toBeCloseTo(valor, 5);
      expect(soma(valorPorComercial(F))).toBe(total);
      expect(soma(tempoParado(F))).toBe(F.filter((l) => l.parado !== null).length);
    }
  });
  it("cada barra com ação mostra o número de cartões do Quadro depois de carregar nela", () => {
    for (const [f, r] of FILTROS) {
      const c = ctx(f, r), F = selecionarQuadro(linhas, c);
      const barras = [...funilFases(F), ...valorPorComercial(F), ...porServicoN(F), ...porTipoN(F), ...porFaixa(F), ...tempoParado(F)];
      for (const b of barras.filter((x) => x.acao)) {
        const depois = selecionarQuadro(linhas, { ...c, f: { ...c.f, ...b.acao!.f } }).length;
        expect(b.n, `${JSON.stringify(f)} ${b.id}`).toBe(depois);
      }
      expect(barras.filter((x) => !x.acao).every((x) => x.n === 0 || x.id === "sem")).toBe(true);
    }
  });
  it("o ganho, o perdido e a conversão batem entre si e com o gráfico dos motivos, na mesma janela (todo o período)", () => {
    for (const [f, r] of FILTROS) {
      const c = ctx(f, r), { ganhos, perdidos } = resultadosN(linhas, c);
      expect(cartao("ganhos", c).valor).toBe(ganhos.length);
      expect(cartao("conversao", c).nota).toContain(`${ganhos.length} ganhos e ${perdidos.length} perdidos`);
      expect(soma(perdidosPorMotivo(perdidos))).toBe(perdidos.length);
      const t = ganhos.length + perdidos.length;
      expect(cartao("conversao", c).valor).toBe(t === 0 ? 0 : Math.round((100 * ganhos.length) / t));
    }
  });
});

describe("dashboard de Negócios · os gráficos com os dados de exemplo (sem filtros)", () => {
  const F = selecionarQuadro(linhas, ctx());
  it("funil: 5 em Orçamento (40.100 €), 4 em Proposta (22.479,04 €), 1 em Contrato (5.230 €) e 4 em Financeiro (32.550,94 €)", () => {
    const f = funilFases(F);
    expect(f.map((b) => [b.rotulo, b.n])).toEqual([["Orçamento", 5], ["Proposta", 4], ["Contrato", 1], ["Financeiro", 4]]);
    expect(f.map((b) => Math.round(b.euros ?? 0))).toEqual([40100, 22479, 5230, 32551]);
  });
  it("valor por comercial: só há um (Rúben) com os 14 negócios", () => {
    const v = valorPorComercial(F);
    expect(v.map((b) => [b.rotulo, b.n])).toEqual([["Rúben", 14]]);
  });
  it("casa de banho 5, cozinha 5, outros serviços 4; com contrato 11, venda direta 3", () => {
    expect(porServicoN(F).map((b) => b.n)).toEqual([5, 5, 4]);
    expect(porTipoN(F).map((b) => [b.rotulo, b.n])).toEqual([["Com contrato", 11], ["Venda direta", 3]]);
  });
  it("faixas de valor: 1, 4 e 9", () => {
    expect(porFaixa(F).map((b) => b.n)).toEqual([1, 4, 9]);
  });
  it("tempo parado em Orçamento e Proposta: os 9 estão há 7 dias ou menos (nenhum mais parado)", () => {
    expect(tempoParado(F).map((b) => [b.rotulo, b.n])).toEqual([["0 a 7 dias", 9], ["8 a 14 dias", 0], ["Mais de 14 dias", 0]]);
  });
  it("perdidos por motivo: Adiou 2 e Preço 2 (o 'preço' e o 'adiou' dos exemplos entram com maiúscula)", () => {
    expect(perdidosPorMotivo(resultadosN(linhas, ctx()).perdidos).map((b) => [b.rotulo, b.n])).toEqual([["Adiou", 2], ["Preço", 2]]);
  });
  it("próximos passos em atraso: nenhum com os dados de exemplo; com o negócio da Carla marcado com atraso, um", () => {
    expect(passosEmAtraso(F)).toEqual([]);
    const T = seed();
    T.deals.find((d) => d.id === 1031)!.atraso = true;
    const l = linhasNegocios(T), passos = passosEmAtraso(selecionarQuadro(l, ctx()));
    expect(passos.map((p) => [p.nome, p.negocioId])).toEqual([["Carla Nunes", 1031]]);
    expect(passos[0].proximo).toBeTruthy();
    expect(cartoesNegocios(l, ctx({}, "atraso")).find((c) => c.id === "quadro")!.valor).toBe(1);
  });
});

describe("dashboard de Negócios · estados vazios e pureza", () => {
  it("sem negócios, os números ficam a zero e os gráficos sem barras com valor", () => {
    const c = ctx({ distrito: "Coimbra", servico: "coz" }), F = selecionarQuadro(linhas, c);
    expect(F).toEqual([]);
    expect(cartoesNegocios(linhas, c).filter((x) => x.id !== "ganhos" && x.id !== "conversao").every((x) => x.valor === 0)).toBe(true);
    expect(soma(funilFases(F))).toBe(0);
    expect(valorPorComercial(F)).toEqual([]);
    expect(porFaixa(F).map((b) => b.n)).toEqual([0, 0, 0]);
    expect(cartao("conversao", c).valor).toBe(0);
  });
  it("nada muda o Estado", () => {
    const antes = JSON.stringify(S);
    cartoesNegocios(linhas, ctx());
    funilFases(linhas);
    expect(JSON.stringify(S)).toBe(antes);
  });
});

describe("dashboard de Negócios · próximos passos em atraso", () => {
  it("um negócio de exemplo com atraso forçado não aparece (não tem página para abrir); um da seed com atraso aparece", () => {
    const exemplo = linhas.find((l) => l.cartao && semPaginaPropria(l.negocio))!;
    const real = linhas.find((l) => l.cartao && !semPaginaPropria(l.negocio))!;
    const forcadas = linhas.map((l) => (l === exemplo || l === real ? { ...l, atraso: true } : l));
    const ids = passosEmAtraso(forcadas).map((p) => p.id);
    expect(ids).toContain(real.id);
    expect(ids).not.toContain(exemplo.id);
  });
});
