// Fase 1 (22/10/2026): o €/h de cada ofício é a média do custo/hora dos técnicos dele, calculado nos Custos do RH, e chega ao Catálogo,
// ao orçamento, às adendas, à demolição e ao plano da obra pelo id do perfil.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { acoes, alertas, bloqueado, custoUn, garantirServico, parDemolicao, seed, servicoDoCatalogo, type Estado } from "./motor";
import {
  alertasServico, custoReceita, custos0, custosDe, garantirCustos, horaPerfil, listaCatalogoCompleta, receitaDe, taxaEstrutura,
} from "./v2/custosModelo";
import { lerCustos, ligarCustos, mudarCustos, reporCustos } from "./v2/custosStore";
import { catalogo0 } from "./v2/catalogoModelo";
import { ligarCatalogo } from "./produtosVisita";
import { planoDoOrcamento, porAtribuir } from "./preparacaoObra";
import { partesDoEstado } from "./sincronizacao";
import { precoSugeridoLivre } from "./adendas";
import { PAR_DEM0 } from "./entulho";
import { emFalta, AREA, ESCOLHAS, EXTERIOR, INTERIOR, type Grupo } from "./campos";
import { tecnicosIniciais } from "./equipa/tecnicos";

afterEach(() => { ligarCatalogo(null); reporCustos(); });

const comAcoes = (S: Estado = seed()) => { S.role = "direcao"; return { S, A: acoes(S, () => undefined, (fn) => fn()) }; };

