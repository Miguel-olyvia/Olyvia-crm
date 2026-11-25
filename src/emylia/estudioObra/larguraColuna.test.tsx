// 25/11 (Rúben, no Gantt do plano vivo): «permitir expandir a width da primeira coluna». Os nomes das tarefas cortavam-se.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { acoes } from "../motor";
import type { Ctx } from "../pecas";
import { EstudioObra } from "./EstudioObra";
import { obraDeExemplo } from "./exemploObra";
import { COLUNA_MAX, COLUNA_MIN, limitarColuna } from "./larguraColuna";

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

function montar() {
  const x = obraDeExemplo();
  const A = acoes(x.S, () => {}, (fn) => fn());
  const ctx = { S: x.S, A, run: (fn: () => void) => fn(), go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
  render(<EstudioObra ctx={ctx} d={x.d} fechar={() => {}} />);
  const plano = screen.getByRole("region", { name: "O plano vivo" });
  return { plano, pegador: within(plano).getByRole("separator", { name: "Largura da coluna Tarefa" }) };
}

describe("a 1.ª coluna do plano vivo alarga-se", () => {
  it("arrastar o pegador muda a largura do cabeçalho e das linhas, e fica guardada", () => {
    const { plano, pegador } = montar();
    const cab = pegador.parentElement as HTMLElement;
    expect(cab.className).toContain("w-32"); // por omissão, a largura de origem
    fireEvent.pointerDown(pegador, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(pegador, { clientX: 400, pointerId: 1 });
    fireEvent.pointerUp(pegador, { clientX: 400, pointerId: 1 });
    // em jsdom a largura medida é 0: 0 + 300
    expect(cab.style.width).toBe("300px");
    expect(cab.className).not.toContain("w-32");
    const linhas = within(plano).getAllByRole("rowgroup")[0].querySelectorAll<HTMLElement>(".sticky");
    expect([...linhas].every((l) => l.style.width === "300px")).toBe(true);
    expect(window.localStorage.getItem("olyvia.planoVivo.coluna.gantt")).toBe("300");
  });

  it("volta com a largura guardada; duplo clique repõe a de origem", () => {
    window.localStorage.setItem("olyvia.planoVivo.coluna.gantt", "360");
    const { pegador } = montar();
    const cab = pegador.parentElement as HTMLElement;
    expect(cab.style.width).toBe("360px");
    fireEvent.doubleClick(pegador);
    expect(cab.style.width).toBe("");
    expect(cab.className).toContain("w-32");
    expect(window.localStorage.getItem("olyvia.planoVivo.coluna.gantt")).toBeNull();
  });

  it("pelo teclado: setas alargam e estreitam, End vai ao máximo", () => {
    const { pegador } = montar();
    const cab = pegador.parentElement as HTMLElement;
    fireEvent.keyDown(pegador, { key: "End" });
    expect(cab.style.width).toBe(`${COLUNA_MAX}px`);
    fireEvent.keyDown(pegador, { key: "Home" });
    expect(cab.style.width).toBe(`${COLUNA_MIN}px`);
  });

  it("os limites", () => {
    expect(limitarColuna(10)).toBe(COLUNA_MIN);
    expect(limitarColuna(9999)).toBe(COLUNA_MAX);
    expect(limitarColuna(300.4)).toBe(300);
  });
});
