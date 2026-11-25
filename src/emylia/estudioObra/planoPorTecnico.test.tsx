// 25/11 (Rúben, na vista «Por técnico» do plano vivo): «é difícil de perceber onde corta para o técnico de baixo».
// Cada técnico é um bloco; as outras obras dele ficam numa sub-faixa com rótulo, dentro do bloco dele.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { acoes } from "../motor";
import type { Ctx } from "../pecas";
import { EstudioObra } from "./EstudioObra";
import { obraDeExemplo } from "./exemploObra";

afterEach(cleanup);

/** A obra de exemplo, com o montador também noutra obra (a 1022) no primeiro dia da montagem desta. */
function montarComOutraObra() {
  const x = obraDeExemplo();
  const p = x.d.obra.plano!, mont = p.tasks[p.tasks.length - 1];
  const op = x.S.deals.find((o) => o.id === 1022)!.obra.plano!;
  const ult = op.tasks[op.tasks.length - 1];
  ult.dia = mont.dia; ult.dur = 1; ult.tec = mont.tec;
  const A = acoes(x.S, () => {}, (fn) => fn());
  const ctx = { S: x.S, A, run: (fn: () => void) => fn(), go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
  render(<EstudioObra ctx={ctx} d={x.d} fechar={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /Por técnico/ }));
  return { tec: mont.tec!, plano: screen.getByRole("region", { name: "O plano vivo" }) };
}

describe("a vista «Por técnico» do plano vivo", () => {
  it("cada técnico é um bloco, com fundo alternado, onde se pode largar uma tarefa", () => {
    const { plano } = montarComOutraObra();
    const blocos = within(plano).getAllByRole("group").filter((g) => g.hasAttribute("data-tec"));
    expect(blocos.length).toBeGreaterThan(1);
    expect(blocos[0].style.background).not.toBe(blocos[1].style.background);
  });

  it("as outras obras do técnico ficam dentro do bloco dele, numa sub-faixa com rótulo", () => {
    const { tec, plano } = montarComOutraObra();
    const outra = within(plano).getAllByRole("button", { name: /está noutra obra/ })[0];
    const bloco = outra.closest("[data-tec]") as HTMLElement;
    expect(bloco.getAttribute("data-tec")).toBe(tec);
    expect(within(bloco).getByText("Outras obras")).toBeTruthy();
    // por baixo das tarefas desta obra, nunca encostada ao bloco seguinte
    const top = parseFloat(outra.style.top);
    const area = outra.parentElement as HTMLElement;
    expect(top).toBeGreaterThan(0);
    expect(top + 24).toBeLessThan(parseFloat(area.style.height));
  });
});
