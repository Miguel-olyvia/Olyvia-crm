// 27/11: o Cérebro da Olyvia. A montagem do grafo (nós e arestas a partir das linhas da base), a pesquisa, os agentes por obra e as forças.
import { describe, expect, it } from "vitest";
import { obraDeExemplo } from "../estudioObra/exemploObra";
import { GUIA, itensDoConhecimento } from "../conhecimentoOlyvia";
import { AGENTES } from "../estudioObra/agentes";
import {
  filtrarGrafo, ligacoesDoNo, montarGrafo, obrasDaBase, obrasDoEstado, procurar, proximaVolta, resumoDosAgentes, temasDoGuia, ultimaEscrita, vizinhos,
  type LinhaConhecimento,
} from "./grafoConhecimento";
import { Simulacao, enquadrar } from "./forcas";

const linha = (tipo: string, numero: number | null, titulo: string, dados: Record<string, unknown> = {}, chave?: string): LinhaConhecimento =>
  ({ chave: chave ?? `${tipo}:${numero ?? titulo}`, tipo, numero, titulo, texto: `${titulo}.`, dados, atualizado_em: "2026-11-27T10:00:00Z" });

const BASE: LinhaConhecimento[] = [
  ...GUIA.map((g) => ({ ...g, numero: null, dados: null, atualizado_em: null })),
  linha("negocio", 1048, "Negócio 1048 · Tiago Bandarra", { fase: "Obra", valor: 37661.03 }),
  linha("orcamento", 1048, "Orçamento 1048 · Tiago Bandarra", { totais: { base: 35000, iva: 2661.03, total: 37661.03 } }),
  linha("custos", 1048, "Custos e margem 1048 · Tiago Bandarra", { custo: 21700, margem: 0.38 }),
  linha("obra", 1048, "Obra 1048 · Tiago Bandarra", {
    estado: "em curso", fim: "qui, 8 abr", decisoes: 2,
    propostas: [
      { ref: "1048:buraco-3", agente: "Plano", modo: "pede", titulo: "3 dias sem ninguém" },
      { ref: "1048:sem-1", agente: "Equipa", modo: "prazo", titulo: "Passar a pintura ao Luís" },
      { ref: "1048:mat-2", agente: "Materiais", modo: "pede", titulo: "Azulejo chega depois do início" },
    ],
    degraus: { plano: 1, equipa: 1, materiais: 1, cliente: 1, margem: 1, aprendizagem: 0 },
    feitos: [{ agente: "equipa", texto: "Avisou os técnicos", quando: "2026-11-27T09:12:00Z", auto: true, quem: "Agente Equipa" }],
  }),
  linha("negocio", 1050, "Negócio 1050 · Ana Lopes", { fase: "Visita" }),
  linha("resumo", null, "O dia das obras", { obras: 1, decisoes: 2, feitos: 1, origem: "servidor", volta: "2026-11-27T10:15:02Z" }, "resumo:dia"),
];

