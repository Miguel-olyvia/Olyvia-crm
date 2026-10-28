import { describe, expect, it, vi } from "vitest";
import { CATALOGO, itemCatalogo, type ItemCatalogo } from "../catalogo";
import { alertas, custoUn, seed, type Estado } from "../motor";
import {
  HOJE, aplicarAoServico, alertasOrcamentoV2, alertasServico, custoHoraPerfil, custoReceita, custos0, equipHora, listaCatalogo, margemSobrePreco,
  mediaHora, mesesAntes, mesesEntre, minimoLinha, minimoServico, ordenar, passaFiltro, pesquisar, precoReceita, receitaDe, taxaEstrutura, totalEstrutura,
  horaPerfil, origemHora, type HoraBd,
} from "./custosModelo";
import type { FichaTecnico } from "../equipa/tecnicos";

// Um serviço do Catálogo sem receita, criado só para estes testes: desde 14/10 todos os do Catálogo (os c1..c41
// incluídos) têm a receita da Mudelar, e os testes do "sem receita" precisam de um que não a tenha.
const SEM_RECEITA: ItemCatalogo = { id: "x-sem-receita", n: "Serviço de teste sem receita", cat: "Canalização", un: "un", hf: 2, hu: 0.5, qm: 4, usos: 0, linhas: ["wc"] };
vi.mock("../catalogo", async (orig) => {
  const m = await orig<typeof import("../catalogo")>();
  return { ...m, itemCatalogo: (sid: string) => (sid === SEM_RECEITA.id ? SEM_RECEITA : m.itemCatalogo(sid)) };
});
/** Põe o serviço sem receita em uso (como o motor faria ao juntá-lo a um orçamento: 25 €/h e margem de 35%). */
const usarSemReceita = (S: Estado) => {
  S.svc[SEM_RECEITA.id] = { n: SEM_RECEITA.n, un: "un", h: 1, eh: 25, eq: 0, cons: 0, preco: 46.25, perfil: "Canalização" };
  return S.svc[SEM_RECEITA.id];
};

describe("custos · perfis, equipamentos e estrutura", () => {
  it("um técnico de 1.900 € dá 25,00 €/h (× 14, TSU 23,75%, seguros 713 €, 1.345 h), como receitas.ts", () => {
    const C = custos0();
    const p = C.perfis.find((x) => x.id === "canalizador")!;
    expect(custoHoraPerfil(p, C.par)).toBeCloseTo((1900 * 14 * 1.2375 + 713) / 1345, 6);
    expect(custoHoraPerfil(p, C.par)).toBeCloseTo(25, 2);
  });
  it("sem salário não há custo/hora; a média usa só os perfis com salário", () => {
    const C = custos0();
    expect(custoHoraPerfil(C.perfis.find((x) => x.id === "ladrilhador")!, C.par)).toBeNull();
    const v = C.perfis.map((p) => custoHoraPerfil(p, C.par)).filter((x) => x != null) as number[];
    expect(mediaHora(C)).toBeCloseTo(v.reduce((a, b) => a + b) / v.length, 6);
  });
  it("€/h do equipamento = (compra − residual) ÷ vida + manutenção ÷ uso por ano", () => {
    expect(equipHora({ id: "x", n: "Martelo", compra: 900, vida: 1500, residual: 0, manutAno: 0, usoAno: 600 })).toBeCloseTo(0.6, 6);
    expect(equipHora({ id: "x", n: "Martelo", compra: 900, vida: 1500, residual: 150, manutAno: 60, usoAno: 600 })).toBeCloseTo(0.5 + 0.1, 6);
  });
  it("a estrutura: Σ dos ativos ÷ horas produtivas (3.400 € ÷ 672 h = 5,06 €/h, o ESTR do motor)", () => {
    const C = custos0();
    expect(totalEstrutura(C)).toBe(3400);
    expect(taxaEstrutura(C)).toBeCloseTo(5.06, 2);
    C.estrutura[0].ativo = false;
    expect(totalEstrutura(C)).toBe(2500);
  });
});

