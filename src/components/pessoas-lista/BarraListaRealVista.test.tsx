import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BarraListaReal } from "./BarraListaReal";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());

const base = {
  pesquisa: "", papel: null, etapa: null, ordem: "recentes" as const,
  aoMudarPesquisa: vi.fn(), aoMudarPapel: vi.fn(), aoMudarEtapa: vi.fn(), aoMudarOrdem: vi.fn(),
};

describe("BarraListaReal: o seletor de vista", () => {
  it("sem aoMudarVista não há seletor (a Lista de sempre)", () => {
    render(<BarraListaReal {...base} />);
    expect(screen.queryByRole("group", { name: "Vista" })).toBeNull();
  });

  it("com aoMudarVista mostra Lista e Quadro, o escolhido premido, e muda de vista", () => {
    const aoMudarVista = vi.fn();
    render(<BarraListaReal {...base} vista="lista" aoMudarVista={aoMudarVista} />);
    expect(screen.getByRole("button", { name: "Lista" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Quadro" }));
    expect(aoMudarVista).toHaveBeenCalledWith("quadro");
  });

  it("no Quadro esconde os filtros de etapa, mas mantém pesquisa, tipo e ordem", () => {
    render(<BarraListaReal {...base} vista="quadro" aoMudarVista={vi.fn()} />);
    expect(screen.queryByRole("group", { name: "Filtrar por etapa" })).toBeNull();
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Tipo de pessoa" })).toBeInTheDocument();
    expect(screen.getByLabelText("Ordenar por")).toBeInTheDocument();
  });

  it("na Lista o filtro de etapa continua lá", () => {
    render(<BarraListaReal {...base} vista="lista" aoMudarVista={vi.fn()} />);
    expect(screen.getByRole("group", { name: "Filtrar por etapa" })).toBeInTheDocument();
  });

  it("em modo real o chip da primeira etapa chama-se «Novo»; sem isso mantém «Por contactar»", () => {
    const { unmount } = render(<BarraListaReal {...base} etapaNova="Novo" />);
    expect(screen.getByRole("button", { name: "Novo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Por contactar" })).toBeNull();
    unmount();
    render(<BarraListaReal {...base} />);
    expect(screen.getByRole("button", { name: "Por contactar" })).toBeInTheDocument();
  });
});