describe("o €/h de cada ofício", () => {
  it("é a média dos técnicos do perfil: Ladrilhador = Sérgio Faria e Hugo Neves a 17,80 €/h", () => {
    const C = custos0(), h = horaPerfil(C, "ladrilhador");
    expect(h).toMatchObject({ fonte: "rh", eh: 17.8 });
    expect(h.tecnicos.map((t) => t.n)).toEqual(["Sérgio Faria", "Hugo Neves"]);
    expect(horaPerfil(C, "canalizador")).toMatchObject({ fonte: "rh", eh: 18.5 });
    expect(horaPerfil(C, "servente")).toMatchObject({ fonte: "rh", eh: 14.2 });
  });

  it("o caso da imagem: revestimento 0,75 h de Ladrilhador × 17,80 €/h = 13,35 € + estrutura (0,75 h × 3.400 € ÷ 672 h)", () => {
    const S = seed(), C = custosDe(S);
    const c = custoReceita(receitaDe(C, "revest", S.svc.revest)!, C, true);
    expect(c.oficios).toEqual([expect.objectContaining({ perfil: "ladrilhador", h: 0.75, eh: 17.8, fonte: "rh", tecnicos: ["Sérgio Faria", "Hugo Neves"] })]);
    expect(c.mo).toBeCloseTo(13.35, 6);
    expect(c.estr).toBeCloseTo(0.75 * (3400 / 672), 6);
    // o orçamento usa o mesmo: S.svc derivado da receita
    expect(S.svc.revest).toMatchObject({ eh: 17.8, perfilId: "ladrilhador", semCusto: false });
    expect(custoUn(S.svc.revest, S)).toBeCloseTo(13.35 + 1.01 + 0.75 * (3400 / 672), 2);
  });

  it("Canalização: 2 h × 18,50 €/h (Marco Antunes) no orçamento novo, em vez dos 25 €/h fixos", () => {
    const S = seed();
    expect(S.svc.canal.eh).toBe(18.5);
    expect(custoUn(S.svc.canal, S)).toBeCloseTo(2 * 18.5 + S.svc.canal.eq + S.svc.canal.cons + 2 * (3400 / 672), 2);
  });

  it("um ofício sem técnicos usa o salário do perfil, com o aviso 'Sem técnicos no RH'", () => {
    const C = custos0(), h = horaPerfil(C, "eletricista");
    expect(h).toMatchObject({ fonte: "salario", tecnicos: [] });
    expect(h.eh).toBeCloseTo((1900 * 14 * 1.2375 + 713) / 1345, 6);
    const S = seed(), rec = receitaDe(C, "eletr", S.svc.eletr)!, c = custoReceita(rec, C, true);
    expect(c.semTecnicos).toEqual(["Eletricista"]);
    const A = alertasServico({ rec, c, preco: 78, un: "pt", min: 28, alvo: 35, mesesDesatualizado: 6 });
    expect(A.find((a) => a.id === "sem-tecnicos")).toMatchObject({ k: "w", t: "Sem técnicos no RH" });
  });

  it("sem técnicos e sem salário: sem €/h (0 €, nunca a média dos outros), aviso que bloqueia o envio do orçamento", () => {
    const { S, A } = comAcoes();
    // o Hugo e o Sérgio passam a montadores: o Ladrilhador fica sem técnicos e não tem salário
    A.editarTecnico("hn", { perfilId: "montador" });
    A.editarTecnico("sf", { perfilId: "montador" });
    expect(horaPerfil(custosDe(S), "ladrilhador")).toMatchObject({ fonte: "sem", eh: null });
    expect(S.svc.revest).toMatchObject({ eh: 0, semCusto: true });
    // o Montador passa a ser a média do Paulo, do Hugo e do Sérgio
    expect(horaPerfil(custosDe(S), "montador").eh).toBeCloseTo((16.9 + 17.8 + 17.8) / 3, 6);
    const d = S.deals.find((x) => x.id === 1031)!;
    d.orc!.linhas.push({ t: "svc", sid: "revest", q: 5, cu: custoUn(S.svc.revest, S), pu: 26 });
    const al = alertas(d, S).find((a) => a.t === "Ofício sem custo/hora em Revestimento de parede")!;
    expect(al).toMatchObject({ k: "x", aprov: false });
    d.orc!.aprov = "ok";
    expect(bloqueado(d, S)).toBe(true); // nem com a aprovação da Direção
  });

  it("mexer no salário de um perfil não muda o custo de outro ofício (já não há média dos perfis)", () => {
    const C = custos0(), S = seed();
    const antes = custoReceita(receitaDe(C, "revest", S.svc.revest)!, C, true).total;
    C.perfis.find((p) => p.id === "canalizador")!.salario = 2500;
    C.perfis.find((p) => p.id === "eletricista")!.salario = 3000;
    expect(custoReceita(receitaDe(C, "revest", S.svc.revest)!, C, true).total).toBe(antes);
  });

  it("um técnico sem custo no RH fica fora da média; sem outros, o perfil usa o salário (com aviso)", () => {
    const C = custos0(), L = tecnicosIniciais();
    L.find((t) => t.id === "ma")!.semCustoRh = true;
    const h = horaPerfil(C, "canalizador", L);
    expect(h).toMatchObject({ fonte: "salario", semCustoRh: ["Marco Antunes"] });
    expect(h.eh).toBeCloseTo((1900 * 14 * 1.2375 + 713) / 1345, 6);
    L.find((t) => t.id === "sf")!.semCustoRh = true;
    expect(horaPerfil(C, "ladrilhador", L)).toMatchObject({ fonte: "rh", eh: 17.8, tecnicos: [expect.objectContaining({ n: "Hugo Neves" })] });
  });

  it("uma só taxa de estrutura: mudar a estrutura nos Custos muda o custo do orçamento", () => {
    const S = seed(), antes = custoUn(S.svc.canal, S);
    custosDe(S).estrutura.push({ id: "s9", n: "Mais renda", cat: "Renda", mensal: 672, ativo: true });
    expect(taxaEstrutura(custosDe(S))).toBeCloseTo(4072 / 672, 6);
    expect(custoUn(S.svc.canal, S)).toBeCloseTo(antes + 2 * 1, 2);
  });
});

describe("serviços que entram pela visita e linhas livres", () => {
  it("um serviço novo entra com a receita de agora (as receitas mexidas e o €/h dos técnicos), não com o resumo fixo", () => {
    const S = seed(), C = custosDe(S);
    const rec = receitaDe(C, "c13", null)!;
    C.receitas.c13 = { ...rec, origem: "editada", mo: rec.mo.map((p) => ({ ...p, h: p.h * 2 })) };
    const s = garantirServico(S, "c13")!;
    const c = custoReceita(C.receitas.c13, C, false);
    expect(s).toMatchObject({ perfilId: "canalizador", eh: 18.5 });
    expect(s.h).toBeCloseTo(c.h, 2);
    expect(servicoDoCatalogo("c13", S)!.preco).toBe(rec.precoTabela); // o preço de tabela mantém-se
  });

  it("a linha livre (adenda/imprevisto) usa o €/h do perfil escolhido, não 25 €/h", () => {
    const S = seed();
    const sug = precoSugeridoLivre(S, 4, "Canalização");
    expect(sug).toBeCloseTo((4 * 18.5 + 4 * (3400 / 672)) / (1 - 0.35), 1);
    expect(precoSugeridoLivre(S, 4, "Revestimentos")).toBeCloseTo((4 * 17.8 + 4 * (3400 / 672)) / (1 - 0.35), 1);
  });

  it("a demolição: a equipa de 2 ao €/h do Servente (2 × 14,20 €/h)", () => {
    const S = seed(), P = parDemolicao(S, PAR_DEM0);
    expect(P).toMatchObject({ custoHora: 28.4, perfilId: "servente" });
  });
});

