// O hook real da configuracao de horas extra: a RPC nova nao recebe `p_ano_min` e a leitura nao devolve `anoMin`
// (o limite anual e o da regra salarial em vigor).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/hr/hrDb", () => ({ hrRpc: (...a: unknown[]) => m.rpc(...a) }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-1" } }) }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/utils/friendlyError", () => ({ getLocalizedFallback: (k: string) => `T:${k}` }));

import { useHorasExtraConfig } from "./useHorasExtra";

const envolver = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

beforeEach(() => {
  m.rpc.mockReset();
});

describe("useHorasExtraConfig", () => {
  it("le dia, alerta e minimo, sem limite anual", async () => {
    m.rpc.mockResolvedValue({ data: { dia_min: 120, alerta_pct: 80, minimo_min: 15, omissao: true }, error: null });
    const { result } = renderHook(() => useHorasExtraConfig(true), { wrapper: envolver });
    await waitFor(() => expect(result.current.limites).not.toBeNull());
    expect(result.current.limites).toEqual({ diaMin: 120, alertaPct: 80, minimoMin: 15 });
    expect(result.current.limites).not.toHaveProperty("anoMin");
  });

  it("guardar envia so organizacao, dia, alerta e minimo (nunca p_ano_min)", async () => {
    m.rpc.mockResolvedValue({ data: { dia_min: 120, alerta_pct: 80, minimo_min: 15, omissao: true }, error: null });
    const { result } = renderHook(() => useHorasExtraConfig(true), { wrapper: envolver });
    await waitFor(() => expect(result.current.limites).not.toBeNull());
    m.rpc.mockClear();
    m.rpc.mockResolvedValue({ data: {}, error: null });
    await act(async () => {
      await result.current.guardar({ diaMin: 90, alertaPct: 70, minimoMin: 10 });
    });
    const chamada = m.rpc.mock.calls.find((c) => c[0] === "rpc_hr_horas_extra_config_guardar");
    expect(chamada?.[1]).toEqual({ p_organization_id: "org-1", p_dia_min: 90, p_alerta_pct: 70, p_minimo_min: 10 });
  });
});
