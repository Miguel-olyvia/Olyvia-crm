import { describe, expect, it } from "vitest";
import {
  diaInicioEmVigor,
  diasDeCalendarioEntre,
  diasDoPeriodo,
  fimDoPeriodoDoDia,
  hojeEmLisboa,
  intervaloEfectivo,
  formatarIntervaloPeriodo,
  nomeDaFolha,
  periodoDaFolha,
  periodoDaFolhaPorRegras,
  periodoDoDia,
} from "@/lib/hr/periodoFolha";

describe("periodoDaFolha: o intervalo de uma folha, a partir do mes do fecho e do dia de inicio", () => {
  it("dia de inicio 1 e o mes de calendario (como antes)", () => {
    expect(periodoDaFolha(2026, 10)).toEqual({ de: "2026-10-01", ate: "2026-10-31" });
    expect(periodoDaFolha(2026, 10, 1)).toEqual({ de: "2026-10-01", ate: "2026-10-31" });
  });

  it("dia 22: a folha de novembro vai de 22/10 a 21/11", () => {
    expect(periodoDaFolha(2026, 11, 22)).toEqual({ de: "2026-10-22", ate: "2026-11-21" });
  });

  it("dia 28: termina a 27 do mes do fecho", () => {
    expect(periodoDaFolha(2026, 5, 28)).toEqual({ de: "2026-04-28", ate: "2026-05-27" });
  });

  it("fevereiro: bissexto e nao bissexto, com e sem dia de inicio", () => {
    expect(periodoDaFolha(2024, 2)).toEqual({ de: "2024-02-01", ate: "2024-02-29" });
    expect(periodoDaFolha(2025, 2)).toEqual({ de: "2025-02-01", ate: "2025-02-28" });
    expect(periodoDaFolha(2025, 2, 22)).toEqual({ de: "2025-01-22", ate: "2025-02-21" });
    expect(periodoDaFolha(2025, 3, 28)).toEqual({ de: "2025-02-28", ate: "2025-03-27" });
  });

  it("mudanca de ano: a folha de janeiro comeca em dezembro", () => {
    expect(periodoDaFolha(2027, 1, 22)).toEqual({ de: "2026-12-22", ate: "2027-01-21" });
    expect(periodoDaFolha(2026, 12, 1)).toEqual({ de: "2026-12-01", ate: "2026-12-31" });
  });
});

describe("regras versionadas e periodo de transicao", () => {
  const regras = [{ dia_inicio: 22, valido_de: "2026-11-01" }];

  it("sem regra o dia de inicio e 1; com regra vale a partir do mes valido_de", () => {
    expect(diaInicioEmVigor([], 2026, 11)).toBe(1);
    expect(diaInicioEmVigor(regras, 2026, 10)).toBe(1);
    expect(diaInicioEmVigor(regras, 2026, 11)).toBe(22);
    expect(diaInicioEmVigor(regras, 2027, 3)).toBe(22);
  });

  it("a primeira folha depois da mudanca e de transicao: continua no fim da anterior, sem buracos", () => {
    // Outubro ainda vai de 1 a 31; novembro (dia 22) comeca a 1/11 e acaba a 21/11.
    expect(periodoDaFolhaPorRegras(2026, 10, regras)).toEqual({ de: "2026-10-01", ate: "2026-10-31" });
    expect(periodoDaFolhaPorRegras(2026, 11, regras)).toEqual({ de: "2026-11-01", ate: "2026-11-21" });
    expect(periodoDaFolhaPorRegras(2026, 12, regras)).toEqual({ de: "2026-11-22", ate: "2026-12-21" });
  });

  it("janeiro olha para dezembro do ano anterior", () => {
    expect(periodoDaFolhaPorRegras(2027, 1, regras)).toEqual({ de: "2026-12-22", ate: "2027-01-21" });
  });

  it("de volta ao dia 1 tambem da um periodo de transicao mais comprido", () => {
    const voltaA1 = [...regras, { dia_inicio: 1, valido_de: "2027-03-01" }];
    expect(periodoDaFolhaPorRegras(2027, 3, voltaA1)).toEqual({ de: "2027-02-22", ate: "2027-03-31" });
  });

  it("o periodo que contem um dia e o do mes do fecho", () => {
    expect(periodoDoDia("2026-12-05", regras)).toMatchObject({ ano: 2026, mes: 12, de: "2026-11-22", ate: "2026-12-21" });
    expect(periodoDoDia("2026-12-22", regras)).toMatchObject({ ano: 2027, mes: 1, ate: "2027-01-21" });
    expect(periodoDoDia("2026-10-15", [])).toMatchObject({ ano: 2026, mes: 10, ate: "2026-10-31" });
  });
});

