// 10/11: duas tarefas de meio dia seguidas do mesmo técnico não se sobrepõem (o plano arredonda aos dias inteiros; antes davam
// «noutra tarefa desta obra» e o dia sugerido nunca aparecia).
import { describe, expect, it } from "vitest";
import { extensaoTarefa, motivoOcupado, sobrepostas } from "./preparacaoObra";
import { TECS, type Plano } from "./motor";

const plano: Plano = { tasks: [], estado: "por aprovar", dia: 0 };
const tec = TECS[0].id;

describe("sobreposição das tarefas do plano", () => {
  it("as que só se tocam a meio do dia não se sobrepõem", () => {
    const a = { dia: 0, dur: 1, ini: 0, dias: 0.5, tec }, b = { dia: 0, dur: 1, ini: 0.5, dias: 0.5, tec };
    expect(sobrepostas(a, b)).toBe(false);
    expect(motivoOcupado(tec, b, plano, new Map(), [a])).toBeNull();
  });
  it("as que se cruzam a meio sobrepõem-se", () => {
    const a = { dia: 0, dur: 1, ini: 0, dias: 0.75, tec }, b = { dia: 0, dur: 1, ini: 0.5, dias: 0.5, tec };
    expect(motivoOcupado(tec, b, plano, new Map(), [a])).toBe("noutra tarefa desta obra");
  });
  it("mudada à mão (os dias inteiros já não batem com o real), conta o dia inteiro", () => {
    expect(extensaoTarefa({ dia: 3, dur: 1, ini: 0.5, dias: 0.5 })).toEqual([3, 4]);
    expect(sobrepostas({ dia: 3, dur: 1, ini: 0.5, dias: 0.5 }, { dia: 3, dur: 2 })).toBe(true);
  });
  it("sem o real, os dias inteiros", () => {
    expect(sobrepostas({ dia: 0, dur: 1 }, { dia: 1, dur: 1 })).toBe(false);
    expect(sobrepostas({ dia: 0, dur: 2 }, { dia: 1, dur: 1 })).toBe(true);
  });
});