describe("custos · receita, preço e margem", () => {
  it("a receita do pacote bate com o custo do motor (demolição)", () => {
    const S = seed(), C = custos0();
    const rec = receitaDe(C, "demol", S.svc.demol)!;
    expect(rec.origem).toBe("catalogo");
    const c = custoReceita(rec, C, true);
    expect(c.eq).toBeCloseTo(0.33, 6);
    expect(c.cons).toBeCloseTo(1.2, 6);
    expect(c.total).toBeCloseTo(custoUn(S.svc.demol, S), 1);
  });
  it("um serviço só do Catálogo tem a receita estimada pelas horas (fixas repartidas) e preço = custo + margem-alvo", () => {
    const C = custos0(), c1 = itemCatalogo(SEM_RECEITA.id)!;
    const rec = receitaDe(C, SEM_RECEITA.id, null, 35)!;
    expect(rec.origem).toBe("estimada");
    expect(rec.mo.reduce((a, p) => a + p.h, 0)).toBeCloseTo(c1.hu + c1.hf / c1.qm, 2);
    const c = custoReceita(rec, C, false);
    expect(margemSobrePreco(precoReceita(rec, c.total), c.total)).toBeCloseTo(0.35, 6);
  });
  it("margem sobre o preço", () => {
    expect(margemSobrePreco(100, 65)).toBeCloseTo(0.35, 6);
    expect(margemSobrePreco(0, 10)).toBe(0);
  });
  it("a margem mínima por linha: a mais alta das linhas do serviço", () => {
    const C = custos0();
    expect(minimoLinha(C, "wc", 28)).toBe(28);
    expect(minimoLinha(C, "coz", 28)).toBe(30);
    expect(minimoServico(C, "loucas", 28)).toBe(28); // só WC
    expect(minimoServico(C, "moveis", 28)).toBe(30); // só Cozinha
    expect(minimoServico(C, "canal", 28)).toBe(30); // as duas
  });
});

describe("custos · alertas do Catálogo", () => {
  it("revestimento (22/10): o Ladrilhador sem salário tem €/h dos técnicos do RH (Sérgio e Hugo, 17,80): sem 'sem custo/hora'; consumível de há 8 meses", () => {
    const S = seed(), C = custos0();
    const item = listaCatalogo(S, C).find((i) => i.sid === "revest")!;
    expect(item.alertas.map((a) => a.id).sort()).toEqual(["desatualizado", "justificacao"]);
    expect(item.c.mo).toBeCloseTo(0.75 * 17.8, 6); // 13,35 €
  });
  it("22/10: um ofício sem técnicos e sem salário bloqueia ('Ofício sem custo/hora'), sem usar a média dos outros", () => {
    const S = seed(), C = custos0();
    const item = listaCatalogo(S, C).find((i) => i.sid === "revest")!;
    const c = custoReceita(item.rec, C, false, { tecnicos: [] });
    expect(c.semCustoHora).toEqual(["Ladrilhador"]);
    expect(c.mo).toBe(0);
    const A = alertasServico({ rec: item.rec, c, preco: 26, un: "m²", min: 28, alvo: 35, mesesDesatualizado: 6 });
    expect(A.find((a) => a.id === "sem-custo-hora")).toMatchObject({ k: "x", t: "Ofício sem custo/hora" });
  });
  it("'Linha sem custo' quando não há receita (e não os 25 €/h inventados)", () => {
    const S = seed(), C = custos0();
    usarSemReceita(S);
    const L = listaCatalogo(S, C);
    expect(L.find((i) => i.sid === SEM_RECEITA.id)!.alertas.some((a) => a.id === "sem-receita" && a.t === "Linha sem custo")).toBe(true);
    expect(L.find((i) => i.sid === "c1")!.alertas.some((a) => a.id === "sem-receita")).toBe(false); // 14/10: tem a receita da Mudelar
    expect(L.find((i) => i.sid === "demol")!.alertas.some((a) => a.id === "sem-receita")).toBe(false);
  });
  it("desatualizado pela data, com N meses configurável", () => {
    expect(mesesAntes(HOJE, 8)).toBe("2026-02-13");
    expect(mesesEntre("2026-02-13", HOJE)).toBe(8);
    expect(mesesEntre("2026-02-14", HOJE)).toBe(7);
    const S = seed(), C = custos0();
    expect(listaCatalogo(S, C).find((i) => i.sid === "pav")!.alertas.some((a) => a.id === "desatualizado")).toBe(true);
    C.par.mesesDesatualizado = 9;
    expect(listaCatalogo(S, C).find((i) => i.sid === "pav")!.alertas.some((a) => a.id === "desatualizado")).toBe(false);
  });
  it("entre o mínimo e o alvo pede justificação; com ela, deixa de pedir", () => {
    const C = custos0(), S = seed();
    const rec = structuredClone(receitaDe(C, "c1", null, 35)!);
    const c = custoReceita(rec, C, false);
    rec.modo = "tabela"; rec.precoTabela = c.total / (1 - 0.3);
    const base = { rec, c, preco: rec.precoTabela, un: "un", min: S.cfg.min, alvo: S.cfg.alvo, mesesDesatualizado: 6 };
    expect(alertasServico(base).map((a) => a.id)).toContain("justificacao");
    rec.justificacao = "Preço de mercado da zona";
    expect(alertasServico(base).map((a) => a.id)).not.toContain("justificacao");
    expect(alertasServico({ ...base, preco: c.total * 0.9 }).map((a) => a.id)).toContain("abaixo-custo");
  });
});

