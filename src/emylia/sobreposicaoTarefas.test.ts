// 10/11: duas tarefas de meio dia seguidas do mesmo técnico não se sobrepõem (o plano arredonda aos dias inteiros; antes davam
// «noutra tarefa desta obra» e o dia sugerido nunca aparecia).
import { describe, expect, it } from "vitest";
import { extensaoTarefa, motivoOcupado, obraQueOcupa, ocupacaoDosTecnicos, resolverConflitos, sobrepostas } from "./preparacaoObra";
import { TECS, acoes, seed, type Plano } from "./motor";

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
  it("mudada de dia, leva a hora do início com ela (as duas de meio dia continuam sem se sobrepor)", () => {
    expect(extensaoTarefa({ dia: 3, dur: 1, ini: 0.5, dias: 0.5 })).toEqual([3.5, 4]);
    expect(sobrepostas({ dia: 3, dur: 1, ini: 0, dias: 0.5 }, { dia: 3, dur: 1, ini: 0.5, dias: 0.5 })).toBe(false);
    expect(sobrepostas({ dia: 5, dur: 3, ini: 1, dias: 2.5 }, { dia: 7, dur: 1, ini: 3.5, dias: 0.5 })).toBe(false);
  });
  it("com a duração mudada à mão (os dias inteiros já não batem com a real), conta o dia inteiro", () => {
    expect(extensaoTarefa({ dia: 3, dur: 2, ini: 0.5, dias: 0.5 })).toEqual([3, 5]);
    expect(sobrepostas({ dia: 3, dur: 2, ini: 0.5, dias: 0.5 }, { dia: 4, dur: 1 })).toBe(true);
  });
  it("sem o real, os dias inteiros", () => {
    expect(sobrepostas({ dia: 0, dur: 1 }, { dia: 1, dur: 1 })).toBe(false);
    expect(sobrepostas({ dia: 0, dur: 2 }, { dia: 1, dur: 1 })).toBe(true);
  });
});

describe("adiar até estar livre (10/11)", () => {
  it("com o técnico noutra obra, a tarefa passa para o primeiro dia em que ele está livre", () => {
    const S = seed();
    const [d1, d2] = S.deals.filter((x) => x.obra);
    const T = TECS[0].id, inicio = "2027-03-01";
    d1.obra.plano = { tasks: [{ nome: "Outra obra", svcs: [], dia: 0, dur: 3, sk: TECS[0].sk, h: 24, tec: T }], estado: "aprovado", dia: 0, origem: "orcamento", inicio };
    d2.obra.plano = { tasks: [{ nome: "Canalização", svcs: [], dia: 0, dur: 1, sk: TECS[0].sk, h: 8, tec: T }], estado: "por aprovar", dia: 0, origem: "orcamento", inicio };
    S.role = "operacoes";
    acoes(S, () => {}, (fn) => fn()).adiar(d2.id, 0);
    const t = d2.obra.plano.tasks[0];
    expect(t.dia).toBeGreaterThanOrEqual(3);
    expect(motivoOcupado(T, t, d2.obra.plano, ocupacaoDosTecnicos(S, d2.id))).toBeNull();
  });
});

describe("a obra onde o técnico está (10/11)", () => {
  it("diz qual é a outra obra nos dias da tarefa, e nenhuma quando está livre", () => {
    const S = seed();
    const [d1, d2] = S.deals.filter((x) => x.obra);
    const T = TECS[0].id, inicio = "2027-03-01";
    d1.obra.plano = { tasks: [{ nome: "Outra obra", svcs: [], dia: 0, dur: 3, sk: TECS[0].sk, h: 24, tec: T }], estado: "aprovado", dia: 0, origem: "orcamento", inicio };
    d2.obra.plano = { tasks: [{ nome: "Canalização", svcs: [], dia: 1, dur: 1, sk: TECS[0].sk, h: 8, tec: T }], estado: "por aprovar", dia: 0, origem: "orcamento", inicio };
    expect(obraQueOcupa(S, T, d2.obra.plano.tasks[0], d2.obra.plano, d2.id)?.id).toBe(d1.id);
    expect(obraQueOcupa(S, T, { dia: 5, dur: 1 }, d2.obra.plano, d2.id)).toBeNull();
  });
});

