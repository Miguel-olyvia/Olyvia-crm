// A barra de fases e a lista de verificação do guia: o que se vê não pode depender só da cor (WCAG 1.4.1) e os círculos «por fazer» têm de ter
// contraste suficiente com o cartão (1.4.11). O jsdom não calcula cores: o que se mede aqui são os tokens usados.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { BarraFasesGuia, ChecklistDoPasso } from "./GuiaPecas";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());

afterEach(cleanup);

const segmento = (li: HTMLElement) => li.querySelector<HTMLElement>("div[aria-hidden='true']") as HTMLElement;
const comClasse = (el: HTMLElement, c: string) => el.className.split(/\s+/).includes(c);

describe("a barra de fases", () => {
  const fases = [
    { id: "a", rotuloChave: "pessoasPagina.phases.contacto", estado: "feita" as const },
    { id: "b", rotuloChave: "pessoasPagina.phases.visita", estado: "atual" as const },
    { id: "c", rotuloChave: "pessoasPagina.phases.levantamento", estado: "porFazer" as const },
  ];

  it("a fase atual não tem o mesmo segmento que a feita (distingue-se também na barra, não só no negrito)", () => {
    render(<BarraFasesGuia fases={fases} />);
    const itens = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(segmento(itens[0]).className).not.toBe(segmento(itens[1]).className);
    expect(comClasse(segmento(itens[0]), "bg-primary")).toBe(true);
    expect(comClasse(segmento(itens[2]), "bg-primary")).toBe(false);
  });

  it("o texto e aria-current continuam a marcar a atual", () => {
    render(<BarraFasesGuia fases={fases} />);
    const itens = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(itens[1]).toHaveAttribute("aria-current", "step");
    expect(itens[0]).not.toHaveAttribute("aria-current");
    expect(itens[1]).toHaveTextContent(/atual/);
  });
});

describe("a lista de verificação", () => {
  it("o círculo «por fazer» usa um token com contraste (não a cor das divisórias)", () => {
    render(<ChecklistDoPasso rotulo="Por contactar" itens={[{ id: "1", rotuloChave: "pessoasPagina.phases.contacto", feito: false }]} />);
    const circulo = screen.getByRole("listitem").querySelector<HTMLElement>("span[aria-hidden='true']") as HTMLElement;
    expect(comClasse(circulo, "border-muted-foreground")).toBe(true);
    expect(comClasse(circulo, "border-border")).toBe(false);
  });

  it("o círculo «feito» continua preenchido", () => {
    render(<ChecklistDoPasso rotulo="Por contactar" itens={[{ id: "1", rotuloChave: "pessoasPagina.phases.contacto", feito: true }]} />);
    const circulo = screen.getByRole("listitem").querySelector<HTMLElement>("span[aria-hidden='true']") as HTMLElement;
    expect(comClasse(circulo, "bg-primary")).toBe(true);
  });
});
