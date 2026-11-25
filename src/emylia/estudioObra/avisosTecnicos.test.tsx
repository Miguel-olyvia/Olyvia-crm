// 23/11 (revisão: «Avisar os técnicos afetados … nada é enviado sem o toque do gestor»).
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { acoes, TECS } from "../motor";
import type { Ctx } from "../pecas";
import { EstudioObra } from "./EstudioObra";
import { obraDeExemplo } from "./exemploObra";
import { avisosPorDar, marcasDe, segurarAvisos } from "./avisosTecnicos";

afterEach(cleanup);
const quando = (k: number) => `dia ${k + 1}`;

describe("avisar os técnicos afetados", () => {
  it("a lista diz a quem muda e o quê (dias, e quem passa a tarefa e quem a perde)", () => {
    const { d } = obraDeExemplo(), p = d.obra.plano!;
    const ti = p.tasks.findIndex((t) => t.tec && !t.exec), base = marcasDe(p), velho = p.tasks[ti].tec!;
    const outro = TECS.find((x) => x.id !== velho)!.id;
    p.tasks[ti].dia += 2;
    expect(avisosPorDar(p, base, quando)).toEqual([{ tec: velho, ti, t: expect.stringMatching(/passa a dia .* \(era dia /) }]);
    p.tasks[ti].tec = outro;
    const L = avisosPorDar(p, base, quando);
    expect(L.map((x) => x.tec).sort()).toEqual([outro, velho].sort());
    expect(L.find((x) => x.tec === velho)!.t).toMatch(/já não é consigo/);
    expect(L.find((x) => x.tec === outro)!.t).toMatch(/^Tem uma tarefa nova/);
  });
  it("os avisos que o motor dá logo ficam à espera (os outros ficam)", () => {
    const { d, S } = obraDeExemplo(), p = d.obra.plano!, A = acoes(S, () => {}, (fn) => fn());
    const ti = p.tasks.findIndex((t) => t.tec && !t.exec), outro = TECS.find((x) => x.id !== p.tasks[ti].tec)!.id;
    const av0 = JSON.parse(JSON.stringify(p.avisos ?? [])), m0 = marcasDe(p);
    A.trocarTec(d.id, ti, outro);
    expect((p.avisos ?? []).length).toBeGreaterThan(av0.length);
    segurarAvisos(p, av0, m0);
    expect(p.avisos ?? []).toEqual(av0);
  });
  it("no Estúdio: ligar não avisa ninguém; o cartão lista a mudança, «Avisar» põe-na no Hoje, e anular tira-a da lista", () => {
    const x = obraDeExemplo(), p = x.d.obra.plano!, A = acoes(x.S, () => {}, (fn) => fn());
    const mont = p.tasks.findIndex((t) => t.nome === "Montagem de móveis"), rev = p.tasks.findIndex((t) => t.nome === "Revestimento de parede");
    p.tasks[mont].dia = p.tasks[rev].dia + 1;
    const ctx = { S: x.S, A, run: (fn: () => void) => fn(), go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
    const n0 = (p.avisos ?? []).length, tec = p.tasks[mont].tec!;
    render(<EstudioObra ctx={ctx} d={x.d} fechar={() => {}} />);
    expect(screen.queryByRole("region", { name: "Avisar os técnicos afetados" })).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: /^Montagem de móveis:/ })[0]);
    const sec = screen.getByRole("region", { name: "As ligações da tarefa" });
    fireEvent.click(within(sec).getByRole("button", { name: /Depende de…/ }));
    fireEvent.click(within(within(sec).getByRole("group", { name: "Depende de" })).getByTitle(p.tasks[rev].nome));
    const previa = screen.getByRole("region", { name: "Antes de aplicar" });
    const aviso = within(previa).queryByRole("checkbox", { name: /Avisar o cliente/ }) as HTMLInputElement | null;
    if (aviso?.checked) fireEvent.click(aviso);
    fireEvent.click(within(previa).getByRole("button", { name: /Ligar e aplicar/ }));
    expect((p.avisos ?? []).length).toBe(n0); // ninguém avisado ainda
    let card = screen.getByRole("region", { name: "Avisar os técnicos afetados" });
    expect(within(card).getByText(/^Montagem de móveis: passa a /)).toBeTruthy();
    // anular a ligação tira a mudança da lista
    fireEvent.click(within(screen.getByRole("group", { name: "Anular e refazer" })).getByRole("button", { name: /^Anular: / }));
    // (a tarefa atrasada que a ligação prolongou já começou: o anular não lhe mexe, por isso pode ficar na lista)
    expect(screen.queryByRole("region", { name: "Avisar os técnicos afetados" })?.textContent ?? "").not.toMatch(/Montagem de móveis/);
    fireEvent.click(within(screen.getByRole("group", { name: "Anular e refazer" })).getByRole("button", { name: /^Refazer: / }));
    card = screen.getByRole("region", { name: "Avisar os técnicos afetados" });
    fireEvent.click(within(card).getByRole("button", { name: /^Avisar/ }));
    expect((p.avisos ?? []).some((a) => a.tec === tec && a.ti === mont && /^Montagem de móveis: passa a /.test(a.t))).toBe(true);
    expect(screen.queryByRole("region", { name: "Avisar os técnicos afetados" })).toBeNull();
    expect(x.d.hist[0].t).toMatch(/^Plano: técnicos avisados/);
  });
});

