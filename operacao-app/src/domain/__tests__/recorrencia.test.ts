import { describe, expect, it } from "vitest";
import {
  avisoDaRecorrencia,
  deRRule,
  emPortugues,
  faltaNaRecorrencia,
  paraRRule,
  regraEmPortugues,
  RECORRENCIA_VAZIA,
  PERIODICIDADES,
  comPeriodicidade,
  nomeDaPeriodicidade,
  periodicidadeDe,
  type ChavePeriodicidade,
  type Recorrencia,
} from "../recorrencia";

const r = (p: Partial<Recorrencia> = {}): Recorrencia => ({ ...RECORRENCIA_VAZIA, ...p });

describe("escrever a RRULE", () => {
  it("diária simples não leva INTERVAL a mais", () => {
    expect(paraRRule(r({ frequencia: "DAILY", intervalo: 1 }))).toBe("FREQ=DAILY");
  });

  it("de 2 em 2 dias", () => {
    expect(paraRRule(r({ frequencia: "DAILY", intervalo: 2 }))).toBe("FREQ=DAILY;INTERVAL=2");
  });

  it("semanal com dias", () => {
    expect(paraRRule(r({ frequencia: "WEEKLY", dias: ["TU", "TH"] }))).toBe(
      "FREQ=WEEKLY;BYDAY=TU,TH"
    );
  });

  it("mensal ao dia 15", () => {
    expect(paraRRule(r({ frequencia: "MONTHLY", diaDoMes: 15 }))).toBe(
      "FREQ=MONTHLY;BYMONTHDAY=15"
    );
  });

  it("primeira segunda-feira de cada mês", () => {
    expect(paraRRule(r({ frequencia: "MONTHLY", ordinal: 1, dias: ["MO"], diaDoMes: null }))).toBe(
      "FREQ=MONTHLY;BYDAY=1MO"
    );
  });

  it("última sexta-feira de cada mês", () => {
    expect(paraRRule(r({ frequencia: "MONTHLY", ordinal: -1, dias: ["FR"], diaDoMes: null }))).toBe(
      "FREQ=MONTHLY;BYDAY=-1FR"
    );
  });

  it("o ordinal ganha ao dia do mês, para não sair uma regra com os dois", () => {
    const saida = paraRRule(r({ frequencia: "MONTHLY", ordinal: 2, dias: ["WE"], diaDoMes: 10 }));
    expect(saida).toBe("FREQ=MONTHLY;BYDAY=2WE");
    expect(saida).not.toContain("BYMONTHDAY");
  });
});

describe("ler a RRULE", () => {
  it("dá a volta completa sem perder nada", () => {
    for (const regra of [
      "FREQ=DAILY",
      "FREQ=DAILY;INTERVAL=3",
      "FREQ=WEEKLY;BYDAY=MO,WE,FR",
      "FREQ=MONTHLY;BYMONTHDAY=15",
      "FREQ=MONTHLY;BYDAY=1MO",
      "FREQ=MONTHLY;BYDAY=-1FR",
    ]) {
      const lida = deRRule(regra);
      expect(lida, regra).not.toBeNull();
      expect(paraRRule(lida!), regra).toBe(regra);
    }
  });

  it("aceita minúsculas e espaços, que é como as pessoas colam", () => {
    expect(deRRule("freq=weekly; byday=mo")).toEqual(
      expect.objectContaining({ frequencia: "WEEKLY", dias: ["MO"] })
    );
  });

  it("recusa o que o expansor da base não sabe fazer", () => {
    expect(deRRule("FREQ=WEEKLY;BYSETPOS=1")).toBeNull();
    expect(deRRule("FREQ=MONTHLY;BYWEEKNO=3")).toBeNull();
    expect(deRRule("FREQ=HOURLY")).toBeNull();
  });

  it("recusa dois ordinais, que a base não expande", () => {
    expect(deRRule("FREQ=MONTHLY;BYDAY=1MO,3WE")).toBeNull();
  });

  it("recusa metade com ordinal e metade sem", () => {
    expect(deRRule("FREQ=MONTHLY;BYDAY=1MO,WE")).toBeNull();
  });

  it("recusa vários dias do mês", () => {
    expect(deRRule("FREQ=MONTHLY;BYMONTHDAY=1,15")).toBeNull();
  });

  it("recusa um dia do mês impossível", () => {
    expect(deRRule("FREQ=MONTHLY;BYMONTHDAY=45")).toBeNull();
    expect(deRRule("FREQ=MONTHLY;BYMONTHDAY=0")).toBeNull();
  });

  it("recusa um dia da semana inventado", () => {
    expect(deRRule("FREQ=WEEKLY;BYDAY=XX")).toBeNull();
  });

  it("sem regra, não há regra", () => {
    expect(deRRule(null)).toBeNull();
    expect(deRRule("")).toBeNull();
  });
});

