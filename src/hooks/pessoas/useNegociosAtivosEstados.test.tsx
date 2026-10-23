import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
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

import { negociosAtivosQueryKey, useNegociosAtivos } from "./useNegociosAtivos";

function montar(opcoes?: { habilitado?: boolean }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(() => useNegociosAtivos(opcoes), { wrapper }) };
}

describe("useNegociosAtivos: erroSemResposta, aRepetir e habilitado", () => {
  beforeEach(() => {
    maybeSingleMock.mockReset();
    fromMock.mockReset();
    fromMock.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }) });
    ctx = { activeCompany: { id: "org-1" }, isLoading: false };
  });

  it("primeira leitura falhada: erroSemResposta e isError", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: { code: "57014", message: "t" } });
    const { result } = montar();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current).toMatchObject({ erroSemResposta: true, ativo: false, aRepetir: false });
  });

  it("sem linha (resposta válida): nem erro nem erroSemResposta", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toMatchObject({ erroSemResposta: false, isError: false, aRepetir: false });
  });

  it("refetch falhado com dados antigos: isError mas NÃO erroSemResposta, e continua ativo", async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: { momento_ganho: "manual" }, error: null });
    const { result, client } = montar();
    await waitFor(() => expect(result.current.ativo).toBe(true));
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: { code: "57014", message: "t" } });
    await client.refetchQueries({ queryKey: negociosAtivosQueryKey("org-1") });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current).toMatchObject({ erroSemResposta: false, ativo: true, momentoGanho: "manual" });
  });

  it("aRepetir é verdadeiro enquanto a leitura repete", async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: { code: "57014", message: "t" } });
    const { result, client } = montar();
    await waitFor(() => expect(result.current.erroSemResposta).toBe(true));
    let libertar: (r: unknown) => void = () => {};
    maybeSingleMock.mockReturnValueOnce(new Promise((res) => { libertar = res; }));
    void client.refetchQueries({ queryKey: negociosAtivosQueryKey("org-1") });
    await waitFor(() => expect(result.current.aRepetir).toBe(true));
    libertar({ data: { momento_ganho: "manual" }, error: null });
    await waitFor(() => expect(result.current.aRepetir).toBe(false));
    expect(result.current.ativo).toBe(true);
  });

  it("habilitado false: não consulta, não carrega e fica inativo", () => {
    const { result } = montar({ habilitado: false });
    expect(result.current).toMatchObject({ ativo: false, isLoading: false, isError: false, erroSemResposta: false });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("habilitado por omissão e quando true consulta", async () => {
    maybeSingleMock.mockResolvedValue({ data: { momento_ganho: "manual" }, error: null });
    const { result } = montar({ habilitado: true });
    await waitFor(() => expect(result.current.ativo).toBe(true));
    expect(fromMock).toHaveBeenCalledTimes(1);
  });
});
