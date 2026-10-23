// As fases de um negócio na ficha: uma lista com o nome de cada fase e o seu estado dito por texto (para o leitor de ecrã); a atual leva
// aria-current="step"; só aparecem as fases que lhe passam.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { FaseDoNegocio } from "./fasesDoNegocio";
import { FasesDoNegocioLista } from "./FasesDoNegocioLista";

vi.mock("@/hooks/useTranslation", () => import("@/test/traducoesPessoasTeste").then((m) => m.moduloDeTraducao()));
afterEach(() => cleanup());

const FASES: FaseDoNegocio[] = [
  { id: "contacto", estado: "feita" },
  { id: "visita", estado: "feita" },
  { id: "orcamento", estado: "feita" },
  { id: "proposta", estado: "atual" },
  { id: "contrato", estado: "porFazer" },
];

describe("FasesDoNegocioLista", () => {
  it("lista as fases pela ordem, só as que recebe", () => {
    render(<FasesDoNegocioLista fases={FASES} />);
    const itens = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(itens.map((i) => i.textContent)).toEqual([
      "Contacto, concluída", "Visita, concluída", "Orçamento, concluída", "Proposta, atual", "Contrato, por fazer",
    ]);
  });

  it("a fase atual leva aria-current, e as outras não", () => {
    render(<FasesDoNegocioLista fases={FASES} />);
    const atuais = screen.getAllByRole("listitem").filter((i) => i.getAttribute("aria-current") === "step");
    expect(atuais.map((i) => i.textContent)).toEqual(["Proposta, atual"]);
  });

  it("onde se perdeu diz «perdida», e um negócio ganho acaba em «Ganho»", () => {
    const { unmount } = render(<FasesDoNegocioLista fases={[{ id: "orcamento", estado: "feita" }, { id: "proposta", estado: "perdida" }, { id: "contrato", estado: "porFazer" }]} />);
    expect(screen.getByText("Proposta").closest("li")).toHaveTextContent("Proposta, perdida");
    unmount();
    render(<FasesDoNegocioLista fases={[{ id: "contrato", estado: "feita" }, { id: "ganho", estado: "feita" }]} />);
    expect(screen.getByText("Ganho").closest("li")).toHaveTextContent("Ganho, concluída");
  });
});