describe("prazo de justificar = o fim do periodo", () => {
  it("o fim do periodo que contem o dia, e quantos dias de calendario faltam", () => {
    const regras = [{ dia_inicio: 22, valido_de: "2026-01-01" }];
    expect(fimDoPeriodoDoDia("2026-10-22", regras)).toBe("2026-11-21");
    expect(fimDoPeriodoDoDia("2026-11-21", regras)).toBe("2026-11-21");
    expect(fimDoPeriodoDoDia("2026-11-22", regras)).toBe("2026-12-21");
    expect(fimDoPeriodoDoDia("2026-11-10", [])).toBe("2026-11-30");
    expect(diasDeCalendarioEntre("2026-11-18", "2026-11-21")).toBe(3);
    expect(diasDeCalendarioEntre("2026-11-21", "2026-11-18")).toBe(0);
  });
});

describe("formatarIntervaloPeriodo e nomeDaFolha (pela lingua, via Intl)", () => {
  it("curto: dia e mes de cada ponta (o formato curto e o da lingua, em pt-PT 22/10), com a palavra «a» que quem chama passa", () => {
    const texto = formatarIntervaloPeriodo("2026-10-22", "2026-11-21", "pt-PT", "a");
    expect(texto).toMatch(/^22\D+10 a 21\D+11$/);
  });

  it("por extenso: «22 de outubro a 21 de novembro» em portugues e a lingua muda o mes", () => {
    expect(formatarIntervaloPeriodo("2026-10-22", "2026-11-21", "pt-PT", "a", "long")).toBe("22 de outubro a 21 de novembro");
    expect(formatarIntervaloPeriodo("2026-10-22", "2026-11-21", "en", "to", "long")).toMatch(/October 22 to November 21|22 October to 21 November/);
  });

  it("o nome da folha e o mes do fecho, na lingua pedida", () => {
    expect(nomeDaFolha(2026, 11, "pt-PT")).toBe("novembro de 2026");
    expect(nomeDaFolha(2026, 11, "en")).toBe("November 2026");
  });
});
describe("regras substituidas e duas regras para o mesmo mes", () => {
  it("a substituida nao conta, venha antes ou depois na lista: vale a nao substituida", () => {
    const morta = { dia_inicio: 22, valido_de: "2026-11-01", substituida_em: "2026-10-05T10:00:00Z" };
    const viva = { dia_inicio: 5, valido_de: "2026-11-01", substituida_em: null };
    expect(diaInicioEmVigor([morta, viva], 2026, 11)).toBe(5);
    expect(diaInicioEmVigor([viva, morta], 2026, 11)).toBe(5);
    expect(periodoDaFolhaPorRegras(2026, 11, [viva, morta]).ate).toBe("2026-11-04");
  });

  it("uma regra substituida sozinha e como se nao existisse (dia 1)", () => {
    expect(diaInicioEmVigor([{ dia_inicio: 22, valido_de: "2026-11-01", substituida_em: "2026-10-05T10:00:00Z" }], 2026, 11)).toBe(1);
  });

  it("a regra de um mes anterior continua a valer quando a do mes foi substituida e ja nao ha outra", () => {
    const regras = [
      { dia_inicio: 22, valido_de: "2026-01-01" },
      { dia_inicio: 5, valido_de: "2026-11-01", substituida_em: "2026-10-05T10:00:00Z" },
    ];
    expect(diaInicioEmVigor(regras, 2026, 11)).toBe(22);
  });
});