describe("adiar e repor (10/11)", () => {
  it("o «Repor» desfaz o adiamento; adiar um plano aprovado volta a por aprovar", () => {
    const S = seed();
    const [d1, d2] = S.deals.filter((x) => x.obra);
    const T = TECS[0].id, inicio = "2027-03-01";
    d1.obra.plano = { tasks: [{ nome: "Outra obra", svcs: [], dia: 0, dur: 3, sk: TECS[0].sk, h: 24, tec: T }], estado: "aprovado", dia: 0, origem: "orcamento", inicio };
    d2.obra.plano = { tasks: [{ nome: "Canalização", svcs: [], dia: 0, dur: 1, sk: TECS[0].sk, h: 8, tec: T }], estado: "aprovado", dia: 0, origem: "orcamento", inicio };
    S.role = "operacoes";
    const A = acoes(S, () => {}, (fn) => fn());
    A.adiar(d2.id, 0);
    expect(d2.obra.plano.estado).toBe("por aprovar");
    expect(d2.obra.plano.tasks[0].dia).toBeGreaterThanOrEqual(3);
    A.reporPlano(d2.id);
    expect(d2.obra.plano.tasks[0].dia).toBe(0);
  });
});

describe("o plano sem conflitos (10/11)", () => {
  const montar = () => {
    const S = seed();
    const [d1, d2] = S.deals.filter((x) => x.obra);
    const T = TECS[0].id, U = TECS[1].id, inicio = "2027-03-01";
    d1.obra.plano = { tasks: [{ nome: "Outra obra", svcs: [], dia: 0, dur: 3, sk: TECS[0].sk, h: 24, tec: T }], estado: "aprovado", dia: 0, origem: "orcamento", inicio };
    d2.obra.plano = { tasks: [
      { nome: "Canalização", svcs: [], dia: 0, dur: 1, sk: TECS[0].sk, h: 8, tec: T },
      { nome: "Pintura", svcs: [], dia: 1, dur: 1, sk: TECS[1].sk, h: 8, tec: U },
    ], estado: "por aprovar", dia: 0, origem: "orcamento", inicio };
    return { S, d2, T };
  };
  it("adia a tarefa até o técnico estar livre, e as seguintes com ela", () => {
    const { S, d2, T } = montar();
    const feitas = resolverConflitos(d2.obra.plano!, ocupacaoDosTecnicos(S, d2.id));
    const [c, p] = d2.obra.plano!.tasks;
    expect(feitas[0]).toMatchObject({ nome: "Canalização" });
    expect(c.dia).toBeGreaterThanOrEqual(3);
    expect(motivoOcupado(T, c, d2.obra.plano!, ocupacaoDosTecnicos(S, d2.id))).toBeNull();
    expect(p.dia - c.dia).toBe(1); // a ordem fica
  });
  it("a escolhida à mão fica como está", () => {
    const { S, d2 } = montar();
    const feitas = resolverConflitos(d2.obra.plano!, ocupacaoDosTecnicos(S, d2.id), { tecnicos: { "0:Canalização": TECS[0].id } });
    expect(feitas).toEqual([]);
    expect(d2.obra.plano!.tasks[0].dia).toBe(0);
  });
  it("A.resolverConflitos no Estúdio: adia, guarda o original (Repor) e o plano aprovado volta a por aprovar", () => {
    const { S, d2 } = montar();
    d2.obra.plano!.estado = "aprovado";
    S.role = "operacoes";
    const A = acoes(S, () => {}, (fn) => fn());
    A.resolverConflitos(d2.id);
    expect(d2.obra.plano!.tasks[0].dia).toBeGreaterThanOrEqual(3);
    expect(d2.obra.plano!.estado).toBe("por aprovar");
    A.reporPlano(d2.id);
    expect(d2.obra.plano!.tasks[0].dia).toBe(0);
  });
});

// 11/11 (Rúben: «obra de 16 a 29 dez e não aparecia nada riscado»): aprovar grava o início no negócio (f.inicio), não no plano
describe("a ocupação das obras aprovadas sem data no plano (11/11)", () => {
  it("a outra obra conta pelo f.inicio; o plano aberto sem data começa no primeiro início possível", () => {
    const S = seed();
    const [d1, d2] = S.deals.filter((x) => x.obra);
    const T = TECS[0].id;
    d1.f.inicio = "2027-03-01";
    d1.obra.plano = { tasks: [{ nome: "Outra", svcs: [], dia: 0, dur: 3, sk: TECS[0].sk, h: 24, tec: T }], estado: "aprovado", dia: 0, origem: "orcamento" } as Plano;
    expect([...(ocupacaoDosTecnicos(S, d2.id).get(T) ?? [])]).toEqual(["2027-03-01", "2027-03-02", "2027-03-03"]);
    d2.obra.plano = { tasks: [{ nome: "Aqui", svcs: [], dia: 1, dur: 1, sk: TECS[0].sk, h: 8, tec: T }], estado: "por aprovar", dia: 0, origem: "orcamento", inicio: "2027-03-01" } as Plano;
    expect(obraQueOcupa(S, T, d2.obra.plano.tasks[0], d2.obra.plano, d2.id)?.id).toBe(d1.id);
    expect(motivoOcupado(T, d2.obra.plano.tasks[0], d2.obra.plano, ocupacaoDosTecnicos(S, d2.id))).toBe("noutra obra");
  });
});
