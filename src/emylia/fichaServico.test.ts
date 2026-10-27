import { describe, expect, it } from "vitest";
import { seed } from "./motor";
import { custoReceita, custos0, equipHora, receitaDe, type Equip } from "./v2/custosModelo";
import {
  avisoMedida, consumiveisCatalogo, custoComOpcionais, exemploMedida, iconeDoServico, medidaDe, partesCusto, pesquisarProdutos,
  precoProduto, quantidadeDaMedida, quebraEquip,
} from "./fichaServico";
import type { Produto } from "./v2/catalogoModelo";

const receitaCanal = () => {
  const S = seed(), C = custos0();
  const rec = structuredClone(receitaDe(C, "canal", S.svc.canal, S.cfg.alvo)!);
  return { S, C, rec };
};

describe("fichaServico · o custo com e sem consumíveis opcionais", () => {
  it("sem opcionais, os consumíveis são todos do custo (3 × 1,90 + 2,27 + 0,50 = 8,47 €)", () => {
    const { C, rec } = receitaCanal();
    const c = custoReceita(rec, C, false);
    expect(c.cons).toBeCloseTo(8.47, 6);
    expect(c.consOpc).toBe(0);
    expect(custoComOpcionais(c)).toBeCloseTo(c.total, 6);
    expect(c.total).toBeCloseTo(c.mo + c.eq + c.cons, 6);
  });
  it("um consumível opcional sai do custo e fica à parte; com { opcionais: true } volta a entrar", () => {
    const { C, rec } = receitaCanal();
    const antes = custoReceita(rec, C, false).total;
    rec.cons.find((x) => x.n === "Fita e vedante")!.opcional = true;
    const c = custoReceita(rec, C, false);
    expect(c.cons).toBeCloseTo(7.97, 6);
    expect(c.consOpc).toBeCloseTo(0.5, 6);
    expect(c.total).toBeCloseTo(antes - 0.5, 6);
    expect(custoComOpcionais(c)).toBeCloseTo(antes, 6);
    const todos = custoReceita(rec, C, false, { opcionais: true });
    expect(todos.cons).toBeCloseTo(8.47, 6);
    expect(todos.total).toBeCloseTo(antes, 6);
  });
  it("todos opcionais: os consumíveis valem 0 no custo", () => {
    const { C, rec } = receitaCanal();
    rec.cons.forEach((x) => { x.opcional = true; });
    const c = custoReceita(rec, C, false);
    expect(c.cons).toBe(0);
    expect(c.consOpc).toBeCloseTo(8.47, 6);
  });
  it("as partes do custo somam o total, com a estrutura só quando está ligada", () => {
    const { C, rec } = receitaCanal();
    const sem = custoReceita(rec, C, false), com = custoReceita(rec, C, true);
    expect(partesCusto(sem, false).map((p) => p.n)).toEqual(["Mão de obra", "Equipamentos", "Consumíveis"]);
    expect(partesCusto(com, true).map((p) => p.n)).toEqual(["Mão de obra", "Equipamentos", "Consumíveis", "Estrutura"]);
    expect(partesCusto(sem, false).reduce((a, p) => a + p.v, 0)).toBeCloseTo(sem.total, 6);
    expect(partesCusto(com, true).reduce((a, p) => a + p.v, 0)).toBeCloseTo(com.total, 6);
  });
});

describe("fichaServico · a depreciação do equipamento", () => {
  const e: Equip = { id: "x", n: "Martelo demolidor", compra: 900, vida: 1500, residual: 150, manutAno: 60, usoAno: 600 };
  it("(compra − residual) ÷ vida + manutenção ÷ uso, igual ao equipHora", () => {
    const q = quebraEquip(e);
    expect(q.deprec).toBeCloseTo(0.5, 6);
    expect(q.manut).toBeCloseTo(0.1, 6);
    expect(q.total).toBeCloseTo(0.6, 6);
    expect(q.total).toBeCloseTo(equipHora(e), 9);
    expect(q.texto).toBe("(900,00 € − 150,00 €) ÷ 1.500 h + 60,00 € ÷ 600 h/ano = 0,60 €/h");
  });
  it("sem vida útil ou sem uso, essa parte é zero (não divide por zero); residual acima da compra não dá negativo", () => {
    expect(quebraEquip({ ...e, vida: 0 }).deprec).toBe(0);
    expect(quebraEquip({ ...e, usoAno: 0 }).manut).toBe(0);
    expect(quebraEquip({ ...e, residual: 2000, manutAno: 0 }).total).toBe(0);
  });
  it("os equipamentos de exemplo: a quebra soma sempre o equipHora", () => {
    for (const x of custos0().equip) expect(quebraEquip(x).total).toBeCloseTo(equipHora(x), 9);
  });
});