describe("dizer em voz alta", () => {
  it("diária", () => {
    expect(emPortugues(r({ frequencia: "DAILY" }))).toBe("Todos os dias");
    expect(emPortugues(r({ frequencia: "DAILY", intervalo: 3 }))).toBe("De 3 em 3 dias");
  });

  it("semanal, com 'e' antes do último dia", () => {
    expect(emPortugues(r({ frequencia: "WEEKLY", dias: ["TU", "TH"] }))).toBe(
      "Todas as semanas, à terça-feira e quinta-feira"
    );
  });

  it("mensal ao dia 15", () => {
    expect(emPortugues(r({ frequencia: "MONTHLY", diaDoMes: 15 }))).toBe(
      "Todos os meses, no dia 15"
    );
  });

  it("primeira segunda-feira", () => {
    expect(
      emPortugues(r({ frequencia: "MONTHLY", ordinal: 1, dias: ["MO"], diaDoMes: null }))
    ).toBe("Todos os meses, na primeira segunda-feira");
  });

  it("última sexta-feira", () => {
    expect(
      emPortugues(r({ frequencia: "MONTHLY", ordinal: -1, dias: ["FR"], diaDoMes: null }))
    ).toBe("Todos os meses, na última sexta-feira");
  });

  it("de 3 em 3 meses", () => {
    expect(emPortugues(r({ frequencia: "MONTHLY", intervalo: 3, diaDoMes: 1 }))).toBe(
      "De 3 em 3 meses, no dia 1"
    );
  });

  it("uma regra que não se percebe di-lo, em vez de inventar", () => {
    expect(regraEmPortugues("FREQ=WEEKLY;BYSETPOS=1")).toBe("Regra não reconhecida");
  });

  it("a partir da regra guardada", () => {
    expect(regraEmPortugues("FREQ=MONTHLY;BYDAY=1MO")).toBe(
      "Todos os meses, na primeira segunda-feira"
    );
  });
});

describe("o que falta, e o que convém saber", () => {
  it("semanal sem dias não se grava", () => {
    expect(faltaNaRecorrencia(r({ frequencia: "WEEKLY", dias: [] }))).toContain("dia da semana");
  });

  it("ordinal sem dia não se grava", () => {
    expect(
      faltaNaRecorrencia(r({ frequencia: "MONTHLY", ordinal: 1, dias: [], diaDoMes: null }))
    ).toContain("dia da semana");
  });

  it("dia do mês fora do intervalo não se grava", () => {
    expect(faltaNaRecorrencia(r({ frequencia: "MONTHLY", diaDoMes: 40 }))).toContain("entre 1 e 31");
  });

  it("uma regra completa não tem falhas", () => {
    expect(faltaNaRecorrencia(r({ frequencia: "MONTHLY", diaDoMes: 15 }))).toBeNull();
    expect(faltaNaRecorrencia(r({ frequencia: "WEEKLY", dias: ["MO"] }))).toBeNull();
  });

  it("avisa que o dia 31 salta meses, porque quem o escolhe não costuma saber", () => {
    expect(avisoDaRecorrencia(r({ frequencia: "MONTHLY", diaDoMes: 31 }))).toContain("não é gerada");
    expect(avisoDaRecorrencia(r({ frequencia: "MONTHLY", diaDoMes: 29 }))).toContain("não é gerada");
  });

  it("e não avisa quando não há nada a avisar", () => {
    expect(avisoDaRecorrencia(r({ frequencia: "MONTHLY", diaDoMes: 15 }))).toBeNull();
    expect(avisoDaRecorrencia(r({ frequencia: "WEEKLY", dias: ["MO"] }))).toBeNull();
  });
});

