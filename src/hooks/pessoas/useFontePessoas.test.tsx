import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { FontePessoasContext, useFontePessoas, type FontePessoas } from "./useFontePessoas";

function comFonte(valor: FontePessoas) {
  return ({ children }: { children: ReactNode }) => (
    <FontePessoasContext.Provider value={valor}>{children}</FontePessoasContext.Provider>
  );
}

describe("useFontePessoas", () => {
  it("por omissão a fonte é de exemplo", () => {
    const { result } = renderHook(() => useFontePessoas());
    expect(result.current).toEqual({ modo: "exemplo" });
  });

  it("com o provider real devolve a organização e o momento de ganho", () => {
    const valor: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: "contrato_assinado" };
    const { result } = renderHook(() => useFontePessoas(), { wrapper: comFonte(valor) });
    expect(result.current).toEqual(valor);
  });

  it("o momento de ganho pode ser null", () => {
    const valor: FontePessoas = { modo: "real", organizationId: "org-2", momentoGanho: null };
    const { result } = renderHook(() => useFontePessoas(), { wrapper: comFonte(valor) });
    expect(result.current).toMatchObject({ modo: "real", momentoGanho: null });
  });
});
