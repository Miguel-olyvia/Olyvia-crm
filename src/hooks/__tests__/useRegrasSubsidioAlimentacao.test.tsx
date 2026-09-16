/**
 * `useRegrasSubsidioAlimentacao`: le a regra da organizacao activa (ou a
 * omissao, se ainda nao houver linha) e grava por upsert. `hrFrom`/
 * `resolveCurrentBusinessUserId` simulados. Nada toca em base nenhuma.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const ORG_ID = "org-nike";

vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: { id: ORG_ID, name: "Nike" } }),
}));

vi.mock("@/lib/identity/resolveBusinessUserId", () => ({
  resolveCurrentBusinessUserId: vi.fn(async () => "business-user-1"),
}));

let chamadasUpsert: Array<{ payload: unknown; onConflict?: string }> = [];
let respostaRegra: { data: unknown; error: unknown } = { data: null, error: null };
let erroUpsert: unknown = null;

function buildChain() {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve(respostaRegra),
    upsert: (payload: unknown, opts: { onConflict?: string }) => {
      chamadasUpsert.push({ payload, onConflict: opts?.onConflict });
      return Promise.resolve({ data: null, error: erroUpsert });
    },
  };
  return chain;
}

vi.mock("@/lib/hr/hrDb", () => ({
  hrFrom: () => buildChain(),
  isPermissionError: (erro: unknown) =>
    !!erro && typeof erro === "object" && (erro as { code?: string }).code === "42501",
}));

import { useRegrasSubsidioAlimentacao } from "@/hooks/useRegrasSubsidioAlimentacao";

const REGRA_GRAVADA = {
  id: "r1",
  organization_id: ORG_ID,
  valor_diario: 7.63,
  modo: "cartao",
  minutos_minimos_dia: 60,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  chamadasUpsert = [];
  erroUpsert = null;
  respostaRegra = { data: null, error: null };
});

describe("useRegrasSubsidioAlimentacao", () => {
  it("sem linha gravada, devolve a omissao (dinheiro, 1 minuto, valor 0)", async () => {
    const { result } = renderHook(() => useRegrasSubsidioAlimentacao(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.temRegraGravada).toBe(false);
    expect(result.current.regra).toEqual({ valorDiario: 0, modo: "dinheiro", minutosMinimosDia: 1 });
  });

  it("com linha gravada, devolve os valores dessa linha", async () => {
    respostaRegra = { data: REGRA_GRAVADA, error: null };
    const { result } = renderHook(() => useRegrasSubsidioAlimentacao(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.temRegraGravada).toBe(true);
    expect(result.current.regra).toEqual({ valorDiario: 7.63, modo: "cartao", minutosMinimosDia: 60 });
  });

  it("um erro de permissao na leitura devolve a omissao, sem lancar", async () => {
    respostaRegra = { data: null, error: { code: "42501", message: "insufficient_privilege" } };
    const { result } = renderHook(() => useRegrasSubsidioAlimentacao(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.temRegraGravada).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("gravar faz upsert por organization_id, com created_by/updated_by do id de negocio", async () => {
    const { result } = renderHook(() => useRegrasSubsidioAlimentacao(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.gravar({ valorDiario: 7.63, modo: "cartao", minutosMinimosDia: 60 });

    expect(chamadasUpsert).toHaveLength(1);
    expect(chamadasUpsert[0].onConflict).toBe("organization_id");
    expect(chamadasUpsert[0].payload).toMatchObject({
      organization_id: ORG_ID,
      valor_diario: 7.63,
      modo: "cartao",
      minutos_minimos_dia: 60,
      created_by: "business-user-1",
      updated_by: "business-user-1",
    });
  });

  it("propaga o erro da base ao gravar, em vez de o engolir", async () => {
    erroUpsert = { message: "recusado" };
    const { result } = renderHook(() => useRegrasSubsidioAlimentacao(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      result.current.gravar({ valorDiario: 5, modo: "dinheiro", minutosMinimosDia: 1 }),
    ).rejects.toBeTruthy();
  });
});
