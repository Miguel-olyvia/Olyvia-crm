// `useMutacoesNegocio` entrega também as escritas diretas (editar, lixo, restaurar e condições): as mesmas mutações da ficha, num só objeto.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { PESSOA_ID } from "./fichaFabrica";
import { captureMock, montarHook, rpcMock } from "./fichaTestUtil";
import { useMutacoesNegocio } from "./useMutacoesNegocio";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpcMock(...a), from: (...a: unknown[]) => fromMock(...a) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...a: unknown[]) => captureMock(...a) }));

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
  const c: Record<string, unknown> = {};
  for (const m of ["update", "eq", "is", "not"]) c[m] = () => c;
  c.select = () => Promise.resolve({ data: [{ id: "n1" }], error: null });
  fromMock.mockReturnValue(c);
});

describe("useMutacoesNegocio: escritas diretas", () => {
  it("traz as quatro escritas ao lado das funções neg_*", () => {
    const { result } = montarHook(() => useMutacoesNegocio(PESSOA_ID, null), undefined);
    for (const nome of ["editar", "enviarParaLixo", "restaurar", "guardarCondicoes", "perder", "anular", "ganhar", "criar", "ligar", "desligar"] as const) {
      expect(typeof result.current[nome], nome).toBe("function");
    }
  });

  it("as escritas diretas vão por UPDATE (from) e nunca por uma função neg_*", async () => {
    const { result } = montarHook(() => useMutacoesNegocio(PESSOA_ID, null), undefined);
    await act(async () => { await result.current.enviarParaLixo?.("n1"); });
    expect(fromMock).toHaveBeenCalledWith("negocios");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("o objeto das mutações não muda entre renders (os ecrãs memorizam por ele)", () => {
    const { result, rerender } = montarHook(() => useMutacoesNegocio(PESSOA_ID, null), undefined);
    const antes = result.current;
    rerender(undefined);
    expect(result.current).toBe(antes);
  });
});
