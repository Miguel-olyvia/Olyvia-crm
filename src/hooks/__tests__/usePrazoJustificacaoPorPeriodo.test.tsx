/**
 * O prazo para justificar vem da BASE (`hr_justificacao_dia_prazo`), uma chamada por periodo e nao por dia; se a RPC nao existe ou
 * recusa, vale o calculo local e diz-se que e uma estimativa.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const chamadas: Array<{ fn: string; args: Record<string, unknown> }> = [];
let resposta: { data: unknown; error: unknown } = { data: "2026-11-21", error: null };
vi.mock("@/lib/hr/hrDb", () => ({
  hrRpc: async (fn: string, args: Record<string, unknown>) => {
    chamadas.push({ fn, args });
    return resposta;
  },
  isPermissionError: (e: { code?: string } | null) => e?.code === "42501",
}));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-nike" } }) }));

let regrasMock: Array<{ dia_inicio: number; valido_de: string }> = [{ dia_inicio: 22, valido_de: "2000-01-01" }];
let estadoRegras: "ok" | "recusado" = "ok";
vi.mock("@/hooks/usePeriodoFolhaRegras", () => ({
  usePeriodoFolhaRegras: () => ({ regras: regrasMock, estado: estadoRegras, isLoading: false }),
}));

import { usePrazoJustificacaoPorPeriodo } from "@/hooks/usePrazoJustificacaoPorPeriodo";

const embrulho = ({ children }: { children: ReactNode }) => {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  chamadas.length = 0;
  resposta = { data: "2026-11-21", error: null };
  regrasMock = [{ dia_inicio: 22, valido_de: "2000-01-01" }];
  estadoRegras = "ok";
});

describe("usePrazoJustificacaoPorPeriodo", () => {
  it("uma chamada por PERIODO: tres dias da mesma folha (22/10 a 21/11) pedem uma vez", async () => {
    const datas = ["2026-10-25", "2026-11-03", "2026-11-20"];
    const { result } = renderHook(() => usePrazoJustificacaoPorPeriodo(datas), { wrapper: embrulho });
    await waitFor(() => expect(result.current.estimativaDe("2026-11-03")).toBe(false));
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]).toEqual({ fn: "hr_justificacao_dia_prazo", args: { _organization_id: "org-nike", _data: "2026-10-25" } });
    expect(result.current.prazoDe("2026-10-25")).toBe("2026-11-21");
    expect(result.current.prazoDe("2026-11-20")).toBe("2026-11-21");
  });

  it("dois periodos pedem duas vezes", async () => {
    const datas = ["2026-11-03", "2026-11-25"];
    renderHook(() => usePrazoJustificacaoPorPeriodo(datas), { wrapper: embrulho });
    await waitFor(() => expect(chamadas).toHaveLength(2));
  });

  it("a base ganha ao calculo local: periodo fechado a 10/11 (vespera do fecho) diz 09/11, e nao 21/11", async () => {
    resposta = { data: "2026-11-09", error: null };
    const datas = ["2026-11-03"];
    const { result } = renderHook(() => usePrazoJustificacaoPorPeriodo(datas), { wrapper: embrulho });
    await waitFor(() => expect(result.current.prazoDe("2026-11-03")).toBe("2026-11-09"));
    expect(result.current.estimativaDe("2026-11-03")).toBe(false);
  });

  it("com a RPC por aplicar (PGRST202) vale o calculo local e e uma estimativa", async () => {
    resposta = { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
    const datas = ["2026-11-03"];
    const { result } = renderHook(() => usePrazoJustificacaoPorPeriodo(datas), { wrapper: embrulho });
    await waitFor(() => expect(chamadas).toHaveLength(1));
    expect(result.current.prazoDe("2026-11-03")).toBe("2026-11-21");
    expect(result.current.estimativaDe("2026-11-03")).toBe(true);
  });

  it("sem poder ler as regras (recusado) nao se sabe que dias formam um periodo: cada data tem a sua chamada", async () => {
    estadoRegras = "recusado";
    regrasMock = [];
    const datas = ["2026-11-03", "2026-11-04"];
    renderHook(() => usePrazoJustificacaoPorPeriodo(datas), { wrapper: embrulho });
    await waitFor(() => expect(chamadas).toHaveLength(2));
  });
});
