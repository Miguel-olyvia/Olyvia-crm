/**
 * `usePessoaConta`: as escritas da conta (IBAN/BIC e ligacao a uma conta de
 * CRM) extraidas de `usePessoa`. Cada accao chama a RPC certa com os
 * argumentos certos, por dentro do `guardar` da ficha (que trata do estado,
 * do recarregamento e do registo de erros). `hrRpc` simulado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const hrRpc = vi.fn();
vi.mock("@/lib/hr/hrDb", () => ({
  hrRpc: (...args: unknown[]) => hrRpc(...args),
}));

import { usePessoaConta } from "../usePessoaConta";

type Guardar = (executar: (autorId: string | null) => Promise<{ error: unknown }>) => Promise<string | null>;

/** Um `guardar` que corre o que lhe passam e devolve a mensagem do erro, ou null. */
const guardar: Guardar = async (executar) => {
  const { error } = await executar("autor-1");
  return error ? "falhou" : null;
};

beforeEach(() => {
  hrRpc.mockReset();
  hrRpc.mockResolvedValue({ data: true, error: null });
});

describe("usePessoaConta", () => {
  it("definirConta chama rpc_hr_definir_conta com o BIC em p_swift e nulos por omissao", async () => {
    const { result } = renderHook(() => usePessoaConta("p1", guardar));
    const erro = await result.current.definirConta({ formato: "iban", conta: "PT50000201231234567890154" });
    expect(erro).toBeNull();
    expect(hrRpc).toHaveBeenCalledWith("rpc_hr_definir_conta", {
      p_pessoa_id: "p1",
      p_formato: "iban",
      p_conta: "PT50000201231234567890154",
      p_titular: null,
      p_banco: null,
      p_agencia: null,
      p_swift: null,
    });

    await result.current.definirConta({
      formato: "iban",
      conta: "PT50000201231234567890154",
      titular: "Ana",
      banco: "CGD",
      agencia: "01",
      swift: "CGDIPTPL",
    });
    expect(hrRpc).toHaveBeenLastCalledWith(
      "rpc_hr_definir_conta",
      expect.objectContaining({ p_titular: "Ana", p_banco: "CGD", p_agencia: "01", p_swift: "CGDIPTPL" }),
    );
  });

  it("definirBic chama so rpc_hr_definir_bic (nunca a da conta) e aceita null para limpar", async () => {
    const { result } = renderHook(() => usePessoaConta("p1", guardar));
    await result.current.definirBic("CGDIPTPL");
    expect(hrRpc).toHaveBeenCalledTimes(1);
    expect(hrRpc).toHaveBeenCalledWith("rpc_hr_definir_bic", { p_pessoa_id: "p1", p_bic: "CGDIPTPL" });

    await result.current.definirBic(null);
    expect(hrRpc).toHaveBeenLastCalledWith("rpc_hr_definir_bic", { p_pessoa_id: "p1", p_bic: null });
  });

  it("ligarConta e revogarConta chamam as RPCs de ligacao", async () => {
    const { result } = renderHook(() => usePessoaConta("p1", guardar));
    await result.current.ligarConta("u1");
    expect(hrRpc).toHaveBeenLastCalledWith("rpc_hr_ligar_conta", { p_pessoa_id: "p1", p_anew_user_id: "u1" });
    await result.current.revogarConta("saiu");
    expect(hrRpc).toHaveBeenLastCalledWith("rpc_hr_revogar_conta", { p_pessoa_id: "p1", p_motivo: "saiu" });
    await result.current.revogarConta(null);
    expect(hrRpc).toHaveBeenLastCalledWith("rpc_hr_revogar_conta", { p_pessoa_id: "p1", p_motivo: null });
  });

  it("devolve a mensagem de erro do guardar quando a RPC falha", async () => {
    hrRpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { result } = renderHook(() => usePessoaConta("p1", guardar));
    expect(await result.current.definirBic("CGDIPTPL")).toBe("falhou");
  });

  it("mantem as mesmas funcoes entre renders com os mesmos argumentos", () => {
    const { result, rerender } = renderHook(() => usePessoaConta("p1", guardar));
    const antes = result.current;
    rerender();
    expect(result.current.definirBic).toBe(antes.definirBic);
    expect(result.current.definirConta).toBe(antes.definirConta);
  });
});
