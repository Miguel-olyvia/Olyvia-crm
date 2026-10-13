import { afterEach, describe, expect, it } from "vitest";
import {
  ARTIGOS_DEM0, LINHA_DEMOLICAO, PAR_DEM0, calcularDemolicao, contaArtigo, fatorAcesso, nBigbags, ocupacao, vSoltoDe, type ArtigoDem, type ItemDem, type ParDem,
} from "./entulho";
import { acoes, seed, tot } from "./motor";
import { ligarCatalogo } from "./produtosVisita";
import { catalogo0 } from "./v2/catalogoModelo";
import { AREA, ESCOLHAS, EXTERIOR, INTERIOR, emFalta, type Grupo } from "./campos";

const P = PAR_DEM0;
const art = (c: string) => ARTIGOS_DEM0.find((a) => a.codigo === c)!;
const comElevador = { f: 1, origem: "com elevador" };

// O exemplo 2 da especificação NÃO soma os consumíveis dos artigos (somá-los daria 1.043,28 €): os 40 € de
// "proteção, consumíveis e limpeza" cobrem-nos. Para os testes do exemplo 2 os artigos têm C_cons = 0 (a sanita
// de arranque tem 3 €, a do exemplo 1).
const ARTIGOS_EX2: ArtigoDem[] = ARTIGOS_DEM0.map((a) => ({ ...a, cons: 0 }));
const WC: ItemDem[] = [
  { codigo: "DEM-SAN-01", q: 1 }, { codigo: "DEM-BID-01", q: 1 }, { codigo: "DEM-LAV-01", q: 1 }, { codigo: "DEM-BAN-01", q: 1 },
  { codigo: "DEM-TOR-01", q: 1 }, { codigo: "DEM-AZU-01", q: 20 }, { codigo: "DEM-PAV-01", q: 5 },
];

describe("demolição e entulho: a fórmula da especificação", () => {
  it("exemplo 1: remover uma sanita dá 28,95 € de custo e 39,08 € de preço (sem proteção)", () => {
    const c = contaArtigo(art("DEM-SAN-01"), 1, P, 1);
    expect([c.demolicao, c.carga, c.deposicao, c.consumiveis].map((x) => Math.round(x * 100) / 100)).toEqual([18.75, 3, 4.2, 3]);
    const r = calcularDemolicao([{ codigo: "DEM-SAN-01", q: 1 }], ARTIGOS_DEM0, { ...P, protecao: 0 }, comElevador);
    expect(r.custo).toBe(28.95);
    expect(r.preco).toBe(39.08);
  });
  it("V_solto = V_insitu × empolamento (azulejo 0,035; pavimento 0,084)", () => {
    expect(vSoltoDe(art("DEM-AZU-01"))).toBeCloseTo(0.035, 6);
    expect(vSoltoDe(art("DEM-PAV-01"))).toBeCloseTo(0.084, 6);
  });
  it("exemplo 2: casa de banho com elevador: 20,6 h, 1,79 m³, custo 769,80 € e preço 1.039,23 €", () => {
    const r = calcularDemolicao(WC, ARTIGOS_EX2, P, comElevador);
    expect(r.horas - r.horasCarga).toBeCloseTo(20.6, 6);
    expect(r.m3).toBe(1.79);
    expect([r.demolicao, r.carga, r.deposicao, r.protecao]).toEqual([515, 89.5, 125.3, 40]);
    expect(r.custo).toBe(769.8);
    expect(r.preco).toBe(1039.23);
  });
  it("a mesma no 3.º andar sem elevador: carga 134,25 €, custo 814,55 € e preço 1.099,64 €", () => {
    const acesso = fatorAcesso({ andar: "3", tem_elevador: "Não" }, P);
    expect(acesso).toEqual({ f: 1.5, origem: "3.º andar, sem elevador (do levantamento)" });
    const r = calcularDemolicao(WC, ARTIGOS_EX2, P, acesso);
    expect(r.carga).toBe(134.25);
    expect(r.custo).toBe(814.55);
    expect(r.preco).toBe(1099.64);
  });
  it("3 big bags: MÁX(1,79 ÷ 1,0; ≈2,5 t ÷ 1,2) arredondado para cima", () => {
    const r = calcularDemolicao(WC, ARTIGOS_EX2, P, comElevador);
    expect(r.t).toBeGreaterThan(2.4);
    expect(r.meio).toBe("bigbag");
    expect(r.n).toBe(3);
    expect(nBigbags(1.79, 1.79 * 1.4, P)).toBe(3);
  });
  it("o fator de acesso vem do levantamento", () => {
    expect(fatorAcesso({ andar: "0", tem_elevador: "Não" }, P).f).toBe(1);
    expect(fatorAcesso({ andar: "5", tem_elevador: "Sim" }, P).f).toBe(1);
    expect(fatorAcesso({ andar: "2", tem_elevador: "Não" }, P).f).toBe(1.25);
  });
  it("margem sobre o preço em vez de markup: Preço = Custo ÷ (1 − margem)", () => {
    const Q: ParDem = { ...P, modoPreco: "margem", margem: 0.25 };
    const r = calcularDemolicao(WC, ARTIGOS_EX2, Q, comElevador);
    expect(r.preco).toBe(1026.4);
  });
  it("à tonelada: C_dep × peso em vez de × volume", () => {
    const r = calcularDemolicao([{ codigo: "DEM-SAN-01", q: 1 }], ARTIGOS_DEM0, { ...P, protecao: 0, unDep: "t" }, comElevador);
    expect(r.deposicao).toBe(1.75); // 0,025 t × 70 €
  });
  it("contentor: só se propõe se estiver configurado e for mais barato", () => {
    const muito: ItemDem[] = [{ codigo: "DEM-PAV-01", q: 60 }]; // 5,04 m³
    expect(calcularDemolicao(muito, ARTIGOS_EX2, P, comElevador).meio).toBe("bigbag"); // contentor desligado
    const comCt: ParDem = { ...P, contentor: { ativo: true, preco: 300, m3: 6, t: 8 } };
    const r = calcularDemolicao(muito, ARTIGOS_EX2, comCt, comElevador);
    expect(r.meio).toBe("contentor");
    expect(r.n).toBe(1);
    expect(r.deposicao).toBe(300);
  });
});

