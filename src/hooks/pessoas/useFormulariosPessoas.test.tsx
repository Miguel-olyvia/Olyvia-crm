// Os formulários da organização, para o filtro «Formulário» da Lista real (uma leitura a `forms`, sob RLS, só da organização ativa).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { FontePessoasContext, type FontePessoas } from "./useFontePessoas";
import { useFormulariosPessoas } from "./useFormulariosPessoas";

const orderMock = vi.hoisted(() => vi.fn());
const eqMock = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() => vi.fn());
const captureMock = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: fromMock } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: captureMock }));

const real = (organizationId: string): FontePessoas => ({ modo: "real", organizationId, momentoGanho: null });

function montar(fonte: FontePessoas = real("org-nike"), ativo = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}><FontePessoasContext.Provider value={fonte}>{children}</FontePessoasContext.Provider></QueryClientProvider>
  );
  return renderHook(() => useFormulariosPessoas(ativo), { wrapper });
}

beforeEach(() => {
  [orderMock, eqMock, selectMock, fromMock, captureMock].forEach((m) => m.mockReset());
  fromMock.mockReturnValue({ select: selectMock });
  selectMock.mockReturnValue({ eq: eqMock });
  eqMock.mockReturnValue({ order: orderMock });
});

describe("useFormulariosPessoas", () => {
  it("lê id e nome dos formulários SÓ da organização ativa, por ordem de nome", async () => {
    orderMock.mockResolvedValue({ data: [{ id: "f-2", name: "Remodelações" }, { id: "f-1", name: "Pedido" }], error: null });
    const { result } = montar();
    await waitFor(() => expect(result.current.aCarregar).toBe(false));
    expect(fromMock).toHaveBeenCalledWith("forms");
    expect(selectMock).toHaveBeenCalledWith("id, name");
    expect(eqMock).toHaveBeenCalledWith("organization_id", "org-nike");
    expect(orderMock).toHaveBeenCalledWith("name", { ascending: true });
    expect(result.current.formularios).toEqual([{ id: "f-2", nome: "Remodelações" }, { id: "f-1", nome: "Pedido" }]);
    expect(result.current.erro).toBe(false);
  });

  it("um formulário sem nome legível não entra (não haveria o que mostrar)", async () => {
    orderMock.mockResolvedValue({ data: [{ id: "f-1", name: "  " }, { id: "f-2", name: null }, { id: "f-3", name: "Ok" }], error: null });
    const { result } = montar();
    await waitFor(() => expect(result.current.aCarregar).toBe(false));
    expect(result.current.formularios).toEqual([{ id: "f-3", nome: "Ok" }]);
  });

  it("um erro é reportado e dito, sem rebentar", async () => {
    orderMock.mockResolvedValue({ data: null, error: { code: "42501", message: "x" } });
    const { result } = montar();
    await waitFor(() => expect(result.current.erro).toBe(true));
    expect(result.current.formularios).toEqual([]);
    expect(captureMock).toHaveBeenCalled();
    expect(orderMock).toHaveBeenCalledTimes(2); // uma repetição, como os outros hooks da página
  });

  it("em modo exemplo ou sem ativar, não lê nada", async () => {
    montar({ modo: "exemplo" });
    montar(real("org-nike"), false);
    await Promise.resolve();
    await Promise.resolve();
    expect(fromMock).not.toHaveBeenCalled();
  });
});
