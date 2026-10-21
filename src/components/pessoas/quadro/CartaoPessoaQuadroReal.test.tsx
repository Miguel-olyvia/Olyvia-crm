import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CartaoPessoaQuadro } from "./CartaoPessoaQuadro";
import { cartaoQuadro } from "@/components/pessoas-lista/fabricaQuadro";
import type { CartaoQuadro } from "./cartoesQuadroPessoas";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());

const mostrar = (sobre: Partial<CartaoQuadro>) =>
  render(<ul><CartaoPessoaQuadro cartao={cartaoQuadro("a", { tipo: "negocio", id: "n1", coluna: "proposta", trabalho: "Cozinha", valor: 100, passo: "esperarCliente", ...sobre })} hoje="2026-10-21" aoAbrir={vi.fn()} /></ul>);

describe("CartaoPessoaQuadro: os extras do Quadro real", () => {
  it("parado há N dias aparece em texto", () => {
    mostrar({ paradoDias: 12 });
    expect(screen.getByText("Parado há 12 d")).toBeInTheDocument();
  });

  it("um negócio sem título diz «Negócio»: nunca fica vazio nem mostra «null»", () => {
    const { container } = mostrar({ trabalho: null });
    expect(screen.getByText("Negócio")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("null");
  });

  it("sem paradoDias não há linha de parado", () => {
    mostrar({});
    expect(screen.queryByText(/Parado há/)).toBeNull();
  });

  it("o selo «Pronto a ganhar» aparece em texto, só com prontoAGanhar", () => {
    const { unmount } = mostrar({ prontoAGanhar: true, passo: "ganharNegocio" });
    expect(screen.getByText("Pronto a ganhar")).toBeInTheDocument();
    unmount();
    mostrar({});
    expect(screen.queryByText("Pronto a ganhar")).toBeNull();
  });
});
