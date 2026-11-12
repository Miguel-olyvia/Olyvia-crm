// 12/11: os ecrãs da agenda dos técnicos: o cartão da agenda no orçamento (bloqueia e sugere dias) e a sugestão de datas no fim da visita.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TECS, acoes, seed, type Estado, type Negocio, type Plano } from "./motor";
import { AgendaDaPropostaCartao } from "./AgendaDaProposta";
import { SugestaoDatasObra } from "./SugestaoDatasObra";
import type { PlanoDatas } from "./planoDaVisita";

afterEach(cleanup);

const INICIO = "2027-03-01";
function montar(cheio: boolean) {
  const S = seed();
  const d = S.deals.find((x) => x.id === 1031) as Negocio;
  d.orc!.enviada = null; d.orc!.aceite = null; d.fase = 3; d.orc!.inicioObra = INICIO; d.f.inicio_prev = INICIO;
  if (cheio) {
    const outro = S.deals.find((x) => x.id !== d.id && x.obra)!;
    outro.perdido = false;
    outro.obra.plano = { tasks: TECS.map((t) => ({ nome: "Outra", svcs: [], dia: 0, dur: 10, sk: t.sk, h: 80, tec: t.id })), estado: "aprovado", dia: 0, origem: "orcamento", inicio: INICIO } as Plano;
  }
  S.role = "comercial";
  const A = acoes(S, () => {}, (fn) => fn());
  return { S, d, A };
}
function desenhar(S: Estado, d: Negocio, A: ReturnType<typeof acoes>) {
  const run = (fn: () => void) => { fn(); r.rerender(<AgendaDaPropostaCartao S={S} A={A} run={run} d={d} />); };
  const r = render(<AgendaDaPropostaCartao S={S} A={A} run={run} d={d} />);
  return r;
}

describe("o cartão da agenda no orçamento", () => {
  it("com todos livres, diz que estão livres", () => {
    const { S, d, A } = montar(false);
    desenhar(S, d, A);
    expect(screen.getByText(/Técnicos livres para a obra/)).toBeTruthy();
  });
  it("com os técnicos noutra obra, diz quem e porquê, e um dia sugerido resolve num toque", () => {
    const { S, d, A } = montar(true);
    desenhar(S, d, A);
    expect(screen.getByText(/A proposta não sai sem os técnicos livres/)).toBeTruthy();
    expect(screen.getAllByText(/noutra obra/).length).toBeGreaterThan(0);
    const dias = screen.getByRole("group", { name: /Dias de início com todos os técnicos livres/ });
    const b = dias.querySelector("button")!;
    fireEvent.click(b);
    expect(d.orc!.inicioObra).not.toBe(INICIO);
    expect(screen.getByText(/Técnicos livres para a obra/)).toBeTruthy();
  });
});

describe("a sugestão de datas no fim da visita", () => {
  const P = (iso: string, ocupado: boolean) => ({
    tarefas: [{ chave: "1:Canalização", h: 8, dur: 1, ocupado: ocupado ? "noutra obra" : undefined }],
    inicio: new Date(`${iso}T12:00:00`), fim: new Date(`${iso}T12:00:00`), dias: 1, porAtribuir: 0,
    equipa: [{ id: "t1", n: "Diogo Pereira", oficio: "Canalizador" }], equipas: [],
  } as unknown as PlanoDatas);
  it("mostra os dias com a equipa livre, com quem vem, e escolher muda o início", () => {
    const amanha = new Date(); amanha.setDate(amanha.getDate() + 1);
    let escolhido = "";
    // ocupado nos primeiros dias úteis: a sugestão salta-os
    const ocupados = new Set<string>();
    render(<SugestaoDatasObra P={P("2099-01-01", true)} inicio="2099-01-01" calcular={(iso) => { const o = ocupados.size < 2 && !ocupados.has(iso) ? (ocupados.add(iso), true) : ocupados.has(iso); return P(iso, o); }} mudarInicio={(iso) => { escolhido = iso; }} />);
    expect(screen.getByText(/A Olyvia sugere/)).toBeTruthy();
    expect(screen.getByText(/1 tarefa fica com o técnico ocupado/)).toBeTruthy();
    const botoes = screen.getAllByRole("button", { name: /Começar a/ });
    expect(botoes.length).toBe(3);
    expect(screen.getAllByText("Diogo").length).toBe(3);
    fireEvent.click(botoes[0]);
    expect(escolhido > new Date().toISOString().slice(0, 10)).toBe(true);
  });
});
