// O detalhe de um negócio dentro da ficha: «Perder negócio» num negócio em curso, «Anular perda» num negócio perdido, e nenhum dos dois num ganho.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { faseDoNegocio, isNegocioGanho } from "@/components/negocio-metas/negocioMetas";
import { DADOS_EXEMPLO, HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { negociosComPerdidos, alteracoesAtuais, perdaDoNegocio, perderNegocio, repor } from "@/components/negocio-metas/negociosAlterados";
import { repor as reporRegistos } from "@/components/negocio-metas/registosPessoa";
import { DetalheNegocioFicha } from "./DetalheNegocioFicha";

vi.mock("@/hooks/useTranslation", () => import("@/test/traducoesPessoasTeste").then((m) => m.moduloDeTraducao()));

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => { cleanup(); repor(); reporRegistos(); });

const emProposta = DADOS_EXEMPLO.negocios.find((n) => faseDoNegocio(n) === "proposta")!;
const ganho = DADOS_EXEMPLO.negocios.find(isNegocioGanho)!;

const abrir = (negocio: typeof emProposta) =>
  render(<MemoryRouter><DetalheNegocioFicha negocio={negocio} hoje={HOJE_EXEMPLO} noQuadro aoVoltar={vi.fn()} /></MemoryRouter>);

describe("DetalheNegocioFicha: perder e anular a perda", () => {
  it("um negócio em curso oferece «Perder negócio» e não «Anular perda»", () => {
    abrir(emProposta);
    expect(screen.getByRole("button", { name: "Perder negócio" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Anular perda" })).toBeNull();
  });

  it("perder com motivo deixa a ficha a mostrar «Perdido em Proposta» e «Anular perda» (e já não «Perder negócio»)", () => {
    const { rerender } = render(<MemoryRouter><DetalheNegocioFicha negocio={emProposta} hoje={HOJE_EXEMPLO} noQuadro aoVoltar={vi.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Perder negócio" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Motivo da perda" }), { target: { value: "Preço" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar a perda" }));
    expect(perdaDoNegocio(emProposta.id)?.fase).toBe("proposta");
    const [perdido] = negociosComPerdidos([emProposta], alteracoesAtuais());
    rerender(<MemoryRouter><DetalheNegocioFicha negocio={perdido} hoje={HOJE_EXEMPLO} noQuadro aoVoltar={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText("Perdido em Proposta: Preço")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anular perda" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Perder negócio" })).toBeNull();
  });

  it("Anular perda tira a perda do negócio e o negócio volta a oferecer «Perder negócio»", () => {
    perderNegocio(emProposta, "Preço", HOJE_EXEMPLO);
    const [perdido] = negociosComPerdidos([emProposta], alteracoesAtuais());
    abrir(perdido);
    fireEvent.click(screen.getByRole("button", { name: "Anular perda" }));
    expect(perdaDoNegocio(emProposta.id)).toBeUndefined();
  });

  it("um negócio ganho não tem nenhum dos dois", () => {
    abrir(ganho);
    expect(screen.queryByRole("button", { name: "Perder negócio" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Anular perda" })).toBeNull();
  });
});
