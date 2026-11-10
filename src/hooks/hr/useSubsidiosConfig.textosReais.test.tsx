// O erro da base chega ao ecra como TEXTO, e nao como chave: aqui sem mock de friendlyError nem das traducoes (so a base e o contexto).
// O mock de getLocalizedFallback escondia que as chaves rhSubs.* nao se resolviam fora do useTranslation.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/hr/hrDb", () => ({ hrRpc: (...a: unknown[]) => m.rpc(...a) }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-1" } }) }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

import { useSubsidiosConfig } from "./useSubsidiosConfig";

const envolver = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);
const LIDA = { tem_config: true, ativo_desde: "2026-01-01", ferias_mes: 6, natal_mes: 11, folhas_fechadas_desde: "2026-03-01", ultima_folha_fechada_ate: "2026-09-30" };

beforeEach(() => {
  m.rpc.mockReset();
  window.localStorage.clear();
});

async function guardarComErro(code: string | undefined, alvo: string | null) {
  m.rpc.mockImplementation(async (fn: string) => (fn === "rpc_hr_subsidios_config_ler" ? { data: LIDA, error: null } : { data: null, error: { code, message: "x" } }));
  const { result } = renderHook(() => useSubsidiosConfig(), { wrapper: envolver });
  await waitFor(() => expect(result.current.estado).toBe("ok"));
  let r: { ok: boolean; erro?: string } | undefined;
  await act(async () => {
    r = await result.current.guardar({ ativoDesde: alvo, feriasMes: 6, natalMes: 11 });
  });
  return r as { ok: false; erro: string };
}

describe("useSubsidiosConfig: textos de erro reais", () => {
  it.each([
    ["pt", "HRA88", null, /desligar/i],
    ["pt", "HRA89", "2026-01-01", /duas vezes ou nenhuma/],
    ["pt", "HRA81", "2026-01-01", /Configuração inválida/],
    ["pt", undefined, "2026-01-01", /Não foi possível guardar/],
    ["en", "HRA89", "2026-01-01", /twice or not at all/],
  ] as const)("%s %s sai como texto e nunca como chave", async (lingua, code, alvo, esperado) => {
    window.localStorage.setItem("language", lingua);
    const r = await guardarComErro(code, alvo);
    expect(r.ok).toBe(false);
    expect(r.erro).not.toMatch(/^rhSubs\./);
    expect(r.erro).toMatch(esperado);
  });
});
