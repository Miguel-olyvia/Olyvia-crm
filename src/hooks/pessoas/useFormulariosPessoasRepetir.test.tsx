// O filtro «Formulário»: depois de uma falha, repetir lê outra vez e recupera.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { FontePessoasContext, type FontePessoas } from "./useFontePessoas";
import { useFormulariosPessoas } from "./useFormulariosPessoas";

const orderMock = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ order: orderMock }) }) }) },
}));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

const fonte: FontePessoas = { modo: "real", organizationId: "org-nike", momentoGanho: null };

function montar() {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}><FontePessoasContext.Provider value={fonte}>{children}</FontePessoasContext.Provider></QueryClientProvider>
  );
  return renderHook(() => useFormulariosPessoas(true), { wrapper });
}

beforeEach(() => orderMock.mockReset());

describe("useFormulariosPessoas: repetir", () => {
  it("depois de falhar (e da repetição automática), repetir lê outra vez e os formulários aparecem", async () => {
    orderMock.mockResolvedValueOnce({ data: null, error: { message: "x" } }).mockResolvedValueOnce({ data: null, error: { message: "x" } });
    const { result } = montar();
    await waitFor(() => expect(result.current.erro).toBe(true));
    orderMock.mockResolvedValue({ data: [{ id: "f-1", name: "Pedido" }], error: null });
    act(() => result.current.repetir());
    await waitFor(() => expect(result.current.formularios).toEqual([{ id: "f-1", nome: "Pedido" }]));
    expect(result.current.erro).toBe(false);
  });

  it("repetir é uma função estável entre renders", async () => {
    orderMock.mockResolvedValue({ data: [], error: null });
    const { result, rerender } = montar();
    await waitFor(() => expect(result.current.aCarregar).toBe(false));
    const antes = result.current.repetir;
    rerender();
    expect(result.current.repetir).toBe(antes);
  });
});
