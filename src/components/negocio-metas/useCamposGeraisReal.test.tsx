// O comercial de partida dos campos gerais do novo negócio: no exemplo só vale um dos comerciais de exemplo (senão o por omissão); na ficha real
// (com `DadosNegocio`) vale o que vier (o comercial da pessoa, lido da base) ou, sem nada, fica vazio: nunca o nome de exemplo por omissão.
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { DadosNegocioContext } from "./costuraNegocio";
import { dadosFalsos } from "./costuraTestUtil";
import { COMERCIAL_POR_OMISSAO } from "./novoNegocio";
import { useCamposGerais } from "./useEstadoNovoNegocio";

const PESSOAS = [{ id: "p1", nome: "Paulo Neves" }];
const noExemplo = ({ children }: { children: ReactNode }) => <DadosNegocioContext.Provider value={null}>{children}</DadosNegocioContext.Provider>;
const naFichaReal = ({ children }: { children: ReactNode }) => <DadosNegocioContext.Provider value={dadosFalsos()}>{children}</DadosNegocioContext.Provider>;
const comercial = (wrapper: typeof noExemplo, inicial?: string) => renderHook(() => useCamposGerais(PESSOAS, vi.fn(), "p1", inicial), { wrapper }).result.current.valores.comercial;

describe("useCamposGerais: o comercial de partida", () => {
  it("no exemplo, um comercial de exemplo vale", () => {
    expect(comercial(noExemplo, "Bruno Costa")).toBe("Bruno Costa");
  });

  it("no exemplo, um nome fora da lista ou nenhum cai no por omissão", () => {
    expect(comercial(noExemplo, "Rita Gomes")).toBe(COMERCIAL_POR_OMISSAO);
    expect(comercial(noExemplo)).toBe(COMERCIAL_POR_OMISSAO);
  });

  it("na ficha real, o comercial da pessoa vale mesmo que não seja de exemplo", () => {
    expect(comercial(naFichaReal, "Rita Gomes")).toBe("Rita Gomes");
  });

  it("na ficha real, sem comercial fica vazio (nunca o nome de exemplo)", () => {
    expect(comercial(naFichaReal)).toBe("");
    expect(comercial(naFichaReal, "")).toBe("");
  });
});
