import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { PerguntasNoEstudio } from "./PerguntasNoEstudio";
import { PROJETO_EXEMPLO } from "./exemploEstudio";
import type { Projeto } from "./necessidadesEstudio";

function Ecra({ inicio }: { inicio: Projeto }) {
  const [p, setP] = useState(inicio);
  return <PerguntasNoEstudio p={p} setP={setP} />;
}

describe("as perguntas para fechar a visita", () => {
  it("o «+» dos pontos elétricos conta e o campo fica à vista (antes, ao primeiro toque, saía da lista)", () => {
    render(<Ecra inicio={{ ...PROJETO_EXEMPLO, negocio: 3, perguntas: {} }} />);
    const mais = screen.getByRole("button", { name: "Mais: Pontos elétricos" });
    fireEvent.click(mais);
    expect(screen.getByRole("status", { name: "Pontos elétricos" })).toHaveTextContent("1");
    fireEvent.click(screen.getByRole("button", { name: "Mais: Pontos elétricos" }));
    fireEvent.click(screen.getByRole("button", { name: "Mais: Pontos elétricos" }));
    expect(screen.getByRole("status", { name: "Pontos elétricos" })).toHaveTextContent("3");
    fireEvent.click(screen.getByRole("button", { name: "Menos: Pontos elétricos" }));
    expect(screen.getByRole("status", { name: "Pontos elétricos" })).toHaveTextContent("2");
  });

  it("uma escolha fica marcada no sítio; as que já vinham respondidas ficam dobradas", () => {
    render(<Ecra inicio={{ ...PROJETO_EXEMPLO, negocio: 3, perguntas: { diag_gas: "Não há" } }} />);
    expect(screen.getByText(/1 já vinham respondidas/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Varanda" }));
    expect(screen.getByRole("button", { name: "Varanda" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("progressbar", { name: "Respostas" })).toHaveAttribute("aria-valuenow", "2");
  });
});
