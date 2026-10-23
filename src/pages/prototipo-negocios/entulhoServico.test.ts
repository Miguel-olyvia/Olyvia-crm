// O entulho dos serviços (14/10/2026): os modos, a soma à demolição como volume (sem horas), os big bags,
// o produto sem entulho (vale o do tipo) e um orçamento do seed() com a sanita trocada.
import { afterEach, describe, expect, it } from "vitest";
import {
  ARTIGOS_DEM0, ARTIGOS_DEM_TESTE, LINHA_DEMOLICAO, PAR_DEM0, PAR_DEM_TESTE, calcularDemolicao, contaExemplo, type ItemDem, type ItemVol,
} from "./entulho";
import { entulhoDoProduto, entulhoDoServico, entulhoPadraoServico, tipoDoProduto, volumesDasLinhas } from "./entulhoPadrao";
import { acoes, seed, tot, type LinhaOrc } from "./motor";
import { ligarCatalogo } from "./produtosVisita";
import { catalogo0 } from "./v2/catalogoModelo";
import { AREA, ESCOLHAS, EXTERIOR, INTERIOR, emFalta, type Grupo } from "./campos";

const comElevador = { f: 1, origem: "com elevador" };
const WC: ItemDem[] = [
  { codigo: "DEM-SAN-01", q: 1 }, { codigo: "DEM-BID-01", q: 1 }, { codigo: "DEM-LAV-01", q: 1 }, { codigo: "DEM-BAN-01", q: 1 },
  { codigo: "DEM-TOR-01", q: 1 }, { codigo: "DEM-AZU-01", q: 20 }, { codigo: "DEM-PAV-01", q: 5 },
];
const svc = (sid: string, q: number): LinhaOrc => ({ t: "svc", sid, q, cu: 0, pu: 0 });

describe("os modos de cada serviço (por omissão)", () => {
  const K = catalogo0();
  it("demolir com artigo → artigo; remover sem artigo → m³ por unidade; o vazadouro não gera", () => {
    expect(entulhoDoServico(K, "demol")).toEqual({ modo: "artigo" });
    expect(entulhoDoServico(K, "c1")).toEqual({ modo: "artigo" });
    expect(entulhoDoServico(K, "s-morp")).toMatchObject({ modo: "m3", m3: 0.15 }); // Retirar porta
    expect(entulhoDoServico(K, "c5")).toMatchObject({ modo: "m3", m3: 0.14 }); // Demolição de parede
    expect(entulhoDoServico(K, "s-moredv").modo).toBe("nao"); // Remoção de entulho e deslocação para vazadouro
    expect(entulhoDoServico(K, "c8").modo).toBe("nao"); // "Levantamento de parede em alvenaria" é construir
  });
  it("instalar no lugar de um produto exigido → produto que sai; os de m² → não (é o artigo de demolição); o resto → não", () => {
    for (const sid of ["c13", "c17", "loucas", "moveis", "c22"]) expect(entulhoDoServico(K, sid).modo).toBe("produto");
    for (const sid of ["pav", "c6", "c4", "canal", "pint", "eletr"]) expect(entulhoDoServico(K, sid).modo).toBe("nao");
    expect(entulhoPadraoServico({}, "x", "Substituição de autoclismo", "Canalização", "un").modo).toBe("produto");
  });
  it("um Catálogo guardado sem entulhoServico usa os por omissão; o artigo escolhido manda sempre", () => {
    const { entulhoServico: _x, ...semEnt } = K;
    expect(entulhoDoServico(semEnt, "c13").modo).toBe("produto");
    expect(entulhoDoServico({ ...K, artigoDoServico: { c13: "DEM-SAN-01" } }, "c13").modo).toBe("artigo");
    expect(entulhoDoServico({ ...K, entulhoServico: { c13: { modo: "artigo" } }, artigoDoServico: {} }, "c13").modo).toBe("nao");
  });
});

describe("o entulho dos produtos", () => {
  const K = catalogo0();
  it("os valores da especificação: sanita 0,06 m³ e 25 kg, banheira 0,4, lavatório 0,15", () => {
    expect(K.produtos.find((p) => p.n === "Sanita compacta")!.entulho).toEqual({ m3: 0.06, kg: 25 });
    expect(K.produtos.find((p) => p.n === "Banheira acrílica 170×70")!.entulho).toEqual({ m3: 0.4 });
    expect(tipoDoProduto({ n: "Lavatório Bali 60", sub: "Lavatórios" }).e.m3).toBe(0.15);
  });
  it("o produto sem entulho usa o valor por omissão do tipo (pela subcategoria, pelo nome ou pela ilustração)", () => {
    expect(entulhoDoProduto({ n: "SANITA X", sub: "Sanitas" })).toMatchObject({ m3: 0.06, kg: 25, doTipo: true, tipo: "sanita" });
    expect(entulhoDoProduto({ n: "Coisa", img: "base-duche" })).toMatchObject({ m3: 0.1, doTipo: true });
    expect(entulhoDoProduto({ n: "Sanita", entulho: { m3: 0.08 } })).toMatchObject({ m3: 0.08, doTipo: false });
    // a placa de acionamento traz a instalação da sanita, mas não é a sanita que sai
    expect(entulhoDoProduto({ n: "Placa de acionamento branca", sub: "Kit´s para Sanitários", img: "sanita" }).m3).toBe(0);
  });
});

