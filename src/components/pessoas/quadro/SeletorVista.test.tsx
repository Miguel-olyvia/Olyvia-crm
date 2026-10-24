import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CHAVE_PREFS_PESSOAS, lerPrefsPessoas } from "../preferenciasPessoas";
import { usePessoasEstado } from "../usePessoasEstado";
import { SeletorVista } from "./SeletorVista";

vi.mock("@/hooks/useTranslation", async () => {
  const { pessoasPaginaTranslations } = await import("@/translations/pessoasPagina");
  return { useTranslation: () => ({ language: "pt", t: (key: string) => pessoasPaginaTranslations.pt[key] ?? key }) };
});

beforeEach(() => window.localStorage.clear());

describe("SeletorVista", () => {
  it("é um grupo de 2 botões Lista e Quadro, com aria-pressed no escolhido", () => {
    render(<SeletorVista vista="lista" aoMudar={vi.fn()} />);
    expect(screen.getByRole("group", { name: "Vista" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Lista" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Quadro" })).toHaveAttribute("aria-pressed", "false");
  });

  it("o escolhido leva uma marca além da cor, e os botões levam a classe min-h-11 (não se mede o tamanho em px)", () => {
    const { container } = render(<SeletorVista vista="quadro" aoMudar={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Quadro" })).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    for (const b of screen.getAllByRole("button")) expect(b.className).toContain("min-h-11");
  });

  it("clicar no outro botão pede a vista nova", () => {
    const aoMudar = vi.fn();
    render(<SeletorVista vista="lista" aoMudar={aoMudar} />);
    fireEvent.click(screen.getByRole("button", { name: "Quadro" }));
    expect(aoMudar).toHaveBeenCalledExactlyOnceWith("quadro");
  });
});

function Arnes() {
  const estado = usePessoasEstado(false);
  return <SeletorVista vista={estado.prefs.vista} aoMudar={estado.mudarVista} />;
}

describe("SeletorVista ligado ao estado da página", () => {
  it("alterna, persiste em localStorage e volta a abrir na vista escolhida", () => {
    const { unmount } = render(<Arnes />);
    expect(screen.getByRole("button", { name: "Lista" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Quadro" }));
    expect(screen.getByRole("button", { name: "Quadro" })).toHaveAttribute("aria-pressed", "true");
    expect(JSON.parse(window.localStorage.getItem(CHAVE_PREFS_PESSOAS) ?? "{}")).toMatchObject({ vista: "quadro" });
    expect(lerPrefsPessoas().vista).toBe("quadro");
    unmount();

    render(<Arnes />);
    expect(screen.getByRole("button", { name: "Quadro" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Lista" }));
    expect(lerPrefsPessoas().vista).toBe("lista");
  });
});
