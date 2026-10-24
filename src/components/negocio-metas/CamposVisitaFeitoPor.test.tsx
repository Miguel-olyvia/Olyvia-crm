// «Feito por» de uma visita: no exemplo (sem ficha real) oferece os comerciais de exemplo; na ficha real oferece os comerciais REAIS da organização
// (os mesmos da página de Leads), sem os nomes de exemplo. Um nome que a visita já traz e já não está na lista (a base trouxe-o) continua visível.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { ComCostura, dadosFalsos, mutacoesFalsas } from "./costuraTestUtil";
import { CamposVisita } from "./CamposVisita";
import type { VisitaNegocio } from "./negocioMetas";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());

beforeAll(prepararRadixNoJsdom);
afterEach(cleanup);

const visita = (feitoPor: string): VisitaNegocio => ({
  id: "v1", data: "2026-10-20", hora: "10:00", feitoPor, estado: "porFazer", tipo: "levantamento", quemVaiEstar: "", duracao: "",
  morada: { rua: "", codigoPostal: "", localidade: "", andar: "" }, igualALead: true, nota: "",
});

const abrirLista = () => {
  fireEvent.click(screen.getByRole("combobox", { name: "Feito por" }));
  return screen.getByRole("listbox");
};
const nomes = () => within(abrirLista()).getAllByRole("option").map((o) => o.textContent);

describe("Feito por: no exemplo", () => {
  it("oferece os comerciais de exemplo", () => {
    render(<CamposVisita base="b" visita={visita("Ana Ribeiro")} aoMudar={vi.fn()} />);
    expect(nomes()).toEqual(["Ana Ribeiro", "Bruno Costa", "Carla Mendes", "Diogo Lopes"]);
  });
});

describe("Feito por: na ficha real", () => {
  const real = (v: VisitaNegocio, nomes: readonly string[] | undefined, aoMudar = vi.fn()) =>
    render(<ComCostura mutacoes={mutacoesFalsas()} dados={dadosFalsos({ comerciais: nomes })}><CamposVisita base="b" visita={v} aoMudar={aoMudar} /></ComCostura>);

  it("oferece os comerciais reais, por ordem, e nunca os de exemplo", () => {
    real(visita("Rita Gomes"), ["Rita Gomes", "Tomás Reis"]);
    expect(nomes()).toEqual(["Rita Gomes", "Tomás Reis"]);
  });

  it("pede os comerciais à ficha ao montar, uma só vez", () => {
    const pedir = vi.fn();
    const { rerender } = render(<ComCostura mutacoes={mutacoesFalsas()} dados={dadosFalsos({ pedirComerciais: pedir })}><CamposVisita base="b" visita={visita("")} aoMudar={vi.fn()} /></ComCostura>);
    expect(pedir).toHaveBeenCalledTimes(1);
    rerender(<ComCostura mutacoes={mutacoesFalsas()} dados={dadosFalsos({ pedirComerciais: pedir })}><CamposVisita base="b" visita={visita("Ana")} aoMudar={vi.fn()} /></ComCostura>);
    expect(pedir).toHaveBeenCalledTimes(1);
  });

  it("escolher um comercial pede a mudança do «feito por»", () => {
    const aoMudar = vi.fn();
    real(visita("Rita Gomes"), ["Rita Gomes", "Tomás Reis"], aoMudar);
    fireEvent.click(within(abrirLista()).getByRole("option", { name: "Tomás Reis" }));
    expect(aoMudar).toHaveBeenCalledWith({ feitoPor: "Tomás Reis" });
  });

  it("um nome que a visita já traz e não está na lista continua a aparecer (não fica vazio)", () => {
    real(visita("Rita Gomes"), ["Tomás Reis"]);
    expect(screen.getByRole("combobox", { name: "Feito por" })).toHaveTextContent("Rita Gomes");
    expect(nomes()).toEqual(["Tomás Reis", "Rita Gomes"]);
  });

  it("sem comerciais (a carregar ou a leitura falhou) não inventa nomes de exemplo", () => {
    real(visita(""), undefined);
    fireEvent.click(screen.getByRole("combobox", { name: "Feito por" }));
    expect(screen.queryByRole("option")).toBeNull();
  });
});
