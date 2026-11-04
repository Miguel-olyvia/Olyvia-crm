// 04/11/2026: a proposta no portal pede portal.manage OU negocios.proposta.enviar (fn_cat_pode), a mesma regra de create-client-portal-access.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const m = vi.hoisted(() => ({
  perms: new Set<string>(),
  org: "org-1" as string | null,
  rpc: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => m.rpc(...a) } }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: m.org ? { id: m.org } : null }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: (c: string) => m.perms.has(c), loading: false }) }));

import { usePodeEnviarPropostaPortal } from "./usePodeEnviarPropostaPortal";

beforeEach(() => { m.perms = new Set(); m.org = "org-1"; m.rpc.mockReset(); });
afterEach(() => vi.clearAllMocks());

describe("usePodeEnviarPropostaPortal", () => {
  it("com portal.manage pode, sem perguntar à base", () => {
    m.perms.add("portal.manage");
    const { result } = renderHook(() => usePodeEnviarPropostaPortal());
    expect(result.current).toEqual({ pode: true, aLer: false });
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("com negocios.proposta.enviar (fn_cat_pode na organização ativa) pode", async () => {
    m.rpc.mockResolvedValue({ data: true, error: null });
    const { result } = renderHook(() => usePodeEnviarPropostaPortal());
    expect(result.current).toEqual({ pode: false, aLer: true });
    await waitFor(() => expect(result.current).toEqual({ pode: true, aLer: false }));
    expect(m.rpc).toHaveBeenCalledWith("fn_cat_pode", { p_org: "org-1", p_perm: "negocios.proposta.enviar" });
  });

  it("sem nenhuma das duas não pode (client_contracts.edit já não chega)", async () => {
    m.perms.add("client_contracts.edit");
    m.rpc.mockResolvedValue({ data: false, error: null });
    const { result } = renderHook(() => usePodeEnviarPropostaPortal());
    await waitFor(() => expect(result.current.aLer).toBe(false));
    expect(result.current.pode).toBe(false);
  });

  it("uma leitura que falha vale «não»", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { result } = renderHook(() => usePodeEnviarPropostaPortal());
    await waitFor(() => expect(result.current.aLer).toBe(false));
    expect(result.current.pode).toBe(false);
  });

  it("inativo (contrato) não pergunta nada e não pode", () => {
    const { result } = renderHook(() => usePodeEnviarPropostaPortal(false));
    expect(result.current).toEqual({ pode: false, aLer: false });
    expect(m.rpc).not.toHaveBeenCalled();
  });
});
