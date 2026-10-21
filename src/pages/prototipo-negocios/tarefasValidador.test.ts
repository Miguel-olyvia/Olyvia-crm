import { describe, expect, it } from "vitest";
import type { Plano, Servico, Tarefa } from "./motor";
import { avisarTecnico, avisosPorVer, criarTarefa, diaMinimo, juntarTarefa, materiaisDoServico, moverTarefa, podeTirar, tirarTarefa, ultimoAviso } from "./tarefasValidador";

const tarefa = (nome: string, fase: number, dia: number, dur: number, tec: string): Tarefa => ({ nome, svcs: [], dia, dur, sk: "Ladrilhador", h: dur * 8, tec, fase });
const plano = (): Plano => ({ estado: "por aprovar", dia: 0, tasks: [tarefa("Demolição", 1, 0, 1, "js"), tarefa("Canalização", 2, 1, 1, "ma"), tarefa("Revestimento", 3, 1, 2, "sf")] });
const pint: Servico = { n: "Pintura de tetos e paredes", un: "m²", h: 0.3, eh: 25, eq: 0, cons: 2.1, preco: 17.5, perfil: "Pintor" };
const revest: Servico = { n: "Revestimento de parede", un: "m²", h: 0.75, eh: 25, eq: 0, cons: 1.01, preco: 26, perfil: "Ladrilhador" };

describe("o validador junta tarefas ao plano", () => {
  it("a tarefa nova vem do serviço: horas, dias, ofício, técnico livre e materiais da receita", () => {
    const p = plano();
    const t = criarTarefa(p, revest, { sid: "revest", q: 20, fase: 3, dia: 3 });
    expect(t).toMatchObject({ nome: "Revestimento de parede", h: 15, dur: 2, sk: "Ladrilhador", fase: 3, nova: true });
    expect(t.tec).toBe("hn"); // o Sérgio está de férias no 4.º dia do plano de exemplo
    expect(t.mats!.map((m) => m.n)).toEqual(["Cimento-cola C2TE", "Argamassa de juntas"]);
    expect(t.mats![0].q).toBe(80);
  });
  it("não começa antes do fim da fase anterior; com a obra em curso, nunca antes de hoje", () => {
    const p = plano();
    expect(diaMinimo(p, 3)).toBe(1);
    expect(criarTarefa(p, revest, { sid: "revest", q: 1, fase: 3, dia: 0 }).dia).toBe(1);
    p.estado = "em curso"; p.dia = 2;
    expect(criarTarefa(p, revest, { sid: "revest", q: 1, fase: 3 }).dia).toBe(2);
  });
  it("juntar guarda a base do orçamento; só as tarefas novas se tiram", () => {
    const p = plano();
    const ti = juntarTarefa(p, criarTarefa(p, pint, { sid: "pint", q: 10, fase: 4 }));
    expect(p.base).toHaveLength(3);
    expect(podeTirar(p, 0)).toBe(false);
    expect(tirarTarefa(p, 0)).toBe(false);
    expect(tirarTarefa(p, ti)).toBe(true);
    expect(p.tasks).toHaveLength(3);
  });
  it("mudar de fase respeita o início mínimo da fase nova", () => {
    const p = plano();
    moverTarefa(p, 0, { fase: 3, dia: 0 });
    expect(p.tasks[0]).toMatchObject({ fase: 3, dia: 1 });
  });
  it("os materiais de unidades inteiras arredondam para cima", () => {
    expect(materiaisDoServico("demol", 3).find((m) => m.n === "Sacos de entulho")!.q).toBe(2);
  });
});

describe("os avisos ao técnico", () => {
  it("juntam-se num só enquanto não os vê; o gestor vê se já viu", () => {
    const p = plano();
    avisarTecnico(p, 2, "mudou 1", "10:00");
    avisarTecnico(p, 2, "mudou 2", "10:01");
    expect(avisosPorVer(p, "sf")).toHaveLength(1);
    expect(ultimoAviso(p, 2)!.t).toBe("mudou 2");
    p.avisos![0].lido = "10:05";
    expect(avisosPorVer(p, "sf")).toHaveLength(0);
    avisarTecnico(p, 2, "mudou 3", "10:06");
    expect(p.avisos).toHaveLength(2);
  });
  it("ao tirar uma tarefa, os avisos das seguintes acompanham o índice", () => {
    const p = plano();
    const a = juntarTarefa(p, criarTarefa(p, pint, { sid: "pint", q: 10, fase: 4 }));
    const b = juntarTarefa(p, criarTarefa(p, pint, { sid: "pint", q: 5, fase: 4 }));
    avisarTecnico(p, b, "b", "10:00", "pm");
    tirarTarefa(p, a);
    expect(p.avisos![0].ti).toBe(b - 1);
  });
});