describe("periodicidades", () => {
  const casos: Array<[ChavePeriodicidade, string]> = [
    ["diaria", "FREQ=DAILY"],
    ["semanal", "FREQ=WEEKLY;BYDAY=MO"],
    ["quinzenal", "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO"],
    ["mensal", "FREQ=MONTHLY;BYMONTHDAY=1"],
    ["bimestral", "FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=1"],
    ["trimestral", "FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1"],
    ["quadrimestral", "FREQ=MONTHLY;INTERVAL=4;BYMONTHDAY=1"],
    ["semestral", "FREQ=MONTHLY;INTERVAL=6;BYMONTHDAY=1"],
    ["anual", "FREQ=YEARLY"],
    ["bienal", "FREQ=YEARLY;INTERVAL=2"],
    ["trienal", "FREQ=YEARLY;INTERVAL=3"],
    ["quinquenal", "FREQ=YEARLY;INTERVAL=5"],
  ];

  it("a lista tem as pedidas, sem repetidas", () => {
    const chaves = PERIODICIDADES.map((p) => p.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
    for (const c of ["diaria", "semanal", "quinzenal", "mensal", "bimestral", "trimestral",
      "quadrimestral", "semestral", "anual", "bienal"]) {
      expect(chaves).toContain(c);
    }
    const pares = PERIODICIDADES.map((p) => `${p.frequencia}/${p.intervalo}`);
    expect(new Set(pares).size).toBe(pares.length);
  });

  it.each(casos)("%s → %s, e volta a ler-se como a mesma", (chave, rrule) => {
    let rec = comPeriodicidade(RECORRENCIA_VAZIA, chave);
    if (rec.frequencia === "WEEKLY") rec = { ...rec, dias: ["MO"] };
    expect(faltaNaRecorrencia(rec)).toBeNull();
    expect(paraRRule(rec)).toBe(rrule);
    const lida = deRRule(rrule)!;
    expect(periodicidadeDe(lida)).toBe(chave);
  });

  it("semanal sem dia não se grava; anual sem dia sim (na data de início)", () => {
    expect(faltaNaRecorrencia(comPeriodicidade(RECORRENCIA_VAZIA, "quinzenal"))).toContain(
      "dia da semana"
    );
    const bienal = comPeriodicidade(RECORRENCIA_VAZIA, "bienal");
    expect(faltaNaRecorrencia(bienal)).toBeNull();
    expect(emPortugues(bienal)).toBe("De 2 em 2 anos, na data de início");
    expect(emPortugues(comPeriodicidade(RECORRENCIA_VAZIA, "anual"))).toBe(
      "Todos os anos, na data de início"
    );
  });

  it("mudar entre mensais mantém o dia; vir de semanal põe dia 1", () => {
    const mensal = { ...RECORRENCIA_VAZIA, diaDoMes: 15 };
    expect(comPeriodicidade(mensal, "trimestral")).toMatchObject({
      frequencia: "MONTHLY",
      intervalo: 3,
      diaDoMes: 15,
    });
    const semanal = { ...RECORRENCIA_VAZIA, frequencia: "WEEKLY" as const, dias: ["TU"], diaDoMes: null };
    expect(comPeriodicidade(semanal, "quinzenal").dias).toEqual(["TU"]);
    expect(comPeriodicidade(semanal, "semestral")).toMatchObject({ diaDoMes: 1, dias: [] });
  });

  it("uma regra antiga fora da lista é reconhecida e nomeada tal como é", () => {
    const r = deRRule("FREQ=DAILY;INTERVAL=3")!;
    expect(periodicidadeDe(r)).toBeNull();
    expect(nomeDaPeriodicidade(r)).toBe("De 3 em 3 dias");
    expect(nomeDaPeriodicidade(deRRule("FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1")!)).toBe(
      "Trimestral (de 3 em 3 meses)"
    );
  });

  it("regras anuais antigas com dia do mês continuam legíveis", () => {
    expect(regraEmPortugues("FREQ=YEARLY;BYMONTHDAY=15")).toBe("Todos os anos, no dia 15 do mês de início");
  });
});
