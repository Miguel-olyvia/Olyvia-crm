import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const eqMock = vi.fn();
const selectMock = vi.fn();
const fromMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));
const captureMock = vi.fn();
vi.mock("@/lib/observability/captureFlowError", () => ({
  captureFlowError: (...args: unknown[]) => captureMock(...args),
}));
let ctx: { activeCompany: { id: string } | null; isLoading: boolean } = {
  activeCompany: { id: "org-1" },
  isLoading: false,
};
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ctx }));

import { negociosAtivosQueryKey, useNegociosAtivos } from "./useNegociosAtivos";

// Um QueryClient por teste; retry 0 para o erro aparecer logo, sem esperas.
function montar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(() => useNegociosAtivos(), { wrapper }) };
}

type Resultado = { data: unknown; error: unknown };
function resposta(resultado: Resultado | Promise<Resultado>) {
  eqMock.mockReturnValue({ maybeSingle: () => Promise.resolve(resultado) });
  selectMock.mockReturnValue({ eq: eqMock });
  fromMock.mockReturnValue({ select: selectMock });
}

describe("useNegociosAtivos", () => {
  beforeEach(() => {
    [eqMock, selectMock, fromMock, captureMock].forEach((m) => m.mockReset());
    ctx = { activeCompany: { id: "org-1" }, isLoading: false };
  });

  it("estado inicial síncrono: a carregar e inativo", () => {
    resposta(new Promise(() => {}));
    const { result } = montar();
    expect(result.current).toMatchObject({ isLoading: true, ativo: false, isError: false });
  });

  it("com linha de configuração: ativo e com o momento certo", async () => {
    resposta({ data: { momento_ganho: "contrato_assinado" }, error: null });
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toEqual({ ativo: true, momentoGanho: "contrato_assinado", isLoading: false, isError: false });
  });

  it("lê negocio_workflow_config da organização do contexto", async () => {
    resposta({ data: { momento_ganho: "x" }, error: null });
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fromMock).toHaveBeenCalledWith("negocio_workflow_config");
    expect(selectMock).toHaveBeenCalledWith("momento_ganho");
    expect(eqMock).toHaveBeenCalledWith("organization_id", "org-1");
  });

  it("sem linha: inativo, sem erro", async () => {
    resposta({ data: null, error: null });
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toEqual({ ativo: false, momentoGanho: null, isLoading: false, isError: false });
  });

  it("42501 é um resultado válido: inativo, sem isError e sem Sentry", async () => {
    resposta({ data: null, error: { code: "42501", message: "denied" } });
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toMatchObject({ ativo: false, isError: false });
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("erro devolvido pela base: isError, inativo, reportado e não fica em cache como válido", async () => {
    const bruto = { code: "57014", message: "timeout" };
    resposta({ data: null, error: bruto });
    const { result, client } = montar();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current).toMatchObject({ ativo: false, momentoGanho: null, isLoading: false });
    expect(captureMock).toHaveBeenCalledWith(bruto, "pessoas-neg");
    expect(client.getQueryState(negociosAtivosQueryKey("org-1"))?.status).toBe("error");
    await client.refetchQueries({ queryKey: negociosAtivosQueryKey("org-1") });
    expect(fromMock).toHaveBeenCalledTimes(2);
  });

  it("erro de rede lançado: isError, inativo e a segunda leitura volta a consultar", async () => {
    const maybeSingle = vi.fn().mockRejectedValue(new Error("Failed to fetch"));
    eqMock.mockReturnValue({ maybeSingle });
    selectMock.mockReturnValue({ eq: eqMock });
    fromMock.mockReturnValue({ select: selectMock });
    const { result, client } = montar();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.ativo).toBe(false);
    await client.refetchQueries({ queryKey: negociosAtivosQueryKey("org-1") });
    expect(maybeSingle).toHaveBeenCalledTimes(2);
  });

  it("enquanto o contexto da organização carrega, o hook também carrega", () => {
    ctx = { activeCompany: null, isLoading: true };
    const { result } = montar();
    expect(result.current).toMatchObject({ isLoading: true, ativo: false });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("sem organização (contexto resolvido): inativo, já não carrega e não consulta a base", () => {
    ctx = { activeCompany: null, isLoading: false };
    const { result } = montar();
    expect(result.current).toMatchObject({ ativo: false, isLoading: false, isError: false });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("troca de organização: refaz a leitura, carrega e não reaproveita a anterior", async () => {
    resposta({ data: { momento_ganho: "a" }, error: null });
    const { result, rerender } = montar();
    await waitFor(() => expect(result.current.ativo).toBe(true));

    let libertar: (r: Resultado) => void = () => {};
    resposta(new Promise<Resultado>((res) => { libertar = res; }));
    ctx = { activeCompany: { id: "org-2" }, isLoading: false };
    rerender();
    expect(result.current).toMatchObject({ isLoading: true, ativo: false, momentoGanho: null });
    await waitFor(() => expect(eqMock).toHaveBeenCalledWith("organization_id", "org-2"));

    libertar({ data: { momento_ganho: "b" }, error: null });
    await waitFor(() => expect(result.current.momentoGanho).toBe("b"));
    expect(result.current).toMatchObject({ ativo: true, isLoading: false });
  });
});
