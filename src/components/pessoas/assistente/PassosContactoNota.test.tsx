// A nota para a visita (Preparar a visita) tem o limite de 140 caracteres dito em texto, com um contador visível ligado ao campo.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { CorpoPreparar } from "./PassosContacto";
import type { PrepararVisita } from "./rascunhoAssistente";

vi.mock("@/hooks/useTranslation", () => import("@/test/traducoesPessoasTeste").then((m) => m.moduloDeTraducao()));
afterEach(cleanup);

function Ecra({ nota = "" }: { nota?: string }) {
  const [valor, setValor] = useState<PrepararVisita>({ duracao: "", quem: "", nota });
  return <CorpoPreparar valor={valor} aoMudar={(parcial) => setValor((v) => ({ ...v, ...parcial }))} />;
}

describe("o contador da nota", () => {
  it("mostra «0 de 140 caracteres» e o campo descreve-se por ele", () => {
    render(<Ecra />);
    const campo = screen.getByLabelText(/Nota para a visita/);
    const contador = screen.getByText("0 de 140 caracteres");
    expect(campo).toHaveAttribute("maxlength", "140");
    expect(campo.getAttribute("aria-describedby")).toContain(contador.id);
  });

  it("acompanha o que se escreve", () => {
    render(<Ecra />);
    fireEvent.change(screen.getByLabelText(/Nota para a visita/), { target: { value: "Levar escada" } });
    expect(screen.getByText("12 de 140 caracteres")).toBeInTheDocument();
  });

  it("uma nota já escrita (rascunho) mostra logo o seu tamanho", () => {
    render(<Ecra nota={"x".repeat(140)} />);
    expect(screen.getByText("140 de 140 caracteres")).toBeInTheDocument();
  });
});
