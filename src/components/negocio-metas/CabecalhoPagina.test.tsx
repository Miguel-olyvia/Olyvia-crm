import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CabecalhoPagina } from "./CabecalhoPagina";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());

const desenhar = (aviso?: string | null) =>
  render(<MemoryRouter><CabecalhoPagina subtitulo="sub" titulo="Título" aviso={aviso} /></MemoryRouter>);

describe("CabecalhoPagina: aviso de exemplo", () => {
  it("sem aviso (não passado) mostra o aviso de exemplo de Negócio e metas", () => {
    desenhar();
    expect(screen.getByRole("note")).toHaveTextContent(/exemplo/i);
  });

  it("com um texto mostra esse texto", () => {
    desenhar("Dados de teste");
    expect(screen.getByRole("note")).toHaveTextContent("Dados de teste");
  });

  it("aviso={null} esconde o aviso", () => {
    desenhar(null);
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.getByText("sub")).toBeInTheDocument();
  });
});