describe("transicoes entre dias de inicio (a mesma conta de rpc_hr_processamento_periodo_abrir)", () => {
  const dias = (i: { de: string; ate: string }) => diasDoPeriodo(i.de, i.ate).length;
  const regras = (antes: number, depois: number, validoDe: string) => [
    { dia_inicio: antes, valido_de: "2026-01-01" },
    { dia_inicio: depois, valido_de: validoDe },
  ];

  it("22 -> 5 em novembro: a folha de transicao vai de 22/10 a 04/11 (14 dias)", () => {
    const i = periodoDaFolhaPorRegras(2026, 11, regras(22, 5, "2026-11-01"));
    expect(i).toEqual({ de: "2026-10-22", ate: "2026-11-04" });
    expect(dias(i)).toBe(14);
  });

  it("28 -> 2 em janeiro: de 28/12 a 01/01 (5 dias)", () => {
    const i = periodoDaFolhaPorRegras(2027, 1, regras(28, 2, "2027-01-01"));
    expect(i).toEqual({ de: "2026-12-28", ate: "2027-01-01" });
    expect(dias(i)).toBe(5);
  });

  it("2 -> 28 de dezembro para janeiro: de 02/12 a 27/01 (57 dias, dentro do limite de 62)", () => {
    const i = periodoDaFolhaPorRegras(2027, 1, regras(2, 28, "2027-01-01"));
    expect(i).toEqual({ de: "2026-12-02", ate: "2027-01-27" });
    expect(dias(i)).toBe(57);
  });

  it("depois da transicao a folha seguinte e normal e comeca no dia a seguir ao fim da anterior", () => {
    const r = regras(2, 28, "2027-01-01");
    const jan = periodoDaFolhaPorRegras(2027, 1, r);
    const fev = periodoDaFolhaPorRegras(2027, 2, r);
    expect(fev).toEqual({ de: "2027-01-28", ate: "2027-02-27" });
    expect(diasDeCalendarioEntre(jan.de, fev.ate) + 1).toBe(dias(jan) + dias(fev)); // sem buracos nem repetidos
  });

  it("fevereiro com regra: inicio a 28 vai de 28/01 a 27/02, bissexto ou nao; inicio a 1 acaba a 28 ou 29", () => {
    const r28 = [{ dia_inicio: 28, valido_de: "2000-01-01" }];
    expect(periodoDaFolhaPorRegras(2027, 2, r28)).toEqual({ de: "2027-01-28", ate: "2027-02-27" });
    expect(periodoDaFolhaPorRegras(2028, 2, r28)).toEqual({ de: "2028-01-28", ate: "2028-02-27" });
    expect(periodoDaFolhaPorRegras(2028, 2, [])).toEqual({ de: "2028-02-01", ate: "2028-02-29" });
    expect(periodoDaFolhaPorRegras(2027, 2, [])).toEqual({ de: "2027-02-01", ate: "2027-02-28" });
  });

  it("de volta ao dia 1 em marco: a folha de marco comeca logo a seguir ao fim de fevereiro (regra 22), sem buracos", () => {
    const i = periodoDaFolhaPorRegras(2027, 3, regras(22, 1, "2027-03-01"));
    expect(i).toEqual({ de: "2027-02-22", ate: "2027-03-31" });
  });
});

describe("intervaloEfectivo e hojeEmLisboa", () => {
  const r22 = [{ dia_inicio: 22, valido_de: "2000-01-01" }];

  it("um periodo com datas manda as suas datas, nao estimado", () => {
    expect(intervaloEfectivo({ data_inicio: "2026-10-27", data_fim: "2026-11-21" }, 2026, 11, r22)).toEqual({ de: "2026-10-27", ate: "2026-11-21", estimado: false });
  });

  it("sem periodo calcula-se pelas regras (e nao e uma estimativa: e o que vai abrir)", () => {
    expect(intervaloEfectivo(null, 2026, 11, r22)).toEqual({ de: "2026-10-22", ate: "2026-11-21", estimado: false });
  });

  it("periodo sem datas com regra diferente de 1 fica marcado como estimado, para o ecra nao o dar por certo", () => {
    expect(intervaloEfectivo({ data_inicio: null, data_fim: null }, 2026, 11, r22).estimado).toBe(true);
    expect(intervaloEfectivo({}, 2026, 11, []).estimado).toBe(false);
  });

  it("hoje e o de Lisboa, nao o do navegador (verao: 23:30 UTC ja e o dia seguinte)", () => {
    expect(hojeEmLisboa(new Date("2026-11-05T23:30:00Z"))).toBe("2026-11-05");
    expect(hojeEmLisboa(new Date("2026-07-05T23:30:00Z"))).toBe("2026-07-06");
  });
});