describe("o produto e a subempreitada", () => {
  it("a sanita suspensa traz a instalação de sanita suspensa; nenhum produto suspenso traz a compacta (nem o contrário)", () => {
    const K = catalogo0();
    expect(K.produtos.find((p) => p.n === "Sanita suspensa com estrutura")!.servico).toBe("s-moissusp");
    expect(K.produtos.find((p) => p.n === "Sanita compacta")!.servico).toBe("c13");
    const S = seed(), nome = (sid: string) => (garantirServico(S, sid)?.n ?? sid).toLowerCase();
    for (const p of K.produtos) {
      if (!p.servico || !/sanita|bid[eé]/i.test(p.n)) continue;
      const n = nome(p.servico);
      if (/suspens/i.test(p.n)) expect(n, p.n).not.toMatch(/compacta/);
      if (/compacta/i.test(p.n)) expect(n, p.n).not.toMatch(/suspensa/);
    }
  });

  it("as subempreitadas sem custo: aviso no Catálogo e na linha do orçamento (sem inventar valores)", () => {
    const S = seed(), C = custosDe(S);
    const it = listaCatalogoCompleta(S, C).find((i) => i.sid === "s-moistr")!;
    expect(it.c.total).toBe(0);
    expect(it.alertas.map((a) => a.id)).toEqual(["subempreitada"]);
    const s = garantirServico(S, "s-moistr")!;
    const d = S.deals.find((x) => x.id === 1031)!;
    d.orc!.linhas.push({ t: "svc", sid: "s-moistr", q: 1, cu: custoUn(s, S), pu: s.preco });
    const A = alertas(d, S);
    expect(A.find((a) => a.t === `Subempreitada sem custo em ${s.n}`)).toMatchObject({ k: "w" });
    expect(A.some((a) => a.t.includes(s.n) && a.k === "x")).toBe(false);
  });
});

describe("o plano da obra escolhe o técnico pelo perfil", () => {
  it("um ofício sem técnicos fica por atribuir (não vai para o Montador)", () => {
    const { S, A } = comAcoes();
    const K = catalogo0();
    ligarCatalogo(() => K);
    const d = S.deals.find((x) => x.id === 1035)!;
    d.visita.extra = { eletr: 2 };
    const gs: Grupo[] = [EXTERIOR, INTERIOR, AREA, ESCOLHAS];
    for (let i = 0; i < 5; i++) for (const c of emFalta(gs, d.f)) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : "1";
    A.manter(d.id, "loucas", "sim"); A.manter(d.id, "pav", "sim");
    A.fecharVisita(d.id);
    const p = planoDoOrcamento(d, S);
    const el = p.tasks.find((t) => t.svcs.includes("eletr"))!;
    expect(el).toMatchObject({ perfilId: "eletricista", sk: "Eletricista", tec: null });
    expect(porAtribuir(p)).toContain(el);
    const rev = p.tasks.find((t) => t.svcs.includes("revest"))!;
    expect(rev.perfilId).toBe("ladrilhador");
    expect(["sf", "hn"]).toContain(rev.tec);
  });
});

describe("os custos no Estado", () => {
  it("vão na parte global da sincronização; um estado de antes fica com os de arranque", () => {
    const S = seed();
    expect((partesDoEstado(S)[0].dados as { custos: unknown }).custos).toBe(S.custos);
    const velho = JSON.parse(JSON.stringify(S)) as Estado;
    delete velho.custos;
    expect(garantirCustos(velho)).toBe(true);
    expect(velho.custos!.perfis.length).toBe(custos0().perfis.length);
    expect(garantirCustos(velho)).toBe(false);
  });

  it("a store dos custos escreve no Estado ligado (sobrevive a recarregar)", () => {
    const S = seed();
    ligarCustos(S);
    expect(lerCustos()).toBe(S.custos);
    mudarCustos((c) => { c.perfis.find((p) => p.id === "pintor")!.salario = 2000; });
    expect(S.custos!.perfis.find((p) => p.id === "pintor")!.salario).toBe(2000);
    const lido = JSON.parse(JSON.stringify(S)) as Estado;
    expect(lido.custos!.perfis.find((p) => p.id === "pintor")!.salario).toBe(2000);
  });
});
