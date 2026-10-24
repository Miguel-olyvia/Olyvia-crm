import { describe, expect, it } from "vitest";
import { seed, type LinhaId } from "./motor";
import { cartoesV2 } from "./negociosDocs";
import {
  SEM_FILTROS_N, chipsAtivosN, linhasNegocios, opcoesN, selecionarQuadro, selecionarResultados, type ContextoN, type FiltrosN,
} from "./filtrosNegocios";

const S = seed();
const linhas = linhasNegocios(S);
const ctx = (f: Partial<FiltrosN> = {}, rapido = "todos", q = ""): ContextoN => ({ rapido, q, f: { ...SEM_FILTROS_N, ...f } });
const ids = (c: ContextoN): string[] => selecionarQuadro(linhas, c).map((l) => l.id);
const conta = (f: Partial<FiltrosN>, rapido = "todos", q = ""): number => ids(ctx(f, rapido, q)).length;

describe("filtros de Negócios · as linhas", () => {
  it("o Quadro tem os mesmos 14 cartões de cartoesV2, pela mesma ordem de negócios", () => {
    const quadro = selecionarQuadro(linhas, ctx());
    expect(quadro).toHaveLength(14);
    expect(new Set(quadro.map((l) => l.id))).toEqual(new Set(cartoesV2(S).map((c) => c.id)));
    expect(linhas.filter((l) => l.perdido !== null)).toHaveLength(4);
  });
  it("não muda o Estado", () => {
    const antes = JSON.stringify(S);
    linhasNegocios(S);
    selecionarQuadro(linhas, ctx({ distrito: "Faro" }));
    expect(JSON.stringify(S)).toBe(antes);
  });
});

describe("filtros de Negócios · iguais aos do Quadro de hoje (filtro rápido e pesquisa)", () => {
  /** A regra que a página tinha antes dos novos filtros, copiada para comparar. */
  const antiga = (rapido: string, q: string): string[] =>
    cartoesV2(S).filter((c) => {
      const d = c.deal, ql = q.toLowerCase();
      if (ql && !(c.nome + " " + d.tel + " " + c.servico + " " + c.local).toLowerCase().includes(ql)) return false;
      if (rapido === "meus") return d.dono === "comercial";
      if (rapido === "wc" || rapido === "coz") return c.linhasFiltro.includes(rapido as LinhaId);
      if (rapido === "atraso") return !!d.atraso;
      return true;
    }).map((c) => c.id);
  it.each(["meus", "todos", "atraso", "wc", "coz"])("o filtro rápido %s", (r) => {
    expect(new Set(ids(ctx({}, r)))).toEqual(new Set(antiga(r, "")));
  });
  it("a pesquisa", () => {
    for (const q of ["Carla", "tiago", "cozinha", "Setúbal", "zzz"]) expect(new Set(ids(ctx({}, "todos", q)))).toEqual(new Set(antiga("todos", q)));
  });
  it("com atraso quando o motor marca um negócio", () => {
    const T = seed();
    T.deals.find((d) => d.id === 1031)!.atraso = true;
    const l = linhasNegocios(T);
    expect(selecionarQuadro(l, ctx({}, "atraso")).map((x) => x.id)).toEqual(["neg-1031"]);
  });
});

