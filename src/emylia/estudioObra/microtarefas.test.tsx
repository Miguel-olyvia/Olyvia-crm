// 24/11 (Rúben: «cada tarefa do plano pode e deve ter microtarefas»; «no Estúdio da obra juntar e tirar tarefas, com os serviços novos a
// gerar adenda»). As microtarefas (microtarefas.ts), as ações do motor, o painel e o tirar / juntar tarefas.
import { afterEach, describe, expect, it } from "vitest";
import { definirMicrotarefasServicos } from "../real/microtarefasServico";
import { propostaDoServico } from "../MicrotarefasServico";
import { obrasPorAtualizar } from "./AtualizarMicrotarefas";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { acoes, type Tarefa } from "../motor";
import type { Ctx } from "../pecas";
import { detalheMicro, listaMicro, microDoCatalogo, microDoInfraspeak, microFeitas, microtarefasDe, mudarMicro, porFixar, progressoMicro } from "../microtarefas";
import { obraDeExemplo } from "./exemploObra";
import { custosDe, receitaDe } from "../v2/custosModelo";
import { MicrotarefasTarefa } from "./MicrotarefasTarefa";
import { retratoDe } from "./passosObra";

afterEach(cleanup);

function obra() {
  const { S, d } = obraDeExemplo();
  const avisos: string[] = [];
  const A = acoes(S, (a) => avisos.push(a.msg), (fn) => fn());
  const p = d.obra.plano!;
  const ix = (nome: string) => p.tasks.findIndex((t) => t.nome === nome);
  // uma tarefa por começar com passos no Catálogo (a receita de exemplo tem um passo só, «Execução»: aqui, três)
  const livre = p.tasks.findIndex((t) => !t.exec && t.nome === "Pavimento cerâmico");
  const C = custosDe(S);
  C.receitas.pav = { ...receitaDe(C, "pav", S.svc.pav, S.cfg.alvo)!, mo: [
    { id: "a", n: "Preparar a betonilha", perfil: "ladrilhador", h: 0.2 },
    { id: "b", n: "Assentar o pavimento", perfil: "ladrilhador", h: 0.5 },
    { id: "c", n: "Betumar as juntas", perfil: "ladrilhador", h: 0.15 },
  ] };
  // um nome que não casa com as tarefas da Mudelar no Infraspeak (essas vêm antes do Catálogo: testes em baixo)
  p.tasks[livre].nome = "Trabalho especial"; p.tasks[livre].sk = "Equipa";
  return { S, d, A, p, ix, avisos, livre };
}