describe("a conta da demolição com o entulho dos serviços", () => {
  const sanitas: ItemVol = { de: "c13", m3: 0.12, t: 0.05, origem: "2 × sanita que sai" };
  it("sem itens de volume não muda nada (39,08 / 1.043,28 / 1.103,69 € e 602,49 / 860,70 €)", () => {
    expect(calcularDemolicao([{ codigo: "DEM-SAN-01", q: 1 }], ARTIGOS_DEM_TESTE, { ...PAR_DEM_TESTE, protecao: 0 }, comElevador, {}, undefined, []).preco).toBe(39.08);
    expect(calcularDemolicao(WC, ARTIGOS_DEM_TESTE, PAR_DEM_TESTE, comElevador, {}, undefined, []).preco).toBe(1043.28);
    expect(calcularDemolicao(WC, ARTIGOS_DEM_TESTE, PAR_DEM_TESTE, { f: 1.5, origem: "" }, {}, undefined, []).preco).toBe(1103.69);
    const p = calcularDemolicao(WC, ARTIGOS_DEM0, PAR_DEM0, comElevador, {}, undefined, []);
    expect([p.custo, p.preco]).toEqual([602.49, 860.7]);
  });
  it("o volume soma ao m³, às toneladas, à carga e à deposição, mas não às horas de demolição", () => {
    const a = calcularDemolicao(WC, ARTIGOS_DEM_TESTE, PAR_DEM_TESTE, comElevador);
    const b = calcularDemolicao(WC, ARTIGOS_DEM_TESTE, PAR_DEM_TESTE, comElevador, {}, undefined, [sanitas]);
    expect(b.horas - b.horasCarga).toBeCloseTo(a.horas - a.horasCarga, 9); // 20,6 h de demolição nos dois
    expect(b.demolicao).toBe(a.demolicao);
    expect(b.m3).toBe(1.91);
    expect(b.carga).toBeCloseTo(a.carga + 0.12 * 2 * 25, 2); // + 6,00 €
    expect(b.deposicao).toBeCloseTo(a.deposicao + 0.12 * 70, 2); // + 8,40 €
    expect(b.t).toBeCloseTo(a.t + 0.05, 3);
    expect(b.volumes).toEqual([expect.objectContaining({ origem: "2 × sanita que sai", m3: 0.12 })]);
  });
  it("só com o entulho dos serviços: big bags, carga e deposição, sem proteção nem demolição", () => {
    const r = calcularDemolicao([], ARTIGOS_DEM0, PAR_DEM0, comElevador, {}, undefined, [sanitas]);
    expect([r.demolicao, r.protecao, r.meio, r.n]).toEqual([0, 0, "bigbag", 1]);
    expect([r.deposicao, r.carga]).toEqual([7.6, 4.43]);
  });
  it("os big bags contam com o volume dos serviços: 1,79 m³ dá 3; com mais 1,3 m³ (cozinha que sai) dá 4", () => {
    const sem = calcularDemolicao(WC, ARTIGOS_DEM_TESTE, PAR_DEM_TESTE, comElevador);
    const com = calcularDemolicao(WC, ARTIGOS_DEM_TESTE, PAR_DEM_TESTE, comElevador, {}, undefined, [{ de: "moveis", m3: 1.3, t: 0.2, origem: "1 × cozinha que sai" }]);
    expect([sem.n, com.n]).toEqual([3, 4]);
  });
  it("a conta da ficha: 2 un × 0,06 m³ = 0,12 m³ · ≈ 50 kg → deposição 7,60 € + carga 4,43 € (parâmetros de produção)", () => {
    expect(contaExemplo({ q: 2, un: "un", m3Un: 0.06, kgUn: 25 }, PAR_DEM0).texto).toBe("2 un × 0,06 m³ = 0,12 m³ · ≈ 50 kg → deposição 7,60 € + carga 4,43 €");
    // com artigo, a demolição (T_dem × C_h) e os consumíveis entram
    expect(contaExemplo({ q: 1, un: "un", m3Un: 0.06, kgUn: 25, horasUn: 0.375, consUn: 3 }, PAR_DEM0).texto).toBe("1 un × 0,06 m³ = 0,06 m³ · ≈ 25 kg → demolição 13,84 € + deposição 3,80 € + carga 2,21 € + consumíveis 3,00 €");
  });
});

