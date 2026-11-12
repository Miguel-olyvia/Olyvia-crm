// 12/11 (Rúben: «a validação da obra está com as agendas todas lixadas, devia ter agendas disponíveis»; «o comercial não deve conseguir
// terminar a proposta sem ter os técnicos disponíveis para a obra»; «a plataforma deve sugerir no fim da fase da visita»).
import { afterEach, describe, expect, it } from "vitest";
import {
  agendaDaProposta, cargaDosTecnicos, definirAgendaExtra, iniciosLivres, motivoOcupado, obrasDosTecnicos, ocupacaoDosTecnicos,
} from "./preparacaoObra";
import { TECS, acoes, alertas, bloqueado, seed, type Estado, type Negocio, type Plano } from "./motor";
import { datasComTodosLivres } from "./SugestaoDatasObra";
import type { PlanoDatas } from "./planoDaVisita";

const INICIO = "2027-03-01"; // segunda-feira
const planoDe = (estado: Plano["estado"], tasks: Plano["tasks"]): Plano => ({ tasks, estado, dia: 0, origem: "orcamento", inicio: INICIO });
const tarefa = (tec: string, dia: number, dur: number, h: number, nome = "Outra"): Plano["tasks"][number] => ({ nome, svcs: [], dia, dur, sk: TECS[0].sk, h, tec });

function dois() {
  const S = seed();
  const [d1, d2] = S.deals.filter((x) => x.obra);
  return { S, d1, d2, T: TECS[0].id };
}

afterEach(() => definirAgendaExtra(null));

describe("a agenda dos técnicos no plano da obra", () => {
  it("um plano ainda por aprovar noutro negócio não ocupa ninguém; aprovado ou em curso, ocupa", () => {
    const { S, d1, d2, T } = dois();
    d1.obra.plano = planoDe("por aprovar", [tarefa(T, 0, 3, 24)]);
    expect(ocupacaoDosTecnicos(S, d2.id).get(T)).toBeUndefined();
    d1.obra.plano.estado = "aprovado";
    expect([...(ocupacaoDosTecnicos(S, d2.id).get(T) ?? [])]).toEqual(["2027-03-01", "2027-03-02", "2027-03-03"]);
    d1.obra.plano.estado = "em curso";
    expect(ocupacaoDosTecnicos(S, d2.id).get(T)?.size).toBe(3);
  });

  it("12/11 (medidas e plano depois do Financeiro): o plano por aprovar de um negócio já pago reserva a agenda", () => {
    const { S, d1, d2, T } = dois();
    d1.obra.plano = planoDe("por aprovar", [tarefa(T, 0, 3, 24)]);
    d1.fin.pago = false;
    expect(ocupacaoDosTecnicos(S, d2.id).get(T)).toBeUndefined();
    d1.fin.pago = true;
    expect(ocupacaoDosTecnicos(S, d2.id).get(T)?.size).toBe(3);
  });

  it("um negócio perdido e as tarefas já feitas não ocupam", () => {
    const { S, d1, d2, T } = dois();
    d1.obra.plano = planoDe("aprovado", [tarefa(T, 0, 1, 8), tarefa(T, 1, 1, 8)]);
    d1.obra.plano.tasks[0].exec = { estado: "feita", horas: 8 } as never;
    expect([...(ocupacaoDosTecnicos(S, d2.id).get(T) ?? [])]).toEqual(["2027-03-02"]);
    d1.perdido = true;
    expect(ocupacaoDosTecnicos(S, d2.id).get(T)).toBeUndefined();
  });

  it("conta em horas: uma tarefa curta noutra obra deixa o resto do dia livre", () => {
    const { S, d1, d2, T } = dois();
    d1.obra.plano = planoDe("aprovado", [tarefa(T, 0, 1, 1.5, "Espelho")]);
    const ocup = ocupacaoDosTecnicos(S, d2.id);
    const aqui = planoDe("por aprovar", []);
    // o dia não está cheio (não fica riscado)
    expect(ocup.get(T)?.has(INICIO)).toBe(false);
    expect(ocup.horas(T, INICIO)).toBe(1.5);
    // 4 h cabem ao lado das 1,5 h; 8 h não
    expect(motivoOcupado(T, { dia: 0, dur: 1, h: 4 }, aqui, ocup)).toBeNull();
    expect(motivoOcupado(T, { dia: 0, dur: 1, h: 8 }, aqui, ocup)).toBe("noutra obra");
    // sem as horas da tarefa, conta o dia inteiro
    expect(motivoOcupado(T, { dia: 0, dur: 1 }, aqui, ocup)).toBe("noutra obra");
  });

  it("os compromissos da agenda real (tarefas de outras obras, visitas) também contam, sem contar duas vezes um negócio carregado", () => {
    const { S, d2, T } = dois();
    definirAgendaExtra([
      { tec: T, data: INICIO, h: 8, nome: "Obra fora dos negócios", tarefa: "Pintura" },
      { tec: T, data: "2027-03-02", h: 8, nome: "Obra de um negócio carregado", tarefa: "Canalização", negocio: S.deals[0].id },
    ]);
    const c = cargaDosTecnicos(S, d2.id).get(T);
    expect(c?.get(INICIO)?.h).toBe(8);
    expect(c?.get("2027-03-02")).toBeUndefined();
    expect(motivoOcupado(T, { dia: 0, dur: 1, h: 2 }, planoDe("por aprovar", []), ocupacaoDosTecnicos(S, d2.id))).toBe("noutra obra");
  });

  it("a barra «noutra obra» do Estúdio só vem das obras que ocupam", () => {
    const { S, d1, d2, T } = dois();
    d1.obra.plano = planoDe("por aprovar", [tarefa(T, 0, 2, 16)]);
    expect(obrasDosTecnicos(S, d2.id).get(T)).toBeUndefined();
    d1.obra.plano.estado = "aprovado";
    expect(obrasDosTecnicos(S, d2.id).get(T)?.get(INICIO)?.id).toBe(d1.id);
  });
});

