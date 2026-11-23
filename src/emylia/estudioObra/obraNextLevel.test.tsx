// 23/11 (Rúben: «procura melhorias no estúdio da obra para o deixar mega next-level»): o cabeçalho com um número herói, a obra antes do
// arranque, a curva S, os materiais numa lista só, o 3D pelo tempo, o diário, o cliente, o fecho e o telemóvel.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { acoes } from "../motor";
import type { Ctx } from "../pecas";
import { EstudioObra } from "./EstudioObra";
import { obraDeExemplo } from "./exemploObra";

afterEach(cleanup);

export function montarObra(x = obraDeExemplo()) {
  const A = acoes(x.S, () => {}, (fn) => fn());
  const ctx = { S: x.S, A, run: (fn: () => void) => fn(), go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
  render(<EstudioObra ctx={ctx} d={x.d} fechar={() => {}} />);
  return { ...x, A };
}
/** A obra de exemplo arrancada mas sem nada começado: a primeira tarefa daqui a 3 dias úteis. */
export function obraPorComecar() {
  const x = obraDeExemplo(), p = x.d.obra.plano!;
  for (const t of p.tasks) { delete t.exec; delete t.bloqueio; t.dia += 3; }
  p.dia = 0;
  return x;
}

describe("1. o cabeçalho com um número herói", () => {
  it("em curso: o dia da obra e o feito; o fim provável contra o do contrato; a margem com o desvio", () => {
    montarObra();
    const pulso = screen.getByRole("region", { name: "O pulso da obra" });
    expect(within(pulso).getByRole("button", { name: /^Feito: \d+%, dia 5 de \d+$/ })).toBeTruthy();
    const fim = within(pulso).getByRole("button", { name: /Fim provável/ });
    expect(fim.textContent).toMatch(/contrato/);
    expect(within(pulso).getByRole("button", { name: /Margem ao vivo/ }).textContent).toMatch(/orçamento/i);
  });
  it("antes do arranque: a contagem até à primeira tarefa, com o dia e quem a faz", () => {
    const x = obraPorComecar();
    montarObra(x);
    const pulso = screen.getByRole("region", { name: "O pulso da obra" });
    const heroi = within(pulso).getByRole("button", { name: /^Começa daqui a 3 dias úteis/ });
    expect(heroi.textContent).toMatch(/3 dias úteis/);
  });
});
