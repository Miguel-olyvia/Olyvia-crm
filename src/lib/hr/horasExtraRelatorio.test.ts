import { describe, expect, it } from "vitest";
import {
  extraDoDia,
  fonteDoPeriodo,
  linhasPorDia,
  modoDoDia,
  pendentesDoPeriodo,
  type EntradaExtraDoDia,
  type LinhaHoraExtraPeriodo,
} from "@/lib/hr/horasExtraRelatorio";

const linha = (extra: Partial<LinhaHoraExtraPeriodo> = {}): LinhaHoraExtraPeriodo => ({
  id: "h1",
  data: "2026-10-05",
  origem: "diaria",
  estado: "confirmada",
  minutos: 60,
  nocturno_min: 0,
  tipo_registo: "detectada",
  ...extra,
});

const dia = (extra: Partial<EntradaExtraDoDia> = {}): EntradaExtraDoDia => ({
  modo: "aprovadas",
  estado: "normal",
  planeadoMinutos: 480,
  realizadoMinutos: 540,
  linhas: [],
  ...extra,
});

describe("modoDoDia", () => {
  it("sem interruptor e sempre bruto", () => {
    expect(modoDoDia(null, "2026-10-05")).toBe("bruto");
  });
  it("aprovadas a partir da data (inclusive); antes, bruto", () => {
    expect(modoDoDia("2026-10-05", "2026-10-04")).toBe("bruto");
    expect(modoDoDia("2026-10-05", "2026-10-05")).toBe("aprovadas");
    expect(modoDoDia("2026-10-05", "2026-10-31")).toBe("aprovadas");
  });
});

describe("extraDoDia", () => {
  it("modo bruto: nada a dizer (o excesso em bruto fica com quem chama, como hoje)", () => {
    const r = extraDoDia(dia({ modo: "bruto", linhas: [linha()] }));
    expect(r.modo).toBe("bruto");
    expect(r.contaMin).toBe(0);
    expect(r.pendenteMin).toBe(0);
    expect(r.excessoSemHoraExtraMin).toBe(0);
  });

  it("diaria confirmada dentro do liquido: conta tudo", () => {
    const r = extraDoDia(dia({ linhas: [linha({ minutos: 45 })] }));
    expect(r.contaMin).toBe(45);
    expect(r.porOrigem).toEqual({ diaria: 45, semanal: 0, feriado: 0, descanso: 0 });
    expect(r.cortadoMin).toBe(0);
  });

  it("diaria com corte D2: nao conta mais do que o liquido do dia", () => {
    // 60 min a mais no dia (540 - 480); a deteccao confirmou 120.
    const r = extraDoDia(dia({ linhas: [linha({ minutos: 120 })] }));
    expect(r.contaMin).toBe(60);
    expect(r.porOrigem.diaria).toBe(60);
    expect(r.cortadoMin).toBe(60);
  });

  it("diaria e semanal partilham o mesmo liquido (ordem: diaria, depois semanal)", () => {
    const r = extraDoDia(dia({ linhas: [linha({ minutos: 40 }), linha({ id: "h2", origem: "semanal", minutos: 60 })] }));
    expect(r.porOrigem).toEqual({ diaria: 40, semanal: 20, feriado: 0, descanso: 0 });
    expect(r.contaMin).toBe(60);
    expect(r.cortadoMin).toBe(40);
  });

  it("dia sem excesso (realizado <= planeado): uma diaria confirmada nao conta nada", () => {
    const r = extraDoDia(dia({ realizadoMinutos: 480, linhas: [linha({ minutos: 30 })] }));
    expect(r.contaMin).toBe(0);
    expect(r.cortadoMin).toBe(30);
  });

  it("feriado paga so o confirmado, ate ao realizado", () => {
    const entrada = dia({ estado: "feriado", planeadoMinutos: 0, realizadoMinutos: 300 });
    expect(extraDoDia({ ...entrada, linhas: [linha({ origem: "feriado", minutos: 120 })] }).porOrigem.feriado).toBe(120);
    const cortada = extraDoDia({ ...entrada, linhas: [linha({ origem: "feriado", minutos: 400 })] });
    expect(cortada.porOrigem.feriado).toBe(300);
    expect(cortada.cortadoMin).toBe(100);
    // sem hora extra confirmada o feriado trabalhado nao paga nada
    expect(extraDoDia(entrada).contaMin).toBe(0);
  });

  it("descanso paga so o confirmado, ate ao realizado", () => {
    const entrada = dia({ estado: "descanso", planeadoMinutos: 0, realizadoMinutos: 240 });
    const r = extraDoDia({ ...entrada, linhas: [linha({ origem: "descanso", minutos: 90 })] });
    expect(r.porOrigem).toEqual({ diaria: 0, semanal: 0, feriado: 0, descanso: 90 });
    expect(r.contaMin).toBe(90);
  });

  it("pendente nao conta e fica registada como pendente", () => {
    const r = extraDoDia(dia({ linhas: [linha({ estado: "pendente", minutos: 50 })] }));
    expect(r.contaMin).toBe(0);
    expect(r.pendenteMin).toBe(50);
    expect(r.excessoSemHoraExtraMin).toBe(0);
  });

  it("rejeitada nao conta e nao e excesso por detetar (ja foi decidida)", () => {
    const r = extraDoDia(dia({ linhas: [linha({ estado: "rejeitada", minutos: 50 })] }));
    expect(r.contaMin).toBe(0);
    expect(r.pendenteMin).toBe(0);
    expect(r.excessoSemHoraExtraMin).toBe(0);
  });

  it("banco nao conta: mostra-se a parte; a pendente de banco bloqueia o fecho como na base", () => {
    const r = extraDoDia(dia({ linhas: [linha({ origem: "banco", minutos: 60 }), linha({ id: "h2", origem: "banco", estado: "pendente", minutos: 15 })] }));
    expect(r.contaMin).toBe(0);
    expect(r.pendenteMin).toBe(15);
    expect(r.bancoMin).toBe(75);
  });

  it("dia de ausencia: o confirmado nao se paga e fica como «nao contado»", () => {
    const r = extraDoDia(dia({ estado: "ausencia", linhas: [linha({ minutos: 60 }), linha({ id: "h2", origem: "feriado", minutos: 30 })] }));
    expect(r.contaMin).toBe(0);
    expect(r.porOrigem).toEqual({ diaria: 0, semanal: 0, feriado: 0, descanso: 0 });
    expect(r.cortadoMin).toBe(0);
    expect(r.confirmadoSemContarMin).toBe(90);
    expect(extraDoDia(dia({ linhas: [linha({ minutos: 30 })] })).confirmadoSemContarMin).toBe(0);
  });

  it("o excesso nao aprovado nem detetado e «por detetar»: nao paga (D3)", () => {
    const r = extraDoDia(dia());
    expect(r.contaMin).toBe(0);
    expect(r.excessoSemHoraExtraMin).toBe(60);
  });

  it("excesso dentro da margem de tempo nao e «por detetar»", () => {
    expect(extraDoDia(dia({ realizadoMinutos: 490, margemMin: 15 })).excessoSemHoraExtraMin).toBe(0);
    expect(extraDoDia(dia({ realizadoMinutos: 510, margemMin: 15 })).excessoSemHoraExtraMin).toBe(30);
  });

  it("dia de ausencia nunca tem excesso por detetar", () => {
    expect(extraDoDia(dia({ estado: "ausencia" })).excessoSemHoraExtraMin).toBe(0);
  });

  it("o nocturno so conta o que conta (nunca mais do que contaMin)", () => {
    const r = extraDoDia(dia({ linhas: [linha({ minutos: 120, nocturno_min: 100 })] }));
    expect(r.contaMin).toBe(60);
    expect(r.contaNocturnoMin).toBe(60);
  });
});