/** Um negócio na fase do orçamento, por enviar, com tarefas de técnicos do RH. */
function propostaPorEnviar(S: Estado): Negocio {
  // o 1031 do seed tem a proposta enviada, por aceitar: volta a estar por enviar
  const d = S.deals.find((x) => x.id === 1031);
  if (!d?.orc) throw new Error("o seed não tem o 1031 com orçamento");
  d.orc.enviada = null; d.orc.aceite = null; d.orc.vendaDireta = false; d.fase = 3; d.perdido = false;
  d.orc.inicioObra = INICIO; d.f.inicio_prev = INICIO;
  return d;
}

/** Enche a agenda de todos os técnicos noutra obra aprovada, `dias` dias úteis a partir de INICIO. */
function encher(S: Estado, d: Negocio, dias: number) {
  const outro = S.deals.find((x) => x.id !== d.id && x.obra)!;
  outro.perdido = false;
  outro.obra.plano = planoDe("aprovado", TECS.map((t) => ({ ...tarefa(t.id, 0, dias, 8 * dias), sk: t.sk })));
}

describe("a proposta só sai com os técnicos livres", () => {
  it("com todos livres, nada bloqueia pela agenda", () => {
    const S = seed();
    const d = propostaPorEnviar(S);
    const AG = agendaDaProposta(d, S, new Date(2027, 1, 1));
    expect(AG?.inicio).toBe(INICIO);
    expect(AG?.ocupadas).toEqual([]);
    expect(alertas(d, S).some((a) => a.agenda)).toBe(false);
  });

  it("com os técnicos noutra obra, bloqueia (sem aprovação da Direção por cima), diz quem e não envia; um dia livre resolve", () => {
    const S = seed();
    const d = propostaPorEnviar(S);
    encher(S, d, 10);
    const AG = agendaDaProposta(d, S);
    expect(AG?.ocupadas.length).toBeGreaterThan(0);
    const al = alertas(d, S).find((a) => a.agenda);
    expect(al?.k).toBe("x");
    expect(al?.aprov).toBe(false);
    expect(al?.d).toMatch(/noutra obra/);
    expect(bloqueado(d, S)).toBe(true);
    d.orc!.aprov = "ok";
    expect(bloqueado(d, S)).toBe(true);
    S.role = "comercial";
    const avisos: string[] = [];
    const A = acoes(S, (x) => avisos.push(`${x.msg}: ${x.sub ?? ""}`), (fn) => fn());
    A.enviar(d.id);
    expect(d.orc!.enviada).toBeFalsy();
    expect(avisos.join(" ")).toMatch(/técnicos livres/);
    // os dias com todos livres começam depois dos 10 dias cheios
    const L = iniciosLivres(d, S, { n: 2, hoje: new Date(2027, 1, 26) });
    expect(L.length).toBeGreaterThan(0);
    expect(L[0].iso >= "2027-03-15").toBe(true);
    A.inicioObra(d.id, L[0].iso);
    expect(d.f.inicio_prev).toBe(L[0].iso);
    expect(alertas(d, S).some((a) => a.agenda)).toBe(false);
  });

  it("enviada, aceite ou numa adenda, já não se verifica", () => {
    const S = seed();
    const d = propostaPorEnviar(S);
    encher(S, d, 10);
    expect(agendaDaProposta({ ...d, orc: { ...d.orc!, modelo: "Adenda 1" } }, S)).toBeNull();
    expect(agendaDaProposta({ ...d, orc: { ...d.orc!, enviada: "hoje" } }, S)).toBeNull();
    expect(agendaDaProposta({ ...d, orc: { ...d.orc!, aceite: "hoje" } }, S)).toBeNull();
  });
});

describe("a sugestão de datas no fim da visita", () => {
  it("os primeiros dias de início em que nenhuma tarefa fica com o técnico ocupado", () => {
    const P = (iso: string, ocupado: boolean) => ({ tarefas: [{ ocupado: ocupado ? "noutra obra" : undefined }], inicio: new Date(iso), equipa: [], equipas: [], dias: 2 } as unknown as PlanoDatas);
    // ocupados até 10 de março (inclusive)
    const L = datasComTodosLivres((iso) => P(iso, iso <= "2027-03-10"), { n: 2, hoje: new Date(2027, 2, 1) });
    expect(L.map((x) => x.iso)).toEqual(["2027-03-11", "2027-03-12"]);
  });
  it("sem tarefas, não há o que sugerir", () => {
    expect(datasComTodosLivres(() => ({ tarefas: [] } as unknown as PlanoDatas), { hoje: new Date(2027, 2, 1) })).toEqual([]);
  });
});