describe("o grafo do Cérebro", () => {
  const g = montarGrafo(BASE);
  const no = (id: string) => g.nos.find((n) => n.id === id);
  const ligados = (a: string, b: string) => g.arestas.some((e) => (e.de === a && e.para === b) || (e.de === b && e.para === a));

  it("tem um nó por item da base, os temas usados e os seis agentes", () => {
    for (const l of BASE) expect(no(l.chave!), l.chave!).toBeTruthy();
    expect(g.nos.filter((n) => n.tipo === "agente").map((n) => n.agente)).toEqual(AGENTES.map((a) => a.id));
    expect(g.nos.filter((n) => n.tipo === "tema").length).toBeGreaterThanOrEqual(3);
    // ids únicos, arestas sem pontas soltas nem repetidas
    expect(new Set(g.nos.map((n) => n.id)).size).toBe(g.nos.length);
    const ids = new Set(g.nos.map((n) => n.id));
    for (const e of g.arestas) { expect(ids.has(e.de)).toBe(true); expect(ids.has(e.para)).toBe(true); }
    expect(new Set(g.arestas.map((e) => e.id)).size).toBe(g.arestas.length);
  });

  it("liga o negócio ao orçamento, aos custos e à obra; o orçamento aos custos", () => {
    expect(ligados("negocio:1048", "orcamento:1048")).toBe(true);
    expect(ligados("negocio:1048", "custos:1048")).toBe(true);
    expect(ligados("negocio:1048", "obra:1048")).toBe(true);
    expect(ligados("orcamento:1048", "custos:1048")).toBe(true);
    expect(ligados("negocio:1050", "orcamento:1048")).toBe(false);
    // os negócios ao tema; o resumo às obras
    expect(ligados("negocio:1050", "tema:negocios")).toBe(true);
    expect(ligados("resumo:dia", "obra:1048")).toBe(true);
  });

  it("liga o guia aos temas", () => {
    expect(ligados("guia:agentes", "tema:agentes")).toBe(true);
    expect(ligados("guia:degraus", "tema:agentes")).toBe(true);
    expect(ligados("guia:voz", "tema:voz")).toBe(true);
    expect(ligados("guia:portal", "tema:portal")).toBe(true);
    expect(ligados("guia:estudio-obra", "tema:obras")).toBe(true);
    expect(temasDoGuia("Uma nota sem tema", "Fala do portal do cliente.")).toEqual(["tema:portal"]);
    for (const n of g.nos.filter((x) => x.tipo === "guia")) expect(n.grau, n.id).toBeGreaterThan(0);
  });

  it("liga cada agente às obras onde propõe ou fez alguma coisa; a ligação corre quando pede decisão", () => {
    const e = (a: string) => g.arestas.find((x) => x.tipo === "agente" && (x.de === `agente:${a}` || x.para === `agente:${a}`) && (x.de === "obra:1048" || x.para === "obra:1048"));
    expect(e("plano")?.ativa).toBe(true);
    expect(e("materiais")?.ativa).toBe(true);
    expect(e("equipa")).toBeTruthy();
    expect(e("equipa")?.ativa).toBeFalsy();
    expect(e("cliente")).toBeUndefined();
    // a obra com decisões à espera pulsa
    expect(no("obra:1048")!.decisoes).toBe(2);
    expect(no("negocio:1048")!.decisoes).toBe(0);
  });

  it("os custos só entram quando vêm da base (a RLS tira-os a quem não vê custos)", () => {
    const semCustos = montarGrafo(BASE.filter((l) => l.tipo !== "custos"));
    expect(semCustos.nos.some((n) => n.tipo === "custos")).toBe(false);
    expect(semCustos.arestas.some((e) => e.id.includes("custos"))).toBe(false);
  });

  it("um orçamento sem o negócio (não visível) não fica solto: vai ao tema", () => {
    const s = montarGrafo([linha("orcamento", 7, "Orçamento 7 · X")]);
    expect(s.arestas.map((e) => e.id)).toEqual(["orcamento:7|tema:negocios"]);
    expect(s.nos.some((n) => n.tipo === "agente")).toBe(false);
  });

  it("filtra por tipo, procura sem acentos e dá os vizinhos", () => {
    const f = filtrarGrafo(g, new Set(["negocio", "obra"]));
    expect(f.nos.every((n) => n.tipo === "negocio" || n.tipo === "obra")).toBe(true);
    expect(f.arestas.map((e) => e.id)).toEqual(["negocio:1048|obra:1048"]);
    expect(procurar(g, "bandarra")[0]).toMatch(/1048/);
    expect(procurar(g, "orcamento 1048")[0]).toBe("orcamento:1048");
    expect(procurar(g, "AUTONOMIA")).toContain("guia:degraus");
    expect(procurar(g, "   ")).toEqual([]);
    expect([...vizinhos(g, "custos:1048")].sort()).toEqual(["negocio:1048", "orcamento:1048"]);
  });

  it("dá as ligações para o negócio, o Estúdio da obra e o relatório", () => {
    expect(ligacoesDoNo(no("negocio:1048")!, g)).toEqual({ negocio: "/negocios?negocio=1048", obra: "/negocios?vista=operacoes&obra=1048", relatorio: "/relatorios/olyvia?tipo=orcamento&numero=1048" });
    expect(ligacoesDoNo(no("obra:1048")!, g).relatorio).toBe("/relatorios/olyvia?tipo=obras");
    expect(ligacoesDoNo(no("negocio:1050")!, g)).toEqual({ negocio: "/negocios?negocio=1050", relatorio: "/relatorios/olyvia?tipo=negocios" });
    expect(ligacoesDoNo(no("guia:voz")!, g)).toEqual({});
  });
});