describe("as linhas do orçamento", () => {
  const K = catalogo0();
  it("m³ por unidade: a quantidade da linha × o m³; o produto que sai: o do Catálogo ou o do tipo; manter = nada", () => {
    const v = { prod: [{ id: K.produtos.find((p) => p.n === "Sanita compacta")!.id, n: "Sanita compacta", un: "un", custo: 165, q: 2, no: null, svc: "c13", fator: 1 }] };
    const r = volumesDasLinhas([svc("s-morp", 2), svc("c13", 2), svc("canal", 3)], K, v, PAR_DEM0);
    expect(r.map((x) => [x.de, x.origem, Math.round(x.m3 * 1000) / 1000, Math.round(x.t * 1000) / 1000])).toEqual([
      ["s-morp", "2 un × 0,15 m³ · Mão de Obra - Retirar Porta (valor Unitário)", 0.3, 0.42],
      ["c13", "2 × sanita que sai", 0.12, 0.05],
    ]);
    expect(volumesDasLinhas([svc("c13", 2)], K, { ...v, manter: { c13: "sim" } }, PAR_DEM0)).toEqual([]);
  });
  it("sem produto escolhido: com «Troca» usa o tipo; sem resposta não adivinha", () => {
    expect(volumesDasLinhas([svc("c17", 1)], K, { manter: { c17: "nao" } }, PAR_DEM0)).toEqual([{ de: "c17", m3: 0.4, t: 0.4 * 1.4, origem: "1 × banheira que sai (valor do tipo)" }]);
    expect(volumesDasLinhas([svc("c17", 1)], K, {}, PAR_DEM0)).toEqual([]);
  });
});

describe("no orçamento do seed(): a sanita trocada", () => {
  afterEach(() => ligarCatalogo(null));
  const preencher = (d: { f: Record<string, string> }, gs: Grupo[]) => {
    for (let i = 0; i < 5; i++) for (const c of emFalta(gs, d.f)) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : "1";
  };
  it("a sanita que sai entra na linha da demolição (o cliente vê uma linha) e os outros orçamentos não mudam", () => {
    const S = seed();
    const antes = S.deals.filter((d) => d.orc).map((d) => tot(d, S).pf);
    const K = catalogo0();
    ligarCatalogo(() => K);
    const A = acoes(S, () => {}, (fn) => fn());
    const d = S.deals.find((x) => x.id === 1035)!;
    preencher(d, [EXTERIOR, INTERIOR, AREA, ESCOLHAS]);
    A.produto(d.id, K.produtos.find((p) => p.n === "Sanita compacta")!, 1);
    A.manter(d.id, "loucas", "nao"); A.manter(d.id, "c13", "nao"); A.manter(d.id, "pav", "sim");
    A.fecharVisita(d.id);
    const o = d.orc!, r = o.demolicao!.r!;
    expect(r.volumes.map((v) => [v.de, v.origem])).toEqual([["loucas", "1 × sanita que sai"]]);
    expect(r.m3).toBe(Math.round((5 * 0.084 + 0.06) * 100) / 100); // pavimento (artigo) + a sanita
    expect(o.linhas.filter((l) => l.t === "mat" && l.d === LINHA_DEMOLICAO)).toHaveLength(1);
    expect(S.deals.filter((x) => x.orc && x.id !== 1035).map((x) => tot(x, S).pf)).toEqual(antes);
  });
  it("sem demolição ligada, o entulho dos serviços liga-a sozinho; desligada à mão, fica desligada", () => {
    const S = seed();
    const K = catalogo0();
    ligarCatalogo(() => K);
    const A = acoes(S, () => {}, (fn) => fn());
    const d = S.deals.find((x) => x.id === 1031)!;
    const o = d.orc!;
    o.enviada = null; // como se ainda não tivesse ido ao cliente
    expect(o.demolicao).toBeUndefined();
    o.linhas.push(svc("s-morp", 1));
    A.qtdLinha(d.id, o.linhas.length - 1, 2);
    expect(o.demolicao?.r?.volumes.map((v) => v.de)).toEqual(["s-morp"]);
    expect(o.linhas.some((l) => l.t === "svc" && l.sid === "demol")).toBe(false); // segue o padrão de ligarDemolicao
    A.demolicaoLigar(d.id, false);
    const i = o.linhas.findIndex((l) => l.t === "svc" && l.sid === "s-morp");
    A.qtdLinha(d.id, i, 3);
    expect(o.demolicao).toBeUndefined();
  });
});
