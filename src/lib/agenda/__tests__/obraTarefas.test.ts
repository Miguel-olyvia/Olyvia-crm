// As tarefas de obra na Agenda: o JSON da rh_agenda_tecnicos em eventos por dia útil, o estilo do estado e o filtro de pessoas.
import { describe, expect, it } from "vitest";
import {
  classesEstadoObra, corBarraObra, diasUteis, estadoTarefaObra, eventosObra, eventosObraPorDia, filtrarPessoasObra, filtroDeAlvos,
  mesmoNome, tarefaObraConcluida, tituloTarefaObra, type PessoaObraRpc, type TarefaObraRpc,
} from "../obraTarefas";

const tarefa = (o: Partial<TarefaObraRpc>): TarefaObraRpc => ({
  tarefa_id: "t1", nome: "Montagem de louças", oficio: "Canalizador", inicio: "2026-11-05", fim: "2026-11-10", estado: "por_fazer",
  minutos: 960, pessoas: 1, horas_dia: 4, obra_id: "o1", obra_codigo: "OB-0007", obra_titulo: "Remodelação WC", morada: "Rua A, 1",
  obra_estado: "em_curso", negocio_numero: 1010, ...o,
});
const RUBEN: PessoaObraRpc = { pessoa_id: "p-ruben", nome: "Rúben Lopes", oficios: ["Canalizador"], tarefas: [tarefa({})] };
const ANA: PessoaObraRpc = {
  pessoa_id: "p-ana", nome: "Ana Martins", tarefas: [tarefa({ tarefa_id: "t2", nome: "Pintura", inicio: "2026-11-09", fim: null, estado: "validada" })],
};

describe("diasUteis", () => {
  it("só de segunda a sexta (5/11/2026 é quinta: qui, sex, seg, ter)", () => {
    expect(diasUteis("2026-11-05", "2026-11-10", "2026-11-01", "2026-11-30")).toEqual(["2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10"]);
  });
  it("corta ao intervalo visível", () => {
    expect(diasUteis("2026-11-05", "2026-11-10", "2026-11-06", "2026-11-09")).toEqual(["2026-11-06", "2026-11-09"]);
    expect(diasUteis("2026-11-05", "2026-11-10", "2026-12-01", "2026-12-31")).toEqual([]);
  });
  it("sem fim, ou fim antes do início: só o dia do início; tarefa num sábado não aparece", () => {
    expect(diasUteis("2026-11-05", null, "2026-11-01", "2026-11-30")).toEqual(["2026-11-05"]);
    expect(diasUteis("2026-11-05", "2026-11-02", "2026-11-01", "2026-11-30")).toEqual(["2026-11-05"]);
    expect(diasUteis("2026-11-07", "2026-11-08", "2026-11-01", "2026-11-30")).toEqual([]);
  });
  it("datas inválidas: nada", () => {
    expect(diasUteis("", null, "2026-11-01", "2026-11-30")).toEqual([]);
  });
});

describe("eventosObra", () => {
  it("um evento por dia útil e por pessoa, com o título #negócio · tarefa e a pessoa", () => {
    const ev = eventosObra([RUBEN, ANA], "2026-11-01", "2026-11-30");
    expect(ev.map((e) => `${e.dia} ${e.pessoaNome}`)).toEqual([
      "2026-11-05 Rúben Lopes", "2026-11-06 Rúben Lopes", "2026-11-09 Ana Martins", "2026-11-09 Rúben Lopes", "2026-11-10 Rúben Lopes",
    ]);
    const e = ev[0];
    expect(e.titulo).toBe("#1010 · Montagem de louças");
    expect(e).toMatchObject({ tarefaId: "t1", pessoaId: "p-ruben", estado: "por_fazer", horasDia: 4, obraCodigo: "OB-0007", inicio: "2026-11-05", fim: "2026-11-10" });
    expect(new Set(ev.map((x) => x.key)).size).toBe(ev.length);
  });
  it("sem número de negócio usa o código da obra; estado desconhecido conta como por fazer; RPC vazia ou nula não parte", () => {
    expect(tituloTarefaObra({ nome: "Demolição", negocio_numero: null, obra_codigo: "OB-0009" })).toBe("OB-0009 · Demolição");
    expect(estadoTarefaObra("qualquer")).toBe("por_fazer");
    expect(eventosObra(null, "2026-11-01", "2026-11-30")).toEqual([]);
    expect(eventosObra([{ pessoa_id: "x", nome: null, tarefas: null }], "2026-11-01", "2026-11-30")).toEqual([]);
  });
  it("agrupa por dia", () => {
    const m = eventosObraPorDia(eventosObra([RUBEN, ANA], "2026-11-01", "2026-11-30"));
    expect(m.get("2026-11-09")?.length).toBe(2);
    expect(m.get("2026-11-07")).toBeUndefined();
  });
});