describe("os agentes no Cérebro", () => {
  it("lê da base as propostas, os degraus e o que fizeram (com o nome ou o id do agente)", () => {
    const [o] = obrasDaBase(BASE);
    expect(o).toMatchObject({ numero: 1048, nome: "Tiago Bandarra", estado: "em curso", fim: "qui, 8 abr" });
    expect(o.propostas.map((p) => [p.agente, p.modo])).toEqual([["plano", "pede"], ["equipa", "prazo"], ["materiais", "pede"]]);
    expect(o.degraus.plano).toBe(1);
    expect(o.feitos).toHaveLength(1);
    expect(o.feitos[0].agente).toBe("equipa");
  });
  it("sem os degraus na base (o servidor antigo) usa os de origem", () => {
    const [o] = obrasDaBase([linha("obra", 1, "Obra 1 · X", { propostas: [] })]);
    expect(o.degraus).toMatchObject({ plano: 2, equipa: 2, materiais: 1, aprendizagem: 0 });
  });
  it("soma por agente: propostas, decisões, feitos e o degrau", () => {
    const R = resumoDosAgentes(obrasDaBase(BASE));
    const r = (id: string) => R.find((x) => x.id === id)!;
    expect(R).toHaveLength(6);
    expect(r("plano")).toMatchObject({ propostas: 1, pedem: 1, feitos: 0, degrau: 1, degrauVaria: false });
    expect(r("equipa")).toMatchObject({ propostas: 1, pedem: 0, prazo: 1, feitos: 1 });
    expect(r("plano").obras).toEqual([{ numero: 1048, nome: "Tiago Bandarra", propostas: 1, pedem: 1, degrau: 1 }]);
    expect(r("cliente").obras).toEqual([]);
  });
  it("ao vivo, a partir do Estado dos Negócios, vê as mesmas propostas que a fita", () => {
    const { S, d } = obraDeExemplo();
    const agora = new Date(2026, 10, 26, 10, 0);
    const O = obrasDoEstado(S, agora);
    const o = O.find((x) => x.numero === d.id)!;
    expect(o.estado).toBe("em curso");
    expect(o.propostas.length).toBeGreaterThan(0);
    expect(o.propostas.some((p) => p.agente === "plano")).toBe(true);
    // a base escrita no mesmo momento dá o mesmo grafo de agentes
    const linhas = itensDoConhecimento(S, agora).map((x) => ({ ...x, numero: x.numero ?? null, dados: x.dados ?? null }));
    const base = obrasDaBase(linhas).find((x) => x.numero === d.id)!;
    expect(base.propostas.map((p) => p.agente)).toEqual(o.propostas.slice(0, 10).map((p) => p.agente));
    expect(base.degraus).toEqual(o.degraus);
    const g = montarGrafo(linhas, O);
    expect(g.nos.find((n) => n.id === `obra:${d.id}`)!.decisoes).toBe(o.propostas.filter((p) => p.modo === "pede").length);
  });
});