describe("a lista de microtarefas", () => {
  it("vem dos passos do Catálogo, com as horas repartidas pelas da tarefa e ids 0, 1, 2…", () => {
    const { S, p, livre } = obra();
    expect(livre).toBeGreaterThanOrEqual(0);
    const t = p.tasks[livre], r = microtarefasDe(t, S, p);
    expect(r.origem).toBe("catalogo");
    expect(r.L.map((m) => m.id)).toEqual(r.L.map((_, k) => k));
    const soma = r.L.reduce((a, m) => a + (m.h ?? 0), 0);
    expect(Math.abs(soma - t.h)).toBeLessThan(0.05 * r.L.length + 0.01);
  });
  it("sem Catálogo, as instruções pelo nome; com marcas antigas (sem microDe), também", () => {
    const t: Tarefa = { nome: "Montar o andaime", svcs: [], dia: 0, dur: 1, sk: "Equipa", h: 8, tec: null };
    expect(microtarefasDe(t, null).origem).toBe("instrucoes");
    const { S, p, livre } = obra();
    const u = p.tasks[livre];
    u.exec = { estado: "em curso", horas: 0, fotos: [], passos: [0] };
    expect(microtarefasDe(u, S, p).origem).toBe("instrucoes");
    u.exec.microDe = "catalogo";
    expect(microtarefasDe(u, S, p).origem).toBe("catalogo");
  });
  it("juntar, mudar o texto, mudar a ordem e tirar: os ids não mudam e as marcas seguem a microtarefa", () => {
    const { S, p, livre } = obra();
    const t = p.tasks[livre];
    const L0 = listaMicro(t, S, p);
    t.exec = { estado: "em curso", horas: 0, fotos: [], passos: [L0[1].id], microDe: "catalogo" };
    expect(mudarMicro(t, { k: "juntar", n: "  Proteger   a base  " }, S, p)).toBe("juntou «Proteger a base»");
    const nova = t.micro!.at(-1)!;
    expect(nova.id).toBe(Math.max(...L0.map((m) => m.id)) + 1);
    expect(mudarMicro(t, { k: "mover", id: L0[1].id, para: 0 }, S, p)).toContain("mudou de lugar");
    expect(t.micro![0].id).toBe(L0[1].id);
    expect([...microFeitas(t, t.micro!)]).toEqual([L0[1].id]); // a marca foi com ela
    expect(mudarMicro(t, { k: "mudar", id: nova.id, n: "Proteger a base com cartão" }, S, p)).toContain("passou a");
    expect(mudarMicro(t, { k: "tirar", id: L0[1].id }, S, p)).toContain("tirou");
    expect(microFeitas(t, t.micro!).size).toBe(0); // a marca de uma microtarefa tirada deixa de contar
    // um id tirado não se reaproveita
    mudarMicro(t, { k: "juntar", n: "Outra" }, S, p);
    expect(t.micro!.at(-1)!.id).toBe(nova.id + 1);
    // nada muda: a lista não fica fixada
    const u = p.tasks.find((x, i) => i !== livre && !x.micro)!;
    expect(mudarMicro(u, { k: "juntar", n: "   " }, S, p)).toBeNull();
    expect(u.micro).toBeUndefined();
  });
});

