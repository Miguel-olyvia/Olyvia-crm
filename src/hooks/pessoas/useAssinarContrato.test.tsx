// Registar a assinatura de um contrato no guia: finaliza o contrato pela automação do pipeline com o utilizador da sessão; `false` quando a automação
// recusa (já avisou), e lança sem sessão.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const h = vi.hoisted(() => ({ finalizar: vi.fn(), user: { valor: { id: "auth-1" } as { id: string } | null }, erroSessao: { valor: null as { message: string } | null } }));

vi.mock("@/hooks/usePipelineAutomation", () => ({ usePipelineAutomation: () => ({ finalizeContract: (...a: unknown[]) => h.finalizar(...a) }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getUser: () => Promise.resolve({ data: { user: h.user.valor }, error: h.erroSessao.valor }) } } }));

import { useAssinarContrato } from "./useAssinarContrato";

beforeEach(() => {
  h.finalizar.mockReset().mockResolvedValue({ success: true });
  h.user.valor = { id: "auth-1" };
  h.erroSessao.valor = null;
});

const PERM = ["client_contracts.edit"];

describe("useAssinarContrato", () => {
  it("finaliza o contrato com o utilizador da sessão e diz que correu bem", async () => {
    const { result } = renderHook(() => useAssinarContrato());
    await expect(result.current("c1", PERM)).resolves.toBe(true);
    expect(h.finalizar).toHaveBeenCalledWith({ contract_id: "c1", user_id: "auth-1" });
  });

  it("quando a automação recusa (null) devolve false", async () => {
    h.finalizar.mockResolvedValue(null);
    const { result } = renderHook(() => useAssinarContrato());
    await expect(result.current("c1", PERM)).resolves.toBe(false);
  });

  it("sem client_contracts.edit na lista recusa-se, sem lista conhecida também (falha fechada), e não finaliza nada; com ela finaliza", async () => {
    const { result } = renderHook(() => useAssinarContrato());
    await expect(result.current("c1", ["proposals.edit"])).rejects.toThrow("permissão");
    expect(h.finalizar).not.toHaveBeenCalled();
    await expect(result.current("c1", undefined)).rejects.toThrow("permissões");
    expect(h.finalizar).not.toHaveBeenCalled();
    await expect(result.current("c1", ["client_contracts.edit"])).resolves.toBe(true);
  });

  it("sem sessão lança e não finaliza nada", async () => {
    h.user.valor = null;
    const { result } = renderHook(() => useAssinarContrato());
    await expect(result.current("c1", PERM)).rejects.toThrow("Not authenticated");
    expect(h.finalizar).not.toHaveBeenCalled();
  });

  it("se a leitura da sessão falha, lança esse erro e não finaliza nada", async () => {
    h.erroSessao.valor = { message: "rede" };
    const { result } = renderHook(() => useAssinarContrato());
    await expect(result.current("c1", PERM)).rejects.toMatchObject({ message: "rede" });
    expect(h.finalizar).not.toHaveBeenCalled();
  });
});