describe("o servidor e a base", () => {
  it("a próxima volta é no quarto de hora seguinte", () => {
    expect(proximaVolta(new Date(2026, 10, 27, 10, 7, 30)).getMinutes()).toBe(15);
    expect(proximaVolta(new Date(2026, 10, 27, 10, 45, 0)).getHours()).toBe(11);
    expect(proximaVolta(new Date(2026, 10, 27, 10, 59, 59)).getMinutes()).toBe(0);
  });
  it("sabe quem escreveu a base por último", () => {
    expect(ultimaEscrita(BASE)).toEqual({ quando: "2026-11-27T10:15:02Z", origem: "servidor" });
    expect(ultimaEscrita([linha("resumo", null, "O dia", {})])).toEqual({ quando: "2026-11-27T10:00:00Z", origem: null });
    expect(ultimaEscrita([])).toEqual({ quando: null, origem: null });
  });
  it("o resumo do dia guarda a origem (servidor ou página)", () => {
    const { S } = obraDeExemplo();
    const r = itensDoConhecimento(S, new Date(2026, 10, 26, 10, 0), "servidor").find((x) => x.tipo === "resumo")!;
    expect(r.dados).toMatchObject({ origem: "servidor" });
  });
});

describe("as forças", () => {
  it("assenta: os nós ligados ficam perto, os soltos afastam-se, nada sai para o infinito", () => {
    const g = montarGrafo(BASE);
    const sim = new Simulacao(g.nos.map((n) => ({ id: n.id, r: 6 })), g.arestas);
    sim.correr(400);
    const c = (id: string) => sim.corpo(id)!;
    const dist = (a: string, b: string) => Math.hypot(c(a).x - c(b).x, c(a).y - c(b).y);
    for (const x of sim.corpos) { expect(Number.isFinite(x.x)).toBe(true); expect(Math.abs(x.x)).toBeLessThan(2000); }
    expect(dist("negocio:1048", "orcamento:1048")).toBeLessThan(dist("negocio:1048", "guia:voz"));
    // nenhum par em cima do outro
    for (let i = 0; i < sim.corpos.length; i++) for (let j = i + 1; j < sim.corpos.length; j++)
      expect(Math.hypot(sim.corpos[i].x - sim.corpos[j].x, sim.corpos[i].y - sim.corpos[j].y)).toBeGreaterThan(4);
  });
  it("é determinística e mantém as posições de antes quando os dados se atualizam", () => {
    const g = montarGrafo(BASE);
    const a = new Simulacao(g.nos.map((n) => ({ id: n.id, r: 6 })), g.arestas); a.correr(100);
    const b = new Simulacao(g.nos.map((n) => ({ id: n.id, r: 6 })), g.arestas); b.correr(100);
    expect(a.corpos.map((x) => Math.round(x.x))).toEqual(b.corpos.map((x) => Math.round(x.x)));
    const antes = new Map(a.corpos.map((x) => [x.id, { x: x.x, y: x.y }]));
    const c = new Simulacao(g.nos.map((n) => ({ id: n.id, r: 6 })), g.arestas, {}, antes);
    expect(c.corpo("negocio:1048")!.x).toBe(a.corpo("negocio:1048")!.x);
  });
  it("um nó preso (a ser arrastado) fica onde o dedo está", () => {
    const sim = new Simulacao([{ id: "a", r: 5 }, { id: "b", r: 5 }], [{ de: "a", para: "b" }]);
    const a = sim.corpo("a")!; a.fx = 100; a.fy = -50;
    sim.correr(20);
    expect([a.x, a.y]).toEqual([100, -50]);
  });
  it("enquadra o grafo na janela", () => {
    const e = enquadrar({ x0: -100, y0: -50, x1: 100, y1: 50 }, 440, 240, 20);
    expect(e.k).toBe(2);
    expect(e).toMatchObject({ x: 220, y: 120 });
  });
});
