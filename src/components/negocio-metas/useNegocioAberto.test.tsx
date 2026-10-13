import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { DADOS_EXEMPLO } from "./negocioMetasExemplo";
import { useNegocioAberto } from "./useNegocioAberto";

const negocios = DADOS_EXEMPLO.negocios;
const montar = (endereco: string) =>
  renderHook(() => ({ h: useNegocioAberto(negocios), loc: useLocation() }), {
    wrapper: ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[endereco]}>{children}</MemoryRouter>,
  });

describe("useNegocioAberto", () => {
  it("o negócio aberto deriva do ?open= do endereço", () => {
    const { result } = montar("/negocio-metas?open=n3");
    expect(result.current.h.aberto?.id).toBe("n3");
  });

  it("sem ?open= não há negócio aberto", () => {
    expect(montar("/negocio-metas").result.current.h.aberto).toBeNull();
  });

  it("abrir escreve o ?open= no endereço", () => {
    const { result } = montar("/negocio-metas");
    act(() => result.current.h.abrir(negocios[1]));
    expect(result.current.loc.search).toBe("?open=n2");
    expect(result.current.h.aberto?.id).toBe("n2");
  });

  it("um id que não existe limpa-se do endereço e não abre nada", () => {
    const { result } = montar("/negocio-metas?open=nao-existe");
    expect(result.current.h.aberto).toBeNull();
    expect(result.current.loc.search).toBe("");
  });

  it("fechar um ?open= vindo de fora limpa-o do endereço", () => {
    const { result } = montar("/negocio-metas?open=n3");
    act(() => result.current.h.fechar());
    expect(result.current.loc.search).toBe("");
    expect(result.current.h.aberto).toBeNull();
  });
});
