import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const maybeSingleMock = vi.fn();
const fromMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
let ctx: { activeCompany: { id: string } | null; isLoading: boolean } = { activeCompany: { id: "org-1" }, isLoading: false };
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ctx }));

import { negociosAtivosQueryKey, useNegociosAtivos, useRepetirNegociosAtivos } from "./useNegociosAtivos";

function montar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => ({ ativos: useNegociosAtivos(), repetir: useRepetirNegociosAtivos() }), { wrapper });
  return { client, ...hook };
}

describe("useRepetirNegociosAtivos", () => {
  beforeEach(() => {
    maybeSingleMock.mockReset();
    fromMock.mockReset();
    fromMock.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }) });
    ctx = { activeCompany: { id: "org-1" }, isLoading: false };
  });

  it("invalida a leitura da organização ativa e volta a consultar", async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: { code: "57014", message: "timeout" } });
    const { result, client } = montar();
    await waitFor(() => expect(result.current.ativos.isError).toBe(true));
    const invalidar = vi.spyOn(client, "invalidateQueries");

    maybeSingleMock.mockResolvedValueOnce({ data: { momento_ganho: "manual" }, error: null });
    act(() => result.current.repetir());

    expect(invalidar).toHaveBeenCalledWith({ queryKey: negociosAtivosQueryKey("org-1") });
    await waitFor(() => expect(result.current.ativos.ativo).toBe(true));
    expect(maybeSingleMock).toHaveBeenCalledTimes(2);
  });

  it("sem organização ativa não invalida nada", () => {
    ctx = { activeCompany: null, isLoading: false };
    const { result, client } = montar();
    const invalidar = vi.spyOn(client, "invalidateQueries");
    act(() => result.current.repetir());
    expect(invalidar).not.toHaveBeenCalled();
  });
});
