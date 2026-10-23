// A ficha lida traz o tipo de fecho de cada negócio (lido de `negocios`), e uma leitura do tipo que falhe não impede a ficha de abrir.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { fichaDb, negocioDb, PESSOA_ID } from "./fichaFabrica";
import { captureMock, fonteReal, montarHook, respostaOk, rpcMock } from "./fichaTestUtil";
import { useFichaPessoa } from "./useFichaPessoa";

const { fechosMock } = vi.hoisted(() => ({ fechosMock: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: () => {
      const c: Record<string, unknown> = {};
      for (const m of ["select", "in", "eq"]) c[m] = () => c;
      c.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve().then(() => fechosMock()).then(ok, ko);
      return c;
    },
  },
}));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));

const montar = () => montarHook((i: string) => useFichaPessoa(i), PESSOA_ID, { fonte: fonteReal() });
const comNegocios = () => fichaDb({ negocios: { total: 2, itens: [negocioDb({ id: "n1" }), negocioDb({ id: "n2" })] } });

beforeEach(() => { rpcMock.mockReset(); captureMock.mockReset(); fechosMock.mockReset(); });

describe("useFichaPessoa: o tipo de fecho dos negócios", () => {
  it("a ficha chega com o fecho de cada negócio", async () => {
    rpcMock.mockReturnValue(respostaOk(comNegocios()));
    fechosMock.mockReturnValue({ data: [{ id: "n1", fecho: "proposta" }, { id: "n2", fecho: "contrato" }], error: null });
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    expect(result.current.ficha?.negocios?.itens.map((n) => n.fecho)).toEqual(["proposta", "contrato"]);
  });

  it("se a leitura do tipo falha a ficha abre na mesma, sem tipo (e a falha fica observável)", async () => {
    rpcMock.mockReturnValue(respostaOk(comNegocios()));
    fechosMock.mockReturnValue({ data: null, error: { code: "42501", message: "x" } });
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    expect(result.current.ficha?.negocios?.itens.map((n) => n.fecho)).toEqual([undefined, undefined]);
    expect(captureMock).toHaveBeenCalledTimes(1);
  });

  it("uma pessoa sem negócios não lê a tabela", async () => {
    rpcMock.mockReturnValue(respostaOk(fichaDb()));
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    expect(fechosMock).not.toHaveBeenCalled();
  });
});
