// 26/11 (plano «Obra Viva», etapa 6: falar com a obra). A voz sabe o que os agentes veem em todas as obras e decide por quem fala,
// pelas mesmas ações da fita: «o que se passa na obra?», «aceita essa», «recusa», «desfaz», «resumo do dia».
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { acoes } from "../motor";
import { obraDeExemplo } from "./exemploObra";
import { abrirObraPorVoz, decidirPorVoz, obrasParaVoz, registarAgentesVoz } from "./agentesPorVoz";

type Corpo = { frase: string; obras?: ReturnType<typeof obrasParaVoz> };
const g = vi.hoisted(() => ({ invoke: null as null | ((nome: string, o: { body: Corpo }) => Promise<unknown>) }));
vi.mock("../gravador", () => ({ useGravacao: () => ({ estado: "parado", falas: [] }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: (n: string, o: { body: Corpo }) => (g.invoke ? g.invoke(n, o) : Promise.resolve({ data: null, error: new Error("sem função") })) } } }));

import { OlyviaComando, avisoMs } from "../OlyviaComando";

function montar() {
  const { S, d } = obraDeExemplo();
  const A = acoes(S, () => {}, (fn) => fn());
  A.role("operacoes");
  const ref = { current: { S, A, run: (fn: () => void) => fn() } };
  const sair = registarAgentesVoz(ref);
  return { S, d, A, sair };
}
let sair: (() => void) | null = null;
beforeEach(() => { localStorage.clear(); g.invoke = null; });
afterEach(() => { sair?.(); sair = null; cleanup(); vi.useRealTimers(); });

describe("o que a voz sabe das obras", () => {
  it("cada obra em curso com as propostas (a referência, o modo, se se aceita com um sim) e o que os agentes fizeram hoje", () => {
    const m = montar(); sair = m.sair;
    const O = obrasParaVoz();
    const o = O.find((x) => x.id === m.d.id)!;
    expect(o.estado).toBe("em curso");
    expect(o.propostas.length).toBeGreaterThan(0);
    const folga = o.propostas.find((x) => x.ref === `${m.d.id}:folga`)!;
    expect(folga).toMatchObject({ agente: "Plano", modo: "prazo", aceitar: true });
    expect(folga.sub).toMatch(/Proposta: Adiantar 1 tarefa com a folga/);
    expect(o.propostas.find((x) => x.ref.includes(":atraso-"))?.aceitar).toBe(false); // empurra o fim: decide-se no cartão
    expect(o.feitos).toEqual([]);
  });
  it("sem a página dos Negócios não há obras (a voz vai lá primeiro)", () => {
    expect(obrasParaVoz()).toEqual([]);
    expect(decidirPorVoz("1027:folga", "aceitar").ok).toBe(false);
  });
});

