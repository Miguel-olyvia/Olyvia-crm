// 12/11: a agenda real dos técnicos (rh_agenda_tecnicos e visitas do CRM) no plano da obra, com limites (a organização de teste tem milhares
// de tarefas), e o plano por aprovar refeito com a agenda de hoje.
import { afterEach, describe, expect, it } from "vitest";
import { MAX_COMPROMISSOS, aplicarCompromissos, tarefasDaAgendaRh, visitasDosTecnicos } from "./real/agendaReal";
import { definirAgendaExtra, lerAgendaExtra, planoComAgendaDeHoje } from "./preparacaoObra";
import { definirVisitasCrm } from "./equipa/visitasCrm";
import { TECS, acoes, seed, type Plano } from "./motor";
import type { TarefaObraRpc } from "@/lib/agenda/obraTarefas";

afterEach(() => { definirAgendaExtra(null); definirVisitasCrm(null); });

const tarefa = (x: Partial<TarefaObraRpc>): TarefaObraRpc => ({
  tarefa_id: "t", nome: "Canalização", oficio: null, inicio: "2027-03-05", fim: "2027-03-08", estado: "por_fazer", horas_dia: 6,
  obra_id: null, obra_codigo: "OB-1", obra_titulo: "Obra X", morada: null, negocio_numero: null, ...x,
});

describe("a agenda real lida da base", () => {
  it("as tarefas por fazer, uma por dia útil, com as horas do dia; as feitas e as de negócios carregados não entram", () => {
    const L = tarefasDaAgendaRh([{ pessoa_id: "p1", nome: "Diogo", tarefas: [
      tarefa({ negocio_numero: 1050 }),
      tarefa({ tarefa_id: "t2", estado: "validada" }),
      tarefa({ tarefa_id: "t3", negocio_numero: 1049 }),
    ] }], "2027-03-01", "2027-03-31", new Set([1049]));
    // sexta e segunda (o fim de semana não conta)
    expect(L.map((x) => [x.data, x.h, x.negocio])).toEqual([["2027-03-05", 6, 1050], ["2027-03-08", 6, 1050]]);
  });
  it("milhares de tarefas não passam do máximo", () => {
    const muitas = Array.from({ length: 5000 }, (_, k) => tarefa({ tarefa_id: `t${k}`, inicio: "2027-03-01", fim: "2027-06-30" }));
    expect(tarefasDaAgendaRh([{ pessoa_id: "p1", nome: "Diogo", tarefas: muitas }], "2027-03-01", "2028-03-01").length).toBe(MAX_COMPROMISSOS);
  });
  it("as visitas do CRM em que vai um técnico (pelo nome do recurso)", () => {
    const L = visitasDosTecnicos([
      { nome: "Diogo", papel: "comercial", data: "2027-03-02", hora: "10:00", horas: 1.5, titulo: "Visita · Ana", sub: "" },
      { nome: "Helena Brandão", papel: "comercial", data: "2027-03-02", horas: 1.5, titulo: "Visita · Rui", sub: "" },
      { nome: "Diogo", papel: "comercial", data: "2027-03-03", horas: 1.5, titulo: "Feita", sub: "", feito: true },
    ], [{ id: "p1", n: "Diogo Pereira" }]);
    expect(L).toEqual([{ tec: "p1", data: "2027-03-02", h: 1.5, nome: "Visita · Ana", tarefa: "Visita às 10:00" }]);
  });
  it("aplicar: só de hoje em diante (as visitas passadas não contam)", () => {
    definirVisitasCrm([
      { nome: "Diogo", papel: "comercial", data: "2027-03-02", horas: 2, titulo: "Futura", sub: "" },
      { nome: "Diogo", papel: "comercial", data: "2027-02-01", horas: 2, titulo: "Passada", sub: "" },
    ]);
    expect(aplicarCompromissos([{ id: "p1", n: "Diogo Pereira" }], new Set(), new Date(2027, 1, 15))).toBe(1);
    expect(lerAgendaExtra().map((x) => x.nome)).toEqual(["Futura"]);
  });
});

describe("refazer o plano por aprovar com a agenda de hoje", () => {
  it("um plano empurrado semanas volta ao que a agenda deixa; o mexido à mão não se refaz", () => {
    const S = seed();
    const d = S.deals.find((x) => x.id === 1031)!;
    const A = acoes(S, () => {}, (fn) => fn());
    A.aceitar(d.id);
    const p = d.obra.plano!;
    p.inicio = "2027-03-01";
    const normal = p.tasks.reduce((a, t) => Math.max(a, t.dia + t.dur), 0);
    // empurrado 20 dias (como a agenda antiga fazia)
    for (const t of p.tasks) t.dia += 20;
    const r = planoComAgendaDeHoje(d, S);
    expect(r?.antes).toBe(normal + 20);
    expect(r!.dias).toBeLessThan(r!.antes);
    S.role = "operacoes";
    A.refazerPlanoComAgenda(d.id);
    expect(d.obra.plano!.tasks.reduce((a, t) => Math.max(a, t.dia + t.dur), 0)).toBe(r!.dias);
    expect(d.obra.plano!.inicio).toBe("2027-03-01");
    expect(planoComAgendaDeHoje(d, S)).toBeNull();
    // aprovado, ou com tarefas juntadas, não
    d.obra.plano!.estado = "aprovado";
    expect(planoComAgendaDeHoje(d, S)).toBeNull();
    d.obra.plano = { ...(d.obra.plano as Plano), estado: "por aprovar", tasks: [...d.obra.plano!.tasks, { nome: "Nova", svcs: [], dia: 40, dur: 1, sk: TECS[0].sk, h: 2, tec: TECS[0].id, nova: true }] };
    expect(planoComAgendaDeHoje(d, S)).toBeNull();
  });
});