describe("pendentesDoPeriodo", () => {
  const horas = (linhas: LinhaHoraExtraPeriodo[], desde: string | null) => ({ aprovacaoDesde: desde, linhas, assinatura: null });
  it("so conta as pendentes em dias de modo aprovadas, de qualquer origem (banco incluido, como a base)", () => {
    const r = pendentesDoPeriodo(
      horas(
        [
          linha({ id: "a", estado: "pendente", data: "2026-10-03", minutos: 10 }),
          linha({ id: "b", estado: "pendente", data: "2026-10-06", minutos: 20 }),
          linha({ id: "c", estado: "pendente", data: "2026-10-07", minutos: 30, origem: "banco" }),
          linha({ id: "d", estado: "confirmada", data: "2026-10-08", minutos: 40 }),
        ],
        "2026-10-05",
      ),
    );
    expect(r).toEqual({ n: 2, minutos: 50 });
  });
  it("sem interruptor nenhuma bloqueia", () => {
    expect(pendentesDoPeriodo(horas([linha({ estado: "pendente" })], null))).toEqual({ n: 0, minutos: 0 });
  });
});

describe("linhasPorDia e fonteDoPeriodo", () => {
  it("agrupa por data", () => {
    const m = linhasPorDia([linha({ id: "a" }), linha({ id: "b" }), linha({ id: "c", data: "2026-10-06" })]);
    expect(m.get("2026-10-05")?.length).toBe(2);
    expect(m.get("2026-10-06")?.length).toBe(1);
  });
  it("bruto, aprovadas ou misto", () => {
    expect(fonteDoPeriodo([])).toBe("bruto");
    expect(fonteDoPeriodo(["bruto", "bruto"])).toBe("bruto");
    expect(fonteDoPeriodo(["aprovadas"])).toBe("aprovadas");
    expect(fonteDoPeriodo(["bruto", "aprovadas"])).toBe("misto");
  });
});