describe("estilo do estado", () => {
  it("feita/validada: ✓ e esbatida; rejeitada: aviso; o resto: a cor da obra (primary, não o azul das visitas)", () => {
    expect(tarefaObraConcluida("feita")).toBe(true);
    expect(tarefaObraConcluida("validada")).toBe(true);
    expect(tarefaObraConcluida("em_curso")).toBe(false);
    expect(classesEstadoObra("validada")).toContain("text-muted-foreground");
    expect(classesEstadoObra("rejeitada")).toContain("text-warning");
    expect(classesEstadoObra("por_fazer")).toContain("text-primary");
    expect(classesEstadoObra("em_curso")).not.toContain("info");
    expect(corBarraObra("rejeitada")).toBe("hsl(var(--warning))");
    expect(corBarraObra("por_fazer")).toBe("hsl(var(--primary))");
  });
});

describe("filtro de pessoas", () => {
  const contas = new Map([["u-ana", "p-ana"]]);
  it("mesmoNome: sem acentos, nome inteiro ou só o primeiro quando o filtro tem uma palavra", () => {
    expect(mesmoNome("Ruben", "Rúben Lopes")).toBe(true);
    expect(mesmoNome("rúben  lopes", "Rúben Lopes")).toBe(true);
    expect(mesmoNome("Rúben Silva", "Rúben Lopes")).toBe(false);
    expect(mesmoNome("", "Rúben Lopes")).toBe(false);
  });
  it("sem filtros: toda a gente", () => {
    expect(filtrarPessoasObra([RUBEN, ANA], []).map((p) => p.pessoa_id)).toEqual(["p-ruben", "p-ana"]);
  });
  it("conta ligada: pela pessoa, mesmo com outro nome; sem conta ligada: pelo nome", () => {
    const soAna = filtroDeAlvos([{ userId: "u-ana", nomes: ["Outro Nome"] }], contas);
    expect(soAna).toEqual({ pessoaIds: ["p-ana"], nomes: [] });
    expect(filtrarPessoasObra([RUBEN, ANA], [soAna]).map((p) => p.pessoa_id)).toEqual(["p-ana"]);
    const peloNome = filtroDeAlvos([{ userId: "u-ruben", nomes: ["Rúben", null] }], contas);
    expect(filtrarPessoasObra([RUBEN, ANA], [peloNome]).map((p) => p.pessoa_id)).toEqual(["p-ruben"]);
  });
  it("vários filtros juntam-se com E (o Ver e os recursos); ninguém escolhido = ninguém", () => {
    const equipa = filtroDeAlvos([{ userId: "u-ana" }, { userId: "u-ruben", nomes: ["Rúben Lopes"] }], contas);
    const recurso = filtroDeAlvos([{ userId: null, nomes: ["Ana Martins"] }], contas);
    expect(filtrarPessoasObra([RUBEN, ANA], [equipa, recurso]).map((p) => p.pessoa_id)).toEqual(["p-ana"]);
    expect(filtrarPessoasObra([RUBEN, ANA], [filtroDeAlvos([{ userId: undefined }], contas)])).toEqual([]);
  });
});