// 25/11 (agentes, etapa 2): com o Agente da Equipa no degrau 2 (o de origem), o aviso sai sozinho 2 minutos depois da última mudança
describe("o Agente da Equipa avisa sozinho", () => {
  it("o cartão diz a que horas sai; passados 2 minutos, os técnicos ficam avisados e a fita regista-o", async () => {
    const { vi } = await import("vitest");
    const { act } = await import("@testing-library/react");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const x = obraDeExemplo(), p = x.d.obra.plano!, A = acoes(x.S, () => {}, (fn) => fn());
      A.role("operacoes");
      const mont = p.tasks.findIndex((t) => t.nome === "Montagem de móveis"), rev = p.tasks.findIndex((t) => t.nome === "Revestimento de parede");
      p.tasks[mont].dia = p.tasks[rev].dia + 1;
      const ctx = { S: x.S, A, run: (fn: () => void) => fn(), go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
      const tec = p.tasks[mont].tec!;
      render(<EstudioObra ctx={ctx} d={x.d} fechar={() => {}} />);
      fireEvent.click(screen.getAllByRole("button", { name: /^Montagem de móveis:/ })[0]);
      const sec = screen.getByRole("region", { name: "As ligações da tarefa" });
      fireEvent.click(within(sec).getByRole("button", { name: /Depende de…/ }));
      fireEvent.click(within(within(sec).getByRole("group", { name: "Depende de" })).getByTitle(p.tasks[rev].nome));
      const previa = screen.getByRole("region", { name: "Antes de aplicar" });
      const aviso = within(previa).queryByRole("checkbox", { name: /Avisar o cliente/ }) as HTMLInputElement | null;
      if (aviso?.checked) fireEvent.click(aviso);
      fireEvent.click(within(previa).getByRole("button", { name: /Ligar e aplicar/ }));
      const card = screen.getByRole("region", { name: "Avisar os técnicos afetados" });
      expect(within(card).getByText(/O Agente da Equipa avisa sozinho às/)).toBeTruthy();
      await act(async () => { vi.advanceTimersByTime(121000); });
      expect((p.avisos ?? []).some((a) => a.tec === tec && a.ti === mont)).toBe(true);
      expect(x.d.obra.agentes?.feitos?.[0]).toMatchObject({ agente: "equipa", auto: true });
    } finally { vi.useRealTimers(); }
  });
});