describe("ajustes por orçamento", () => {
  it("cada valor mexido fica marcado e conta; sem ajustes volta ao cálculo", () => {
    const r = calcularDemolicao(WC, ARTIGOS_EX2, P, comElevador, { meio: "nenhum", horas: 10, preco: 900 });
    expect(r.ajustados).toEqual(["meio", "horas", "preco"]);
    expect(r.deposicao).toBe(0); // o cliente tem contentor
    expect(r.demolicao).toBe(250);
    expect(r.preco).toBe(900);
    expect(calcularDemolicao(WC, ARTIGOS_EX2, P, comElevador).preco).toBe(1039.23);
  });
  it("n.º de big bags à mão abaixo do preciso: ocupação acima de 100% e o que falta", () => {
    const r = calcularDemolicao(WC, ARTIGOS_EX2, P, comElevador, { n: 2 });
    expect(r.ocupacao!.cor).toBe("mau");
    expect(r.ocupacao!.falta).toMatch(/precisa de mais 1 big bag/);
  });
});

describe("ocupação dos big bags e contentores", () => {
  it("1 contentor: % por volume e por peso, e o que limita", () => {
    const o = ocupacao("contentor", 4.2, 5.1, 1, { m3: 6, t: 6 });
    expect([o.pctVol, o.pctPeso, o.limita, o.cor]).toEqual([70, 85, "peso", "aviso"]);
    expect(o.texto).toBe("1 contentor de 6 m³: 70% cheio (4,2 m³) · peso 5,1 t de 6 t (85%)");
  });
  it("2 contentores: o 2.º quase vazio sugere big bags", () => {
    const o = ocupacao("contentor", 6.9, 3, 2, { m3: 6, t: 6 });
    expect(o.texto).toMatch(/^2 contentores: 100% \+ 15%/);
    expect(o.sugestao).toBe("o 2.º contentor fica a 15%: considere big bags para o resto");
    expect(o.cor).toBe("ok");
  });
  it("cheio de mais: vermelho e quantos faltam", () => {
    const o = ocupacao("contentor", 7.3, 3, 1, { m3: 6, t: 6 });
    expect(o.cor).toBe("mau");
    expect(o.falta).toBe("faltam 1,3 m³: precisa de mais 1 contentor");
  });
});

describe("no orçamento", () => {
  afterEach(() => ligarCatalogo(null));
  const preencher = (d: { f: Record<string, string> }, gs: Grupo[]) => {
    for (let i = 0; i < 5; i++) for (const c of emFalta(gs, d.f)) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : "1";
  };
  it("um orçamento novo: o serviço de demolição passa a artigo e o cliente vê uma linha; os exemplos não mudam", () => {
    const S = seed();
    const antes = S.deals.filter((d) => d.orc).map((d) => tot(d, S).pf);
    const K = catalogo0();
    ligarCatalogo(() => K);
    const A = acoes(S, () => {}, (fn) => fn());
    const d = S.deals.find((x) => x.id === 1035)!;
    preencher(d, [EXTERIOR, INTERIOR, AREA, ESCOLHAS]);
    A.manter(d.id, "loucas", "sim"); A.manter(d.id, "pav", "sim");
    A.fecharVisita(d.id);
    expect(d.fase).toBe(3);
    const o = d.orc!;
    expect(o.linhas.some((l) => l.t === "svc" && l.sid === "demol")).toBe(false);
    expect(o.demolicao!.itens).toEqual([{ codigo: "DEM-PAV-01", q: 5, de: "demol" }]);
    expect(o.linhas.find((l) => l.t === "mat" && l.d === LINHA_DEMOLICAO)).toMatchObject({ preco: o.demolicao!.r!.preco });
    // 2.º andar com elevador (do levantamento)
    expect(o.demolicao!.r!.fAcesso).toBe(1);
    A.demolicaoItem(d.id, "DEM-SAN-01", 1);
    expect(o.demolicao!.r!.artigos.map((a) => a.codigo)).toEqual(["DEM-PAV-01", "DEM-SAN-01"]);
    A.demolicaoAjuste(d.id, "meio", "nenhum");
    expect(o.demolicao!.r!.deposicao).toBe(0);
    A.demolicaoAjuste(d.id, "meio", null);
    expect(o.demolicao!.r!.ajustados).toEqual([]);
    expect(S.deals.filter((x) => x.orc && x.id !== 1035).map((x) => tot(x, S).pf)).toEqual(antes);
  });
});