describe("decidir por voz", () => {
  it("aceitar aplica pela fita (fica em «feito hoje»); desfazer repõe e põe o agente em pausa", () => {
    const m = montar(); sair = m.sair;
    const p = m.d.obra.plano!, antes = p.tasks.map((t) => [t.dia, t.dur]);
    const r = decidirPorVoz(`${m.d.id}:folga`, "aceitar");
    expect(r).toMatchObject({ ok: true });
    expect(r.texto).toMatch(/^Feito: Adiantar 1 tarefa/);
    expect(p.tasks.map((t) => [t.dia, t.dur])).not.toEqual(antes);
    const feito = obrasParaVoz().find((x) => x.id === m.d.id)!.feitos[0];
    expect(feito.quem).toMatch(/^aceite por/);
    const u = decidirPorVoz(feito.ref, "desfazer");
    expect(u.ok).toBe(true);
    expect(u.texto).toMatch(/em pausa/);
    expect(p.tasks.map((t) => [t.dia, t.dur])).toEqual(antes);
  });
  it("recusar tira a proposta; o que não se aceita com um sim diz para decidir no cartão; sem permissão, não faz", () => {
    const m = montar(); sair = m.sair;
    const at = obrasParaVoz().find((x) => x.id === m.d.id)!.propostas.find((x) => x.ref.includes(":atraso-"))!;
    expect(decidirPorVoz(at.ref, "aceitar")).toMatchObject({ ok: false, texto: expect.stringMatching(/no cartão/) });
    expect(decidirPorVoz(at.ref, "recusar")).toMatchObject({ ok: true });
    expect(obrasParaVoz().find((x) => x.id === m.d.id)!.propostas.some((x) => x.ref === at.ref)).toBe(false);
    expect(decidirPorVoz(`${m.d.id}:nao-existe`, "aceitar").texto).toMatch(/já não está na fita/);
    m.A.role("comercial");
    expect(decidirPorVoz(`${m.d.id}:folga`, "aceitar")).toMatchObject({ ok: false, texto: expect.stringMatching(/permissão/) });
  });
  it("abrir a obra abre o Estúdio dela nas Operações", () => {
    const m = montar(); sair = m.sair;
    expect(abrirObraPorVoz(m.d.id)).toBe(true);
    expect([m.S.view, m.S.op]).toEqual(["operacoes", m.d.id]);
    expect(abrirObraPorVoz(99999)).toBe(false);
  });
});

/** Escrever no painel da Olyvia (o mesmo caminho que a voz, sem o micro). */
async function pedir(frase: string) {
  fireEvent.click(screen.getByRole("button", { name: /Olyvia/ }));
  fireEvent.change(screen.getByLabelText("Comando"), { target: { value: frase } });
  await act(async () => { fireEvent.submit(screen.getByLabelText("Comando").closest("form")!); });
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
}

describe("pela Olyvia (a frase vai à IA com as obras)", () => {
  it("«aceita a da folga na obra do Tiago»: a IA recebe as obras e devolve a decisão, que se faz", async () => {
    vi.useFakeTimers();
    const m = montar(); sair = m.sair;
    const pedidos: Corpo[] = [];
    g.invoke = async (_n, o) => {
      pedidos.push(o.body);
      return { data: { acoes: [{ tipo: "decidir", texto: `${m.d.id}:folga`, op: "aceitar" }], resposta: "Aceito: adiantar a montagem com a folga.", continuar: false }, error: null };
    };
    render(<MemoryRouter initialEntries={["/negocios"]}><OlyviaComando /></MemoryRouter>);
    await pedir("aceita a da folga na obra do Tiago Almeida por favor");
    expect(pedidos[0].obras?.some((x) => x.id === m.d.id && x.propostas.some((y) => y.ref === `${m.d.id}:folga`))).toBe(true);
    expect(m.d.obra.agentes?.feitos?.[0]?.texto).toMatch(/^Adiantar 1 tarefa/);
    expect(screen.getByRole("status").textContent).toBe("Aceito: adiantar a montagem com a folga.");
  });
  it("uma decisão que já não dá diz porquê (nunca «feito»)", async () => {
    vi.useFakeTimers();
    const m = montar(); sair = m.sair;
    g.invoke = async () => ({ data: { acoes: [{ tipo: "decidir", texto: `${m.d.id}:folga-antiga`, op: "aceitar" }], resposta: "Aceitei.", continuar: false }, error: null });
    render(<MemoryRouter initialEntries={["/negocios"]}><OlyviaComando /></MemoryRouter>);
    await pedir("aceita aquela proposta da folga que estava ontem");
    expect(screen.getByRole("status").textContent).toMatch(/já não está na fita/);
  });
});

describe("a resposta fica o tempo de se ler", () => {
  it("as curtas 3,2 s; as compridas mais (o resumo do dia), nunca mais de 20 s", () => {
    expect(avisoMs("Abri a proposta.")).toBe(3200);
    expect(avisoMs("x".repeat(300))).toBe(18_000);
    expect(avisoMs("x".repeat(2000))).toBe(20_000);
  });
});