describe("custos · a lista única", () => {
  it("junta os serviços em uso e o Catálogo, sem repetir, e diz 'em uso'", () => {
    const S = seed(), C = custos0();
    const L = listaCatalogo(S, C);
    const ids = L.map((i) => i.sid);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(new Set([...Object.keys(S.svc), ...CATALOGO.map((c) => c.id)]).size);
    expect(L.filter((i) => i.emUso).length).toBe(Object.keys(S.svc).length);
  });
  it("ordena por uso (os em uso primeiro, depois os mais pedidos), filtra e pesquisa sem acentos", () => {
    const S = seed(), C = custos0();
    const L = ordenar(listaCatalogo(S, C), "usos", false);
    const nUso = Object.keys(S.svc).length;
    expect(L.slice(0, nUso).every((i) => i.emUso)).toBe(true);
    const resto = L.slice(nUso).map((i) => i.usos);
    expect(resto).toEqual([...resto].sort((a, b) => b - a));
    expect(L.filter((i) => passaFiltro(i, "sem-receita")).every((i) => i.rec.origem === "estimada")).toBe(true);
    expect(pesquisar(L, "gas").every((i) => /g[aá]s/i.test(i.n + i.oficio))).toBe(true);
    expect(pesquisar(L, "gas").length).toBeGreaterThan(0);
  });
});

describe("custos · passar para o motor e alertas do orçamento", () => {
  it("22/10: dar salário ao ladrilhador não muda o revestimento: os técnicos do RH mandam (a média deles, 17,80 €/h)", () => {
    const S = seed(), C = custos0();
    C.perfis.find((p) => p.id === "ladrilhador")!.salario = 1900;
    aplicarAoServico(S, C, "revest");
    expect(S.svc.revest.semCusto).toBe(false);
    expect(S.svc.revest.eh).toBeCloseTo(17.8, 2);
    expect(S.svc.revest.stale).toMatch(/Cimento-cola/);
  });
  it("o alertas() do motor não muda; o da V2 junta 'Linha sem custo' e troca a frase fixa pelo desatualizado com data", () => {
    const S = seed(), C = custos0();
    const d = S.deals.find((x) => x.id === 1050)!;
    // 14/10: os extras da Joana já têm receita; junta-se uma linha de um serviço sem receita
    const sr = usarSemReceita(S);
    d.orc!.linhas.push({ t: "svc", sid: SEM_RECEITA.id, q: 1, cu: custoUn(sr, S), pu: sr.preco });
    const antes = JSON.stringify(alertas(d, S));
    const A = alertasOrcamentoV2(d, S, C, { justificacao: "Preço de mercado da zona" });
    expect(JSON.stringify(alertas(d, S))).toBe(antes);
    expect(A.some((a) => a.t.startsWith("Linha sem custo em"))).toBe(true);
    const desat = A.filter((a) => a.t === "Preço desatualizado");
    expect(desat.length).toBeGreaterThan(0);
    expect(desat.every((a) => /\d{2}\/\d{2}\/\d{4}/.test(a.d))).toBe(true);
  });
  it("a margem mínima da Cozinha (30%) bloqueia uma linha a 29%, que passaria com a geral (28%)", () => {
    const S = seed(), C = custos0();
    const d = S.deals.find((x) => x.linha === "coz" && x.orc)!;
    const i = d.orc!.linhas.findIndex((l) => l.t === "svc");
    const l = d.orc!.linhas[i];
    if (l.t !== "svc") throw new Error("sem linha");
    l.pu = l.cu / (1 - 0.29);
    const A = alertasOrcamentoV2(d, S, C, { justificacao: "x" });
    expect(A.some((a) => a.k === "x" && a.i === i && a.t.includes("Cozinha"))).toBe(true);
    C.minLinha.coz = 28;
    expect(alertasOrcamentoV2(d, S, C, { justificacao: "x" }).some((a) => a.t.includes("mínimo de Cozinha"))).toBe(false);
  });
  it("margem total entre o mínimo e o alvo: pede justificação até haver uma", () => {
    const S = seed(), C = custos0();
    const d = S.deals.find((x) => x.id === 1030)!;
    const lin = d.orc!.linhas;
    for (const l of lin) { if (l.t === "svc") l.pu = l.cu / (1 - 0.31); else { l.preco = l.custo / (1 - 0.31); } }
    expect(alertasOrcamentoV2(d, S, C).some((a) => a.key === "just")).toBe(true);
    expect(alertasOrcamentoV2(d, S, C, { justificacao: "Campanha em curso" }).some((a) => a.key === "just")).toBe(false);
  });
});

