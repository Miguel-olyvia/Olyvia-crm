// Mudar o telefone e o email principais da pessoa com neg_substituir_contacto: o que não se muda vai a null (a base não mexe).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { ErroNeg } from "./chamarNeg";
import { PESSOA_ID } from "./fichaFabrica";
import { captureMock, criarCliente, fonteReal, montarHook, nomeChamado, parametros, respostaErro, respostaOk, rpcMock } from "./fichaTestUtil";
import { useSubstituirContactoPessoa } from "./useSubstituirContactoPessoa";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpcMock(...args) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));

beforeEach(() => { rpcMock.mockReset(); captureMock.mockReset(); });
afterEach(() => vi.clearAllMocks());

const OK = { email_depois: "a@b.pt", telefone_depois: "912345678", email_mudou: true, telefone_mudou: false, mudou: true };
const montar = () => {
  const client = criarCliente();
  client.setQueryData(["neg-ficha-pessoa", "org-1", PESSOA_ID], { x: 1 });
  const r = montarHook((id: string) => useSubstituirContactoPessoa(id), PESSOA_ID, { client });
  return { ...r, invalidada: () => client.getQueryState(["neg-ficha-pessoa", "org-1", PESSOA_ID])?.isInvalidated };
};

describe("useSubstituirContactoPessoa", () => {
  it("manda só o que muda: o que falta vai a null", async () => {
    rpcMock.mockReturnValue(respostaOk(OK));
    const { result } = montar();
    await act(async () => { await result.current.guardar({ email: "  a@b.pt " }); });
    expect(nomeChamado(0)).toBe("neg_substituir_contacto");
    expect(parametros(0)).toEqual({ p_organization_id: "org-1", p_entity_id: PESSOA_ID, p_email: "a@b.pt", p_telefone: null });
  });

  it("telefone e email juntos; vazio conta como não mexer", async () => {
    rpcMock.mockReturnValue(respostaOk(OK));
    const { result } = montar();
    await act(async () => { await result.current.guardar({ email: "", telefone: "912 345 678" }); });
    expect(parametros(0)).toMatchObject({ p_email: null, p_telefone: "912 345 678" });
  });

  it("sem nada para mudar não chama a base", async () => {
    const { result } = montar();
    let r;
    await act(async () => { r = await result.current.guardar({ email: " ", telefone: undefined }); });
    expect(r).toEqual({ email: null, telefone: null, mudou: false });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("lê o resultado e refaz a ficha", async () => {
    rpcMock.mockReturnValue(respostaOk(OK));
    const { result, invalidada } = montar();
    let r;
    await act(async () => { r = await result.current.guardar({ email: "a@b.pt" }); });
    expect(r).toEqual({ email: "a@b.pt", telefone: "912345678", mudou: true });
    expect(invalidada()).toBe(true);
  });

  it("NG019 (contacto de outra pessoa) lança ErroNeg e não toca na ficha", async () => {
    rpcMock.mockReturnValue(respostaErro("NG019"));
    const { result, invalidada } = montar();
    let erro: unknown;
    await act(async () => { erro = await result.current.guardar({ email: "a@b.pt" }).then(() => null, (e) => e); });
    expect(erro).toBeInstanceOf(ErroNeg);
    expect((erro as ErroNeg).codigo).toBe("NG019");
    expect(invalidada()).toBeFalsy();
  });

  it("sem pessoa lança o erro genérico sem chamar a base", async () => {
    const { result } = montarHook((id: string) => useSubstituirContactoPessoa(id), "", { fonte: fonteReal() });
    let erro: unknown;
    await act(async () => { erro = await result.current.guardar({ email: "a@b.pt" }).then(() => null, (e) => e); });
    expect(erro).toBeInstanceOf(ErroNeg);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
