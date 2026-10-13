import { afterEach, describe, expect, it } from "vitest";
import { acoes, partes, seed, tot, type Negocio } from "./motor";
import { ligarCatalogo } from "./produtosVisita";
import { catalogo0 } from "./v2/catalogoModelo";
import { AREA, ESCOLHAS, EXTERIOR, INTERIOR, emFalta, type Grupo } from "./campos";
import { HORAS_DIA, TAREFA_DEMOLICAO, ajustePrazo, diasDeHoras, diasPrevistos, ordemOficio, tarefasPrevistas } from "./ganttOrcamento";

const comServicos = () => {
  const S = seed();
  const d = S.deals.find((x) => x.orc && x.orc.linhas.filter((l) => l.t === "svc").length >= 3) as Negocio;
  d.orc!.enviada = null; // um orçamento ainda por enviar
  const A = acoes(S, () => {}, (fn) => fn());
  return { S, d, A };
};

describe("prazo previsto no orçamento", () => {
  it("dias das horas: 8 h por dia, ao meio dia, pelo menos meio dia", () => {
    expect(diasDeHoras(0.3)).toBe(0.5);
    expect(diasDeHoras(4)).toBe(0.5);
    expect(diasDeHoras(4.8)).toBe(1);
    expect(diasDeHoras(8)).toBe(1);
    expect(diasDeHoras(12.75)).toBe(2);
  });

  it("a ordem dos ofícios: demolição, instalações, revestimentos, montagem, pintura", () => {
    expect(["Pintor", "Ladrilhador", "Canalizador", "Servente · demolição", "Montador"].map(ordemOficio)).toEqual([4, 2, 1, 0, 3]);
    // as louças montam-se depois do revestimento, mesmo pelo canalizador
    expect(ordemOficio("Montagem de louças Canalizador")).toBe(3);
  });

  it("uma tarefa por serviço, em sequência, e sem mexer o custo e o preço do orçamento", () => {
    const { S, d } = comServicos();
    const antes = tot(d, S);
    const T = tarefasPrevistas(d, S);
    expect(T.length).toBe(d.orc!.linhas.filter((l) => l.t === "svc" && l.q > 0).length);
    for (let i = 1; i < T.length; i++) {
      expect(T[i].inicio).toBe(T[i - 1].inicio + T[i - 1].dias);
      expect(ordemOficio(`${T[i].nome} ${T[i].perfil}`)).toBeGreaterThanOrEqual(ordemOficio(`${T[i - 1].nome} ${T[i - 1].perfil}`));
    }
    // o custo de cada tarefa é o da linha do orçamento
    for (const t of T) {
      const l = d.orc!.linhas.find((x) => x.t === "svc" && x.sid === t.chave)!;
      expect(l.t === "svc" && t.custo.total).toBeCloseTo(l.t === "svc" ? l.cu * l.q : 0, 2);
      expect(t.delta).toBe(0);
    }
    expect(ajustePrazo(d, S)).toBe(0);
    expect(tot(d, S)).toEqual(antes);
    expect(diasPrevistos(T)).toBe(T.reduce((a, t) => a + diasDeHoras(t.hOrc), 0));
  });

  it("mudar os dias de uma tarefa: as horas passam a dias × 8 e o custo e a margem mudam; o preço não", () => {
    const { S, d, A } = comServicos();
    const antes = tot(d, S), mo0 = partes(d, S).mo;
    const t0 = tarefasPrevistas(d, S)[0];
    A.prazoTarefa(d.id, t0.chave, t0.dias + 1);
    const t1 = tarefasPrevistas(d, S).find((t) => t.chave === t0.chave)!;
    expect(t1.manual).toBe(true);
    expect(t1.h).toBe((t0.dias + 1) * HORAS_DIA);
    const delta = (t1.h - t0.hOrc) * t0.custoHora;
    expect(t1.delta).toBeCloseTo(delta, 2);
    expect(t1.custo.total).toBeCloseTo(t0.custo.total + delta, 2);
    const depois = tot(d, S);
    expect(depois.custo).toBeCloseTo(antes.custo + delta, 2);
    expect(depois.pf).toBe(antes.pf);
    expect(depois.m).toBeLessThan(antes.m);
    expect(partes(d, S).mo).toBeCloseTo(mo0 + delta, 2);
    // as tarefas a seguir começam um dia depois
    const T = tarefasPrevistas(d, S);
    expect(T[1].inicio).toBe(t0.dias + 1);
    // repor
    A.prazoTarefa(d.id, t0.chave, null);
    expect(d.orc!.prazo).toBeUndefined();
    expect(tot(d, S)).toEqual(antes);
  });

  it("menos de meio dia não se aceita; numa proposta enviada não se mexe", () => {
    const { S, d, A } = comServicos();
    const t0 = tarefasPrevistas(d, S)[0];
    A.prazoTarefa(d.id, t0.chave, 0);
    expect(d.orc!.prazo).toBeUndefined();
    d.orc!.enviada = "hoje";
    A.prazoTarefa(d.id, t0.chave, 3);
    expect(d.orc!.prazo).toBeUndefined();
  });

  describe("com a demolição e entulho", () => {
    afterEach(() => ligarCatalogo(null));
    it("é a primeira tarefa, com as horas de demolir e de carregar, e o custo a €/h dos parâmetros", () => {
      const S = seed();
      const K = catalogo0();
      ligarCatalogo(() => K);
      const A = acoes(S, () => {}, (fn) => fn());
      const d = S.deals.find((x) => x.id === 1035)!;
      const gs: Grupo[] = [EXTERIOR, INTERIOR, AREA, ESCOLHAS];
      for (let i = 0; i < 5; i++) for (const c of emFalta(gs, d.f)) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : "1";
      A.manter(d.id, "loucas", "sim"); A.manter(d.id, "pav", "sim");
      A.fecharVisita(d.id);
      const r = d.orc!.demolicao!.r!;
      const T = tarefasPrevistas(d, S);
      expect(T[0].chave).toBe(TAREFA_DEMOLICAO);
      expect(T[0].hOrc).toBeCloseTo(r.horas + r.horasCarga, 6);
      expect(T[0].custo.total).toBeCloseTo(r.custo, 2);
      const antes = tot(d, S);
      A.prazoTarefa(d.id, TAREFA_DEMOLICAO, 2);
      const t = tarefasPrevistas(d, S)[0];
      expect(t.delta).toBeCloseTo((16 - T[0].hOrc) * K.parDem!.custoHora, 2);
      expect(tot(d, S).custo).toBeCloseTo(antes.custo + t.delta, 2);
      // o preço da demolição não muda
      expect(d.orc!.demolicao!.r!.preco).toBe(r.preco);
    });
  });
});
