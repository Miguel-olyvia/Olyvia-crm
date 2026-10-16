// Robô Q2 (16/10): quando o portão aponta uma falta, todos os tipos de pergunta ficam marcados (aria-invalid), não só pela cor,
// para o leitor de ecrã o dizer e a validação (R6) levar lá o foco. O contador e as datas rápidas só tinham a borda vermelha.
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Campos } from "./CamposFase";
import { acoes, seed } from "./motor";
import type { Grupo } from "./campos";

afterEach(() => cleanup());

const GRUPO: Grupo = {
  titulo: "Teste das faltas",
  campos: [
    { k: "t_andares", l: "Andares do prédio", t: "contador" },
    { k: "t_dia", l: "Dia da visita", t: "data" },
  ],
} as Grupo;

function montar(validar: boolean) {
  const S = seed(), d = S.deals[0];
  d.valida = validar ? { fase: d.fase, grupos: [GRUPO.titulo] } : null;
  const run = (fn: () => void) => fn();
  render(<Campos grupo={GRUPO} d={d} A={acoes(S, vi.fn(), run)} run={run} simples />);
}

describe("perguntas em falta marcadas para todos", () => {
  it("o contador em falta marca o 'Mais' (o primeiro toque que responde)", () => {
    montar(true);
    const g = screen.getByRole("group", { name: "Andares do prédio" });
    expect(within(g).getByRole("button", { name: "Mais" })).toHaveAttribute("aria-invalid", "true");
  });

  it("a data em falta marca as datas rápidas", () => {
    montar(true);
    const g = screen.getByRole("group", { name: "Dia da visita" });
    for (const b of within(g).getAllByRole("button").filter((x) => x.textContent !== "Outra data")) expect(b).toHaveAttribute("aria-invalid", "true");
  });

  it("sem validação a correr, nada fica marcado", () => {
    montar(false);
    expect(document.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0);
  });
});
