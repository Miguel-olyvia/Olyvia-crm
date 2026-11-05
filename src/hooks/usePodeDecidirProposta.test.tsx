// 05/11/2026: aceitar/recusar uma proposta de um negócio pede negocios.proposta.decidir, lida por fn_cat_pode (a função do servidor).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const m = vi.hoisted(() => ({ org: "org-1" as string | null, rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => m.rpc(...a) } }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: m.org ? { id: m.org } : null }) }));

import { usePodeDecidirProposta } from "./usePodeDecidirProposta";

beforeEach(() => { m.org = "org-1"; m.rpc.mockReset(); });
afterEach(() => vi.clearAllMocks());

describe("usePodeDecidirProposta", () => {
  it("pergunta fn_cat_pode na organização ativa; enquanto lê, não pode", async () => {
    m.rpc.mockResolvedValue({ data: true, error: null });
    const { result } = renderHook(() => usePodeDecidirProposta());
    expect(result.current).toEqual({ pode: false, aLer: true });
    await waitFor(() => expect(result.current).toEqual({ pode: true, aLer: false }));
    expect(m.rpc).toHaveBeenCalledWith("fn_cat_pode", { p_org: "org-1", p_perm: "negocios.proposta.decidir" });
  });

  it("a base diz que não: não pode", async () => {
    m.rpc.mockResolvedValue({ data: false, error: null });
    const { result } = renderHook(() => usePodeDecidirProposta());
    await waitFor(() => expect(result.current.aLer).toBe(false));
    expect(result.current.pode).toBe(false);
  });

  it("uma leitura que falha vale «não»", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: "rede" } });
    const { result } = renderHook(() => usePodeDecidirProposta());
    await waitFor(() => expect(result.current.aLer).toBe(false));
    expect(result.current.pode).toBe(false);
  });

  it("inativo ou sem organização: não pergunta nada", () => {
    expect(renderHook(() => usePodeDecidirProposta(false)).result.current).toEqual({ pode: false, aLer: false });
    m.org = null;
    expect(renderHook(() => usePodeDecidirProposta()).result.current).toEqual({ pode: false, aLer: false });
    expect(m.rpc).not.toHaveBeenCalled();
  });
});
