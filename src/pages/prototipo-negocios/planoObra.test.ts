import { describe, expect, it } from "vitest";
import { acoes, seed, tot, type Negocio } from "./motor";
import { curvaCusto, custoAte, dataCurta, diasDaObra, feriadosPT, feriadosSaltados, iniciosRapidos, isoDia, pascoa, planoObra, proximoUtil } from "./planoObra";

const comOrcamento = () => {
  const S = seed();
  const d = S.deals.find((x) => x.orc && x.orc.linhas.filter((l) => l.t === "svc").length >= 3) as Negocio;
  d.orc!.enviada = null;
  return { S, d, A: acoes(S, () => {}, (fn) => fn()) };
};

describe("calendário da obra", () => {
  it("a Páscoa e os feriados móveis", () => {
    expect(isoDia(pascoa(2026))).toBe("2026-04-05");
    expect(isoDia(pascoa(2027))).toBe("2027-03-28");
    const f = feriadosPT(2026);
    expect(f.get("2026-04-03")).toBe("Sexta-feira Santa");
    expect(f.get("2026-06-04")).toBe("Corpo de Deus");
    expect(f.get("2026-12-08")).toBe("Imaculada Conceição");
    expect(f.size).toBe(12);
  });
  it("só dias úteis: salta o fim de semana e os feriados", () => {
    // seg 30/11/2026; ter 1/12 é feriado (Restauração da Independência)
    const dias = diasDaObra(new Date(2026, 10, 30), 4).map(isoDia);
    expect(dias).toEqual(["2026-11-30", "2026-12-02", "2026-12-03", "2026-12-04"]);
    expect(feriadosSaltados(diasDaObra(new Date(2026, 10, 30), 4)).map((x) => x.nome)).toEqual(["Restauração da Independência"]);
    // a começar a um sábado, começa na segunda
    expect(isoDia(proximoUtil(new Date(2026, 9, 17)))).toBe("2026-10-19");
    expect(dataCurta(new Date(2026, 9, 19))).toBe("seg, 19 out");
  });
  it("os inícios rápidos são segundas-feiras úteis, por ordem", () => {
    const r = iniciosRapidos(new Date(2026, 9, 14)); // quarta
    expect(r.map((x) => isoDia(x.data))).toEqual(["2026-10-19", "2026-10-26", "2026-11-16"]);
  });
});

describe("plano da obra por fases", () => {
  it("as fases somam o custo e o preço do orçamento", () => {
    const { S, d } = comOrcamento();
    const P = planoObra(d, S), T = tot(d, S);
    expect(P.custo).toBeCloseTo(T.custo, 1);
    expect(P.preco).toBeCloseTo(T.pf, 1);
    // por ordem, sem se sobreporem
    for (let i = 1; i < P.fases.length; i++) {
      expect(P.fases[i].n).toBeGreaterThan(P.fases[i - 1].n);
      expect(P.fases[i].inicio).toBeGreaterThanOrEqual(P.fases[i - 1].fim - 1e-9);
    }
  });
  it("mudar os dias de uma tarefa mexe nas datas e no custo da sua fase; o preço fica", () => {
    const { S, d, A } = comOrcamento();
    const P0 = planoObra(d, S), t = P0.tarefas[0];
    A.prazoTarefa(d.id, t.chave, t.dias + 1);
    const P1 = planoObra(d, S);
    expect(P1.dias).toBeCloseTo(P0.dias + 1, 5);
    const f0 = P0.fases.find((f) => f.n === t.fase)!, f1 = P1.fases.find((f) => f.n === t.fase)!;
    expect(f1.custo).toBeGreaterThan(f0.custo);
    expect(f1.preco).toBeCloseTo(f0.preco, 2);
    expect(P1.custo).toBeCloseTo(tot(d, S).custo, 1);
  });
  it("a curva do custo sobe sempre e acaba no custo total", () => {
    const { S, d } = comOrcamento();
    const P = planoObra(d, S), C = curvaCusto(P);
    for (let i = 1; i < C.length; i++) expect(C[i].c).toBeGreaterThanOrEqual(C[i - 1].c - 1e-9);
    expect(C[C.length - 1].c).toBeCloseTo(P.custo, 1);
    expect(custoAte(P, -1)).toBe(0);
  });
  it("com desconto, o preço das fases é o preço com o desconto", () => {
    const { S, d } = comOrcamento();
    d.orc!.desconto = 10;
    expect(planoObra(d, S).preco).toBeCloseTo(tot(d, S).pf, 1);
  });
});
