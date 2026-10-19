// A escolha de colunas em estado: lida por organização, guardada a cada mudança, e relida quando a organização muda.
import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { chaveColunas, escolhaPorOmissao } from "./colunasPessoas";
import { useColunasPessoas } from "./useColunasPessoas";

beforeEach(() => window.localStorage.clear());

describe("useColunasPessoas", () => {
  it("começa pela omissão e dá as colunas visíveis pela ordem", () => {
    const { result } = renderHook(() => useColunasPessoas("org-1"));
    expect(result.current.escolha).toEqual(escolhaPorOmissao());
    expect(result.current.visiveis[0]).toBe("person");
  });
  it("alternar muda a visibilidade e guarda logo, na chave desta organização", () => {
    const { result } = renderHook(() => useColunasPessoas("org-1"));
    act(() => result.current.alternar("email"));
    expect(result.current.visiveis).not.toContain("email");
    expect(JSON.parse(window.localStorage.getItem(chaveColunas("org-1")) ?? "null").colunas.find((c: { id: string }) => c.id === "email").visivel).toBe(false);
    expect(window.localStorage.getItem(chaveColunas("org-2"))).toBeNull();
  });
  it("mover e arrastar mudam a ordem das visíveis e guardam", () => {
    const { result } = renderHook(() => useColunasPessoas("org-1"));
    const antes = result.current.visiveis.indexOf("value");
    act(() => result.current.mover("value", -1));
    expect(result.current.visiveis.indexOf("value")).toBe(antes - 1);
    act(() => result.current.moverPara("value", 1));
    expect(result.current.visiveis[1]).toBe("value");
    expect(window.localStorage.getItem(chaveColunas("org-1"))).toContain('"value"');
  });
  it("uma segunda montagem lê o que ficou guardado", () => {
    const a = renderHook(() => useColunasPessoas("org-1"));
    act(() => a.result.current.alternar("phone"));
    a.unmount();
    const b = renderHook(() => useColunasPessoas("org-1"));
    expect(b.result.current.visiveis).not.toContain("phone");
  });
  it("trocar de organização relê a escolha dessa organização (não arrasta a anterior)", () => {
    window.localStorage.setItem(chaveColunas("org-2"), JSON.stringify({ v: 1, colunas: [{ id: "person", visivel: true }, { id: "stage", visivel: true }] }));
    const { result, rerender } = renderHook(({ org }) => useColunasPessoas(org), { initialProps: { org: "org-1" } });
    act(() => result.current.alternar("email"));
    rerender({ org: "org-2" });
    expect(result.current.visiveis).toEqual(["person", "stage"]);
    rerender({ org: "org-1" });
    expect(result.current.visiveis).not.toContain("email");
  });
  it("repor apaga a preferência e volta à omissão", () => {
    const { result } = renderHook(() => useColunasPessoas("org-1"));
    act(() => result.current.alternar("email"));
    act(() => result.current.repor());
    expect(result.current.escolha).toEqual(escolhaPorOmissao());
    expect(window.localStorage.getItem(chaveColunas("org-1"))).toBeNull();
  });
  it("sem organização não guarda nada, mas a escolha funciona nesta visita", () => {
    const { result } = renderHook(() => useColunasPessoas(null));
    act(() => result.current.alternar("email"));
    expect(result.current.visiveis).not.toContain("email");
    expect(window.localStorage.length).toBe(0);
  });
  it("«Pessoa» nunca se esconde, mesmo se alguém o pedir", () => {
    const { result } = renderHook(() => useColunasPessoas("org-1"));
    act(() => result.current.alternar("person"));
    expect(result.current.visiveis[0]).toBe("person");
  });
});