describe("as tarefas da Mudelar no Infraspeak (25/11)", () => {
  const tarefa = (nome: string, sk = "Equipa", fase = 2): Tarefa => ({ nome, svcs: [], dia: 0, dur: 1, sk, h: 8, tec: null, fase });
  it("a canalização de uma casa de banho: as tarefas do Infraspeak, com as horas, quem faz e a checklist", () => {
    const t = tarefa("MO Modelo Remodelação Completa - Casa de Banho · canalização");
    const r = microtarefasDe(t, null, { tasks: [t] } as never);
    expect(r.origem).toBe("infraspeak");
    expect(r.L.map((m) => m.n)).toEqual(["Levantamento e marcação", "Remoção das instalações existentes", "Execução de rasgos e aberturas",
      "Instalação das novas tubagens", "Ensaios e verificação", "Fecho dos rasgos e limpeza final"]);
    expect(r.L.map((m) => m.id)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(r.L[0].h).toBe(1.5);
    const D = detalheMicro(r.L[0]);
    expect(D.quem).toBe("Empreiteiro Geral");
    expect(D.det.length).toBeGreaterThan(1);
    expect(D.det.every((x) => !/^\d/.test(x))).toBe(true); // sem os códigos do Infraspeak
  });
  it("louças, eletricidade final, cozinha e o que não casa", () => {
    const base = tarefa("Base de Duche", "Canalizador", 4);
    expect(listaMicro(base, null, { tasks: [base] } as never).map((m) => m.n)).toContain("Montagem da base de duche ou banheira");
    const luz = tarefa("Aplique", "Eletricista", 4);
    expect(listaMicro(luz, null, { tasks: [luz] } as never).map((m) => m.n)).toContain("Ligação de luminárias");
    const gas = tarefa("Instalação de gás", "Técnico Gás", 2), banc = tarefa("Montagem da bancada", "Carpinteiro", 4);
    expect(listaMicro(gas, null, { tasks: [gas, banc] } as never).map((m) => m.n)).toContain("Instalação dos pontos de consumo");
    expect(microtarefasDe(tarefa("Montar o andaime"), null).origem).toBe("instrucoes");
  });
  it("ao abrir o Estúdio, as listas que existem passam às do Infraspeak: os ids ficam, muda o nome, juntam-se as novas, as marcadas ficam", () => {
    const { S, d, A, p, livre } = obra();
    const t = p.tasks[livre];
    t.micro = [{ id: 0, n: "Preparar" }, { id: 1, n: "Assentar" }, { id: 7, n: "Juntada pelo gestor" }];
    t.exec = { estado: "em curso", horas: 1, fotos: [], passos: [1] };
    t.nome = "Revestimento de parede"; // agora casa com o Infraspeak
    const inf = microDoInfraspeak(t, p);
    expect(inf.length).toBeGreaterThan(3);
    A.fixarMicrotarefas(d.id);
    const L = t.micro!;
    expect(L.slice(0, 3).map((m) => m.id)).toEqual([0, 1, 7]);
    expect(L[0]).toMatchObject({ n: inf[0].n, ref: inf[0].ref });
    expect(L[1]).toEqual({ id: 1, n: "Assentar" }); // o técnico já a marcou: fica
    expect(L[2]).toMatchObject({ id: 7, n: inf[2].n });
    expect(L.length).toBe(inf.length + 1); // a 2.ª do Infraspeak junta-se no fim; nada se apaga
    expect(L.slice(3).map((m) => m.id)).toEqual(L.slice(3).map((_, k) => 8 + k));
    expect([...microFeitas(t, L)]).toEqual([1]);
    // só uma vez
    const antes = JSON.stringify(L);
    A.fixarMicrotarefas(d.id);
    expect(JSON.stringify(t.micro)).toBe(antes);
    expect(porFixar(t, S, p)).toBeNull();
  });
});

describe("as microtarefas da ficha do serviço (25/11)", () => {
  afterEach(() => definirMicrotarefasServicos(null));
  it("a lista da ficha do serviço vem antes do Infraspeak; a checklist do Infraspeak não se repete na tarefa", () => {
    const { S, p, livre } = obra();
    const t = p.tasks[livre];
    t.nome = "Revestimento de parede";
    expect(microtarefasDe(t, S, p).origem).toBe("infraspeak");
    const inf = microDoInfraspeak(t, p);
    const ref = inf[0].ref!, det = detalheMicro(inf[0]).det;
    definirMicrotarefasServicos({ [t.svcs[0]]: [{ nome: "Preparar a parede", horas: 1, checklist: det, ref }, { nome: "Fotografar", checklist: ["Antes e depois"], quem: "Supervisor" }] });
    const r = microtarefasDe(t, S, p);
    expect(r.origem).toBe("servico");
    expect(r.L).toEqual([{ id: 0, n: "Preparar a parede", h: 1, ref }, { id: 1, n: "Fotografar", det: ["Antes e depois"], quem: "Supervisor" }]);
    expect(detalheMicro(r.L[0]).det).toEqual(det);
    expect(detalheMicro(r.L[1])).toEqual({ quem: "Supervisor", det: ["Antes e depois"] });
  });
  it("as obras que existem: «Atualizar» muda os nomes, junta as novas, fica no histórico e só uma vez", () => {
    const { S, d, A, p, livre } = obra();
    const t = p.tasks[livre];
    t.micro = [{ id: 0, n: "Velha" }];
    definirMicrotarefasServicos({ [t.svcs[0]]: [{ nome: "Nova A", checklist: [] }, { nome: "Nova B", checklist: [] }] });
    expect(obrasPorAtualizar(S, [d])[0].n).toBeGreaterThanOrEqual(1);
    expect(A.fixarMicrotarefas(d.id, true)).toBeGreaterThan(0);
    expect(t.micro.map((m) => [m.id, m.n])).toEqual([[0, "Nova A"], [1, "Nova B"]]);
    expect(d.hist[0].t).toMatch(/^Plano: microtarefas atualizadas em \d+ tarefas?/);
    expect(obrasPorAtualizar(S, [d])).toEqual([]); // só uma vez
  });
  it("a proposta para um serviço vem do Infraspeak (nome, ofício e fase)", () => {
    const L = propostaDoServico("x", "Montagem de louças sanitárias", "Canalizador", 4);
    expect(L.map((m) => m.nome)).toContain("Montagem da sanita");
    expect(L[0].checklist.length).toBeGreaterThan(0);
    expect(propostaDoServico("y", "Montar o andaime", "Equipa")).toEqual([]);
  });
});

describe("o motor", () => {
  it("o gestor fixa as listas do Catálogo, muda-as só nesta obra (fica no histórico) e entra no anular / refazer", () => {
    const { S, d, A, p, livre } = obra();
    expect(porFixar(p.tasks[livre], S, p)).not.toBeNull();
    expect(A.fixarMicrotarefas(d.id)).toBeGreaterThan(0);
    expect(p.tasks[livre].micro?.length).toBeGreaterThan(1);
    expect(porFixar(p.tasks[livre], S, p)).toBeNull();
    const ficha = JSON.stringify(microDoCatalogo(S, p.tasks[livre], p));
    expect(A.microtarefas(d.id, livre, { k: "juntar", n: "Tirar fotografia do antes" })).toBe(true);
    expect(d.hist[0].t).toBe(`Plano: microtarefas de ${p.tasks[livre].nome} · juntou «Tirar fotografia do antes»`);
    expect(JSON.stringify(microDoCatalogo(S, p.tasks[livre], p))).toBe(ficha); // o Catálogo não muda
    expect(retratoDe(d)!.plano.tasks[livre].micro?.at(-1)?.n).toBe("Tirar fotografia do antes");
  });
  it("o técnico marca pelo id; sem lista fixada fica dito de onde vinha e a lista não troca; o registo leva os nomes", () => {
    const { S, d, A, p, livre } = obra();
    const t = p.tasks[livre], L = listaMicro(t, S, p);
    A.marcarPasso(d.id, livre, L[0].id);
    expect(t.exec?.microDe).toBe("catalogo");
    expect(microtarefasDe(t, S, p).origem).toBe("catalogo");
    A.marcarPasso(d.id, livre, L[1].id);
    expect(progressoMicro(t, S, p)).toEqual({ feitas: 2, total: L.length });
    A.marcarPasso(d.id, livre, L[1].id); // desmarca
    expect(progressoMicro(t, S, p).feitas).toBe(1);
    delete t.bloqueio; // no exemplo, o pavimento está parado por um imprevisto
    A.enviarRegisto(d.id, livre, { horas: 2, fotos: ["x"], nota: "Começou" });
    expect(t.exec?.envios?.at(-1)?.passos).toEqual([L[0].n]);
  });
});

describe("tirar e juntar tarefas no plano da obra", () => {
  it("uma tarefa do contrato por começar tira-se: o técnico é avisado, fica no histórico e no diário, as ligações acertam-se", () => {
    const { d, A, p, livre } = obra();
    const t = p.tasks[livre], n = p.tasks.length, tec = t.tec;
    const depois = p.tasks.findIndex((x, i) => i > livre && !x.exec);
    if (depois >= 0) p.tasks[depois].deps = [livre, 0];
    A.tirarTarefaPlano(d.id, livre);
    expect(p.tasks.length).toBe(n - 1);
    expect(d.hist[0].t).toBe(`Plano: tarefa ${t.nome} tirada (era do contrato; o valor do contrato não muda)`);
    expect(d.obra.diario?.at(-1)?.t).toBe(`Tarefa tirada do plano: ${t.nome}`);
    if (tec) expect(p.avisos?.some((a) => a.tec === tec && a.t === `${t.nome} saiu do plano`)).toBe(true);
    if (depois >= 0) expect(p.tasks[depois - 1].deps).toEqual([0]);
    expect(p.base?.length).toBeGreaterThanOrEqual(n); // a base do orçamento fica
  });
  it("uma tarefa com trabalho do técnico não se tira", () => {
    const { d, A, p, ix, avisos } = obra();
    const rev = ix("Revestimento de parede"), n = p.tasks.length;
    A.tirarTarefaPlano(d.id, rev);
    expect(p.tasks.length).toBe(n);
    expect(avisos).toContain("Esta tarefa já começou");
  });
  it("a tarefa interna entra já, sem serviço nem adenda, e fica no histórico", () => {
    const { d, A, p, S } = obra();
    const n = p.tasks.length, adendas = (d.adendas ?? []).length;
    const tec = p.tasks.find((t) => t.tec)!.tec;
    const ti = A.novaTarefaInterna(d.id, { nome: "Limpeza final", h: 3, fase: 4, tec })!;
    const t = p.tasks[ti];
    expect(p.tasks.length).toBe(n + 1);
    expect(t).toMatchObject({ nome: "Limpeza final", svcs: [], h: 3, dur: 1, interna: true, nova: true, tec, fase: 4 });
    expect(t.dia).toBeGreaterThanOrEqual(p.dia);
    expect((d.adendas ?? []).length).toBe(adendas);
    expect(d.hist[0].t).toContain("Plano: tarefa interna nova · Limpeza final");
    expect(listaMicro(t, S, p).length).toBeGreaterThan(0); // as instruções pelo nome
    // e tira-se (não tem trabalho)
    A.tirarTarefaPlano(d.id, ti);
    expect(p.tasks.length).toBe(n);
    expect(d.hist[0].t).toBe("Plano: tarefa Limpeza final tirada");
  });
});

describe("o painel das microtarefas", () => {
  it("mostra o que o técnico marcou e deixa o gestor juntar e tirar", () => {
    const { S, d, A, p, livre } = obra();
    const t = p.tasks[livre], L = listaMicro(t, S, p);
    A.marcarPasso(d.id, livre, L[0].id);
    const ctx = { S, A, run: (fn: () => void) => { fn(); r.rerender(<MicrotarefasTarefa ctx={ctx} d={d} ti={livre} mexe cor="#000" />); }, go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
    const r = render(<MicrotarefasTarefa ctx={ctx} d={d} ti={livre} mexe cor="#000" />);
    expect(screen.getByText(`1 de ${L.length} feitas`)).toBeTruthy();
    expect(screen.getByText(/Vêm da ficha do serviço no Catálogo/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Nova microtarefa"), { target: { value: "Tirar fotografia do fim" } });
    fireEvent.click(screen.getByRole("button", { name: /Juntar/ }));
    expect(screen.getByText(`1 de ${L.length + 1} feitas`)).toBeTruthy();
    expect(screen.getByText(/Lista desta obra/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tirar «Tirar fotografia do fim»" }));
    expect(screen.getByText(`1 de ${L.length} feitas`)).toBeTruthy();
    expect(d.hist.slice(0, 2).map((e) => e.t)).toEqual([
      `Plano: microtarefas de ${t.nome} · tirou «Tirar fotografia do fim»`,
      `Plano: microtarefas de ${t.nome} · juntou «Tirar fotografia do fim»`,
    ]);
  });
  it("sem poder mexer, só se vê", () => {
    const { S, d, A, livre } = obra();
    const ctx = { S, A, run: (fn: () => void) => fn(), go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
    render(<MicrotarefasTarefa ctx={ctx} d={d} ti={livre} mexe={false} cor="#000" />);
    expect(screen.queryByLabelText("Nova microtarefa")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Tirar «/ })).toBeNull();
  });
});