describe("filtros de Negócios · cada filtro isolado (contados à mão sobre os 14 negócios do Quadro)", () => {
  it("comercial", () => {
    expect(conta({ comercial: "Rúben" })).toBe(14);
    expect(conta({ comercial: "Sandra" })).toBe(0);
  });
  it("fase: 5 em Orçamento, 4 em Proposta, 1 em Contrato e 4 em Financeiro", () => {
    expect((["orcamento", "proposta", "contrato", "financeiro"] as const).map((fase) => conta({ fase }))).toEqual([5, 4, 1, 4]);
  });
  it("tipo: 3 vendas diretas e 11 com contrato", () => {
    expect(conta({ tipo: "direta" })).toBe(3);
    expect(conta({ tipo: "contrato" })).toBe(11);
  });
  it("número de orçamentos: 4 com 2 ou mais", () => {
    expect(conta({ orcamentos: "2+" })).toBe(4);
    expect(conta({ orcamentos: "1" })).toBe(10);
  });
  it("faixa de valor: 1 até 3.000, 4 de 3.000 a 6.000 e 9 acima", () => {
    expect([conta({ faixa: "ate3" }), conta({ faixa: "3a6" }), conta({ faixa: "mais6" })]).toEqual([1, 4, 9]);
  });
  it("distrito da pessoa", () => {
    expect([conta({ distrito: "Setúbal" }), conta({ distrito: "Lisboa" }), conta({ distrito: "Faro" }), conta({ distrito: "Porto" })]).toEqual([8, 3, 2, 1]);
  });
  it("período de criação com hoje a 10/10: 7, 30 e 90 dias", () => {
    expect([conta({ periodo: "7" }), conta({ periodo: "30" }), conta({ periodo: "90" })]).toEqual([7, 12, 14]);
  });
  it("parados: 9 negócios têm 'parado desde' (Orçamento e Proposta) e nenhum está há mais de 7 dias", () => {
    expect(conta({ parado: "ate7" })).toBe(9);
    expect(conta({ parado: "mais7" })).toBe(0);
    expect(conta({ parado: "8a14" })).toBe(0);
    expect(conta({ parado: "mais14" })).toBe(0);
  });
  it("serviço: 5 casas de banho, 5 cozinhas e 4 outros", () => {
    expect([conta({ servico: "wc" }), conta({ servico: "coz" }), conta({ servico: "outros" })]).toEqual([5, 5, 4]);
  });
});

describe("filtros de Negócios · combinados e chips", () => {
  it("fase e distrito; tipo e faixa; limpar devolve tudo", () => {
    expect(conta({ fase: "orcamento", distrito: "Setúbal" })).toBe(3);
    expect(conta({ tipo: "direta", faixa: "3a6" })).toBe(1);
    expect(conta({ servico: "coz", periodo: "7" })).toBe(1);
    expect(conta({})).toBe(14);
  });
  it("um filtro rápido junta-se aos do popover", () => {
    expect(conta({ distrito: "Lisboa" }, "wc")).toBe(2); // 90207 e 90106
  });
  it("cada filtro ligado em texto, com o que o desliga", () => {
    const f: FiltrosN = { ...SEM_FILTROS_N, fase: "proposta", faixa: "3a6", periodo: "30", parado: "mais7", orcamentos: "2+" };
    const chips = chipsAtivosN(f);
    expect(chips.map((c) => c.texto)).toEqual(["Fase: Proposta", "2 ou mais orçamentos", "Valor: 3.000 a 6.000 €", "Criado nos últimos 30 dias", "Parado: Há mais de 7 dias"]);
    expect(chips.reduce((a, c) => ({ ...a, ...c.limpar }), f)).toEqual(SEM_FILTROS_N);
    expect(chipsAtivosN(SEM_FILTROS_N)).toEqual([]);
  });
  it("as opções dos selects", () => {
    expect(opcoesN(linhas)).toEqual({ comercial: ["Rúben"], distrito: ["Braga", "Coimbra", "Faro", "Lisboa", "Porto", "Setúbal"] });
  });
});

describe("filtros de Negócios · ganhos e perdidos", () => {
  it("só 10 negócios são ganhos ou perdidos (6 ganhos e 4 perdidos) e a fase não os filtra", () => {
    expect(selecionarResultados(linhas, ctx())).toHaveLength(10);
    expect(selecionarResultados(linhas, ctx({ fase: "orcamento" }))).toHaveLength(10);
    expect(selecionarResultados(linhas, ctx({ distrito: "Lisboa" }))).toHaveLength(5); // 2 ganhos (Marta Lima, Joana Ribeiro) e 3 perdidos
  });
});
