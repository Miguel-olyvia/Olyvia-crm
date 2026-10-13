import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { useAbrirWorkflow } from "./useAbrirWorkflow";

const montar = (endereco: string) =>
  renderHook(
    () => ({ dialogo: useAbrirWorkflow(), local: useLocation(), ir: useNavigate() }),
    { wrapper: ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[endereco]}>{children}</MemoryRouter> },
  );

describe("useAbrirWorkflow", () => {
  it("?workflow=1 abre", () => {
    expect(montar("/negocios?workflow=1").result.current.dialogo[0]).toBe(true);
  });

  it("?separador=workflow abre o mesmo diálogo", () => {
    expect(montar("/negocios?separador=workflow").result.current.dialogo[0]).toBe(true);
  });

  it("sem pedido está fechado, e abrir escreve ?workflow=1", () => {
    const { result } = montar("/negocios");
    expect(result.current.dialogo[0]).toBe(false);
    act(() => result.current.dialogo[1](true));
    expect(result.current.dialogo[0]).toBe(true);
    expect(new URLSearchParams(result.current.local.search).get("workflow")).toBe("1");
  });

  it("fechar limpa os dois parâmetros e preserva ?separador=dashboard e os outros", () => {
    const { result } = montar("/negocios?workflow=1&separador=workflow&q=ab");
    act(() => result.current.dialogo[1](false));
    expect(result.current.dialogo[0]).toBe(false);
    expect(result.current.local.search).toBe("?q=ab");
    const outro = montar("/negocios?workflow=1&separador=dashboard");
    act(() => outro.result.current.dialogo[1](false));
    expect(outro.result.current.local.search).toBe("?separador=dashboard");
  });

  it("abre por ligação com a página já montada, e fecha quando a ligação o tira", () => {
    const { result } = montar("/negocios");
    act(() => result.current.ir("/negocios?workflow=1"));
    expect(result.current.dialogo[0]).toBe(true);
    act(() => result.current.ir("/negocios"));
    expect(result.current.dialogo[0]).toBe(false);
  });

  it("?open tem prioridade: com um negócio aberto o diálogo não abre, e fechar preserva ?open", () => {
    const { result } = montar("/negocios?open=d1&workflow=1");
    expect(result.current.dialogo[0]).toBe(false);
    act(() => result.current.dialogo[1](false));
    expect(new URLSearchParams(result.current.local.search).get("open")).toBe("d1");
  });
});