describe("fichaServico · a medida (ReceitaV2.medida, opcional)", () => {
  it("em falta usa a do modelo ou a da unidade; null quer dizer que o comercial escreve", () => {
    expect(medidaDe(undefined, "xpto", "m²")).toBe("pav");
    expect(medidaDe({}, "xpto", "pt")).toBe("pts");
    expect(medidaDe({}, "xpto", "un")).toBeNull();
    expect(medidaDe({ medida: null }, "xpto", "m²")).toBeNull();
    expect(medidaDe({ medida: "par" }, "xpto", "m²")).toBe("par");
  });
  it("a quantidade vem das medidas da visita, e o exemplo e o aviso leem-se", () => {
    expect(quantidadeDaMedida("pav", { pav: 4 })).toBe(4);
    expect(quantidadeDaMedida("pts", {})).toBe(0);
    expect(quantidadeDaMedida(null, { pav: 4 })).toBeNull();
    expect(exemploMedida(null, "un")).toMatch(/comercial escreve/);
    expect(exemploMedida("pav", "m²", { pav: 4, par: 20, pts: 3, pcs: 1 })).toBe("Numa casa de banho com 4 m² de pavimento → 4 m²");
    expect(avisoMedida("pav", "un")).toMatch(/m²/);
    expect(avisoMedida("pav", "m²")).toBeNull();
  });
});

describe("fichaServico · ícone, produtos e consumíveis", () => {
  it("o ícone: o do Catálogo (Catalogo.icone), senão pelo nome, senão pelo ofício, senão «outro»", () => {
    expect(iconeDoServico({ icone: { s1: "gas" } }, "s1", "Pintura", "Pintura")).toBe("gas");
    expect(iconeDoServico({}, "s1", "Pintura de paredes", "Acabamentos")).toBe("pintura");
    expect(iconeDoServico({ icone: undefined }, "s1", "Xpto", "Canalização")).toBe("canalizacao");
    expect(iconeDoServico({}, "s1", "Xpto", "Ypsilon")).toBe("outro");
  });
  it("os produtos: procura no SKU e na subcategoria; o preço é o PVP, ou o custo com margem quando falta", () => {
    const base: Produto = { id: "p1", n: "Toalheiro elétrico", no: "x", marca: "Roca", fornecedor: "Sanitop", un: "un", custo: 65, data: "2026-01-01" };
    const L = [base, { ...base, id: "p2", n: "Sanita suspensa", sku: "ABC-123", sub: "Loiças", pvp: 199 }];
    expect(pesquisarProdutos(L, "abc").map((p) => p.id)).toEqual(["p2"]);
    expect(pesquisarProdutos(L, "loicas").map((p) => p.id)).toEqual(["p2"]);
    expect(pesquisarProdutos(L, "  ")).toHaveLength(2);
    expect(precoProduto(L[1], 35)).toBe(199);
    expect(precoProduto(base, 35)).toBeCloseTo(100, 6);
  });
  it("os consumíveis do Catálogo juntam-se por nome e contam onde são opcionais", () => {
    const S = seed(), C = custos0();
    const r = structuredClone(receitaDe(C, "revest", S.svc.revest, S.cfg.alvo)!);
    r.cons.find((x) => x.n === "Cimento-cola C2TE")!.opcional = true;
    C.receitas.revest = r;
    const cola = consumiveisCatalogo(S, C).find((x) => x.n === "Cimento-cola C2TE")!;
    expect(cola.servicos).toEqual(expect.arrayContaining(["revest", "pav"]));
    expect(cola.opcionalEm).toBe(1);
  });
});