describe("custos · o €/h calculado na base (28/10, cargos técnicos)", () => {
  const tec = (id: string, n: string, perfis: string[], custoHora: number, extra: Partial<FichaTecnico> = {}): FichaTecnico =>
    ({ id, n, sk: "", perfilId: perfis[0], perfis, ferias: [], custoHora, tel: "", desde: "", ...extra });
  const comBd = (bd: HoraBd) => { const C = custos0(); C.perfis.find((x) => x.id === "canalizador")!.horaBd = bd; return C; };

  it("fonte rh da base: usa o valor da base (não a média de cá) e diz quem entra", () => {
    const C = comBd({ custoHora: 21.5, fonte: "rh", n: 2, nomes: ["Ana", "Rui"], cargos: ["Canalizador"] });
    const h = horaPerfil(C, "canalizador", [tec("a", "Ana", ["canalizador"], 30), tec("r", "Rui", ["canalizador"], 10)]);
    expect(h).toMatchObject({ eh: 21.5, fonte: "rh" });
    expect(origemHora(h)).toBe("Média de 2 técnicos no RH (Ana, Rui)");
  });
  it("fonte cargo: o salário do cargo técnico, com o nome do cargo", () => {
    const C = comBd({ custoHora: 19.9, fonte: "cargo", n: 1, nomes: [], cargos: ["Canalizador de 1.ª"] });
    const h = horaPerfil(C, "canalizador", []);
    expect(h).toMatchObject({ eh: 19.9, fonte: "cargo" });
    expect(origemHora(h)).toBe("Sem técnicos: usa o salário do cargo Canalizador de 1.ª");
  });
  it("fonte referencia: a conta de cá com o salário do perfil (editável no Catálogo)", () => {
    const C = comBd({ custoHora: 25, fonte: "referencia", n: 0, nomes: [], cargos: [] });
    C.perfis.find((x) => x.id === "canalizador")!.salario = 2000;
    const h = horaPerfil(C, "canalizador", []);
    expect(h.fonte).toBe("salario");
    expect(h.eh).toBeCloseTo((2000 * 14 * 1.2375 + 713) / 1345, 6);
    expect(origemHora(h)).toBe("Sem técnicos nem cargo: usa o salário de referência");
  });
  it("um técnico com dois ofícios conta nos dois; sem permissão o custo dele fica escondido (fora da lista, sem 'sem custo')", () => {
    const L = [tec("a", "Ana", ["canalizador", "ladrilhador"], 20), tec("o", "Oculto", ["canalizador"], 0, { custoOculto: true })];
    const C = custos0();
    expect(horaPerfil(C, "ladrilhador", L)).toMatchObject({ eh: 20, fonte: "rh" });
    const h = horaPerfil(C, "canalizador", L);
    expect(h.tecnicos.map((t) => t.n)).toEqual(["Ana"]);
    expect(h.semCustoRh).toEqual([]);
  });
  it("sem horaBd (o protótipo) fica tudo como antes", () => {
    const C = custos0();
    const L = [tec("a", "Ana", ["canalizador"], 20)];
    const h = horaPerfil(C, "canalizador", L);
    expect(h).toMatchObject({ eh: 20, fonte: "rh" });
    expect(h.bd).toBeUndefined();
    expect(origemHora(h)).toBe("Custo/hora de Ana no RH");
    expect(origemHora(horaPerfil(C, "canalizador", []))).toBe("Sem técnicos no RH: usa o salário do perfil");
  });
});
