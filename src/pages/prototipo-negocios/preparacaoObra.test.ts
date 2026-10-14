import { describe, expect, it } from "vitest";
import { acoes, minhas, seed } from "./motor";
import { FINANCEIRO, OBRA, emFalta, type Grupo } from "./campos";
import { faltaParaArrancar, passosPreparacao, skDaTarefa } from "./preparacaoObra";

const preencher = (d: { f: Record<string, string> }, gs: Grupo[]) => {
  for (let i = 0; i < 5; i++) {
    const f = emFalta(gs, d.f);
    if (!f.length) return;
    for (const c of f) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x";
  }
};
// 1027 Tiago Almeida: contrato assinado a 08/10 → encomenda de cliente e plano por aprovar
const preparar = () => { const S = seed(); return { S, A: acoes(S, () => {}, (fn) => fn()), d: S.deals.find((x) => x.id === 1027)! }; };
const estados = (S: ReturnType<typeof seed>, d: ReturnType<typeof preparar>["d"]) => Object.fromEntries(passosPreparacao(d, S).map((p) => [p.id, p.estado]));

describe("do contrato à obra", () => {
  it("o contrato gera a encomenda de cliente (materiais e stock) e o plano do orçamento, ambos por aprovar", () => {
    const { S, d } = preparar();
    expect(d.obra.ec).toMatchObject({ n: "EC 2026/001", estado: "por aprovar", criada: "08/10" });
    expect(d.obra.ec!.linhas.length).toBeGreaterThan(0);
    expect(d.obra.plano).toMatchObject({ estado: "por aprovar", origem: "orcamento" });
    expect(d.obra.plano!.tasks.every((t) => t.fase && t.tec)).toBe(true);
    expect(estados(S, d)).toMatchObject({ ec: "feito", "ec-ok": "agora", ef: "espera", pl: "feito", "pl-ok": "agora", ft: "agora", pg: "espera", go: "espera" });
    expect(faltaParaArrancar(d)).toEqual(["aprovar a encomenda de cliente", "aprovar o plano", "emitir a fatura e receber o pagamento"]);
  });

  it("cada papel vê no Hoje o seu passo, em paralelo", () => {
    const { S } = preparar();
    const de = (r: Parameters<typeof minhas>[1]) => minhas(S, r).filter((x) => x.d.id === 1027).map((x) => x.p.act);
    expect(de("comercial")).toEqual(["aprovarEc"]);
    expect(de("direcao")).toEqual([]);
    expect(de("operacoes")).toEqual(["aprovarPlano"]);
    expect(de("financeiro")).toEqual(["emitir"]);
  });

  it("a encomenda aprovada reserva o stock e emite a encomenda a fornecedor; validada, encomendada; recebida", () => {
    const { S, A, d } = preparar();
    const antes = { ...S.stock };
    A.aprovarEc(d.id);
    expect(d.obra.ec!.estado).toBe("aprovada");
    expect(d.obra.mats).toBeTruthy();
    const reservado = d.obra.ec!.linhas.filter((x) => x.k).reduce((a, x) => a + x.res, 0);
    expect(Object.values(antes).reduce((a, v) => a + v, 0) - Object.values(S.stock).reduce((a, v) => a + v, 0)).toBeCloseTo(reservado, 5);
    const e = d.obra.enc!;
    expect(e).toMatchObject({ estado: "por confirmar", forn: "Madeiras e Cozinhas (exemplo)" });
    expect(e.linhas.map((x) => x.n)).toEqual(d.obra.ec!.linhas.filter((x) => x.falta > 0).map((x) => x.n));
    expect(minhas(S, "financeiro").filter((x) => x.d.id === 1027).map((x) => x.p.act)).toEqual(["validarEf", "emitir"]);
    A.escolherForn(d.id, "Cerâmica do Centro (exemplo)");
    S.role = "financeiro";
    A.validarEf(d.id);
    expect(e).toMatchObject({ estado: "encomendada", forn: "Cerâmica do Centro (exemplo)", validada: { por: "Sandra · Financeiro" } });
    expect(d.hist[0].t).toMatch(/antes de o sinal entrar/);
    A.receberEnc(d.id);
    expect(estados(S, d).rec).toBe("feito");
  });

  it("só arranca com tudo: encomenda, materiais, plano e sinal", () => {
    const { S, A, d } = preparar();
    preencher(d, [OBRA[0]]);
    A.arrancar(d.id);
    expect(d.obra.plano!.estado).toBe("por aprovar");
    A.aprovarEc(d.id); A.validarEf(d.id); A.receberEnc(d.id); A.aprovarPlano(d.id);
    expect(faltaParaArrancar(d)).toEqual(["emitir a fatura e receber o pagamento"]);
    preencher(d, FINANCEIRO);
    A.emitir(d.id); A.validar(d.id);
    expect(d.fase).toBe(5);
    expect(estados(S, d).go).toBe("agora");
    expect(minhas(S, "operacoes").filter((x) => x.d.id === 1027).map((x) => x.p.act)).toEqual(["arrancar"]);
    A.arrancar(d.id);
    expect(d.obra.plano!.estado).toBe("em curso");
  });

  it("o ofício da tarefa escolhe o tipo de técnico", () => {
    expect(skDaTarefa("Demolições", "Demolição e entulho")).toBe("Servente · demolição");
    expect(skDaTarefa("Canalização", "Canalização")).toBe("Canalizador");
    expect(skDaTarefa("Revestimentos", "Pavimento cerâmico")).toBe("Ladrilhador");
    expect(skDaTarefa("Carpintaria", "Montagem de móveis")).toBe("Montador");
  });
});
