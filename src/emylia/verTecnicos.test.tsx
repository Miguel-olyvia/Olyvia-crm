// 12/11 (Rúben: «o super admin precisa de, no menu inicial, conseguir ver a screen de todos os técnicos sem fazer login na conta deles»)
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { TECS, acoes, seed, type Estado } from "./motor";
import { trabalhoDoTecnico, tecnicosComTrabalho } from "./trabalhoObra";
import { HojeTecnico } from "./HojeTecnico";
import type { Ctx } from "./pecas";

afterEach(cleanup);

function montar(tec?: string) {
  const S: Estado = seed();
  S.role = "tecnico";
  if (tec) S.tec = tec;
  const A = acoes(S, () => {}, (fn) => fn());
  const escolher = vi.fn();
  const ctx: Ctx = { S, A, run: (fn) => fn(), go: (fn) => () => fn(), q: "", verTecnicos: { escolher } };
  render(<HojeTecnico {...ctx} />);
  return { S, escolher };
}

describe("o ecrã de cada técnico (/tecnicos, super admin)", () => {
  it("mostra todos os técnicos, os que têm trabalho hoje primeiro, com as tarefas de hoje", () => {
    const { S } = montar();
    const lista = within(screen.getByRole("region", { name: "O ecrã de cada técnico" }));
    const botoes = lista.getAllByRole("button");
    expect(botoes).toHaveLength(TECS.length);
    const comTrabalho = tecnicosComTrabalho(S.deals);
    expect(comTrabalho.length).toBeGreaterThan(0);
    // o primeiro tem trabalho hoje e diz quantas tarefas
    const n = trabalhoDoTecnico(S.deals, TECS.find((x) => botoes[0].textContent?.includes(x.n))!.id).length;
    expect(n).toBeGreaterThan(0);
    expect(botoes[0].textContent).toMatch(new RegExp(`${n} tarefas? hoje`));
  });

  it("escolher um técnico pede-o (vai para o endereço); o escolhido fica marcado, com o aviso de que se vê o ecrã dele", () => {
    const outro = TECS[TECS.length - 1];
    const { escolher } = montar(outro.id);
    const lista = within(screen.getByRole("region", { name: "O ecrã de cada técnico" }));
    const dele = lista.getByRole("button", { name: new RegExp(outro.n) });
    expect(dele.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("note").textContent).toContain(`Está a ver o ecrã de ${outro.n}`);
    // o ecrã é o dele: a saudação tem o nome dele
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(outro.n.split(" ")[0]);
    const primeiro = lista.getAllByRole("button").find((b) => b !== dele)!;
    fireEvent.click(primeiro);
    expect(escolher).toHaveBeenCalledTimes(1);
    expect(TECS.some((x) => x.id === escolher.mock.calls[0][0])).toBe(true);
  });

  it("sem o modo do super admin, o Hoje do técnico continua igual (sem a lista)", () => {
    const S: Estado = seed(); S.role = "tecnico";
    const A = acoes(S, () => {}, (fn) => fn());
    render(<HojeTecnico S={S} A={A} run={(fn) => fn()} go={(fn) => () => fn()} q="" />);
    expect(screen.queryByRole("region", { name: "O ecrã de cada técnico" })).toBeNull();
  });
});
