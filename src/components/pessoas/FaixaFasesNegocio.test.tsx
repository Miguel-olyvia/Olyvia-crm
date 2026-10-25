// A faixa de progresso das fases do negócio: segmentos só visuais e um texto «Fase X de N · depois: Y» para quem lê.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { FaseDoNegocio } from "./fasesDoNegocio";
import { FaixaFasesNegocio } from "./FaixaFasesNegocio";

vi.mock("@/hooks/useTranslation", () => import("@/test/traducoesPessoasTeste").then((m) => m.moduloDeTraducao()));
afterEach(() => cleanup());

const f = (id: FaseDoNegocio["id"], estado: FaseDoNegocio["estado"]): FaseDoNegocio => ({ id, estado });

describe("FaixaFasesNegocio", () => {
  it("diz a fase atual e a seguinte", () => {
    render(<FaixaFasesNegocio fases={[f("contacto", "feita"), f("levantamento", "feita"), f("orcamento", "atual"), f("proposta", "porFazer"), f("contrato", "porFazer")]} />);
    expect(screen.getByText("Fase 3 de 5 · depois: Proposta")).toBeInTheDocument();
  });

  it("na última fase não há «depois»", () => {
    render(<FaixaFasesNegocio fases={[f("orcamento", "feita"), f("proposta", "feita"), f("contrato", "atual")]} />);
    expect(screen.getByText("Fase 3 de 3")).toBeInTheDocument();
  });

  it("um negócio perdido diz onde está e não diz «depois»", () => {
    render(<FaixaFasesNegocio fases={[f("orcamento", "feita"), f("proposta", "perdida"), f("contrato", "porFazer")]} />);
    expect(screen.getByText("Fase 2 de 3")).toBeInTheDocument();
    expect(screen.queryByText(/depois/)).toBeNull();
  });

  it("os segmentos são só visuais (aria-hidden), um por fase", () => {
    const { container } = render(<FaixaFasesNegocio fases={[f("orcamento", "feita"), f("proposta", "atual"), f("contrato", "porFazer")]} />);
    const faixa = container.querySelector('[aria-hidden="true"]');
    expect(faixa?.children).toHaveLength(3);
  });

  it("um negócio ganho (sem fase atual) não mostra texto de fase", () => {
    render(<FaixaFasesNegocio fases={[f("contrato", "feita"), f("ganho", "feita")]} />);
    expect(screen.queryByText(/Fase \d/)).toBeNull();
  });

  it("sem fases não desenha nada", () => {
    const { container } = render(<FaixaFasesNegocio fases={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
