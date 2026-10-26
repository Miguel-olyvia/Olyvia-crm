// Gravar o NIF da pessoa com neg_guardar_nif_pessoa, pelo nif-write-proxy (o hash e a cifra só se calculam no servidor). O NIF nunca vai a log nem a erro.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { ErroNeg } from "./chamarNeg";
import { PESSOA_ID } from "./fichaFabrica";
import { captureMock, criarCliente, fonteReal, montarHook } from "./fichaTestUtil";
import { useGuardarNifPessoa } from "./useGuardarNifPessoa";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));

beforeEach(() => { invoke.mockReset(); captureMock.mockReset(); });
afterEach(() => vi.clearAllMocks());

const OK = { data: { data: { nif_ultimos3: "789", mudou: true } }, error: null };
const erroHttp = (status: number, corpo: unknown) => ({
  data: null, error: { message: "Edge Function returned a non-2xx status code", context: { status, json: async () => corpo } },
});
const montar = (exemplo = false) => {
  const client = criarCliente();
  client.setQueryData(["neg-ficha-pessoa", "org-1", PESSOA_ID], { x: 1 });
  const fonte = exemplo ? ({ modo: "exemplo" } as never) : fonteReal();
  const r = montarHook((id: string) => useGuardarNifPessoa(id), PESSOA_ID, { client, fonte });
  return { ...r, invalidada: () => client.getQueryState(["neg-ficha-pessoa", "org-1", PESSOA_ID])?.isInvalidated };
};
const gravar = async (r: ReturnType<typeof montar>, nif: string): Promise<{ resultado?: unknown; erro?: unknown }> => {
  let saida: { resultado?: unknown; erro?: unknown } = {};
  await act(async () => {
    try { saida = { resultado: await r.result.current.guardar(nif) }; } catch (erro) { saida = { erro }; }
  });
  return saida;
};

describe("useGuardarNifPessoa", () => {
  it("chama o proxy com a função, o NIF à parte e os parâmetros da função; devolve só os últimos 3 e se mudou", async () => {
    invoke.mockResolvedValue(OK);
    const r = montar();
    const { resultado } = await gravar(r, "123456789");
    expect(invoke).toHaveBeenCalledWith("nif-write-proxy", {
      body: { rpc: "neg_guardar_nif_pessoa", nif: "123456789", params: { p_organization_id: "org-1", p_entity_id: PESSOA_ID, p_nif: "123456789" } },
    });
    expect(resultado).toEqual({ nifUltimos3: "789", mudou: true });
    expect(r.invalidada()).toBe(true);
  });

  it("vazio limpa: NIF a null no proxy e p_nif vazio na função", async () => {
    invoke.mockResolvedValue({ data: { data: { nif_ultimos3: null, mudou: true } }, error: null });
    const { resultado } = await gravar(montar(), "  ");
    expect(invoke.mock.calls[0][1]).toEqual({ body: { rpc: "neg_guardar_nif_pessoa", nif: null, params: { p_organization_id: "org-1", p_entity_id: PESSOA_ID, p_nif: "" } } });
    expect(resultado).toEqual({ nifUltimos3: null, mudou: true });
  });

  it("uma resposta que não se reconhece dá tudo a null e mudou falso", async () => {
    invoke.mockResolvedValue({ data: { data: 5 }, error: null });
    expect((await gravar(montar(), "123456789")).resultado).toEqual({ nifUltimos3: null, mudou: false });
  });

  it("NIF repetido (NG030): erro com o código e a chave própria, sem avaria no Sentry", async () => {
    invoke.mockResolvedValue(erroHttp(400, { error: "NG030 NIF ja existe" }));
    const { erro } = await gravar(montar(), "123456789");
    expect(erro).toBeInstanceOf(ErroNeg);
    expect(erro).toMatchObject({ codigo: "NG030", chave: "pessoasPagina.erroNeg.ng030" });
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("NIF inválido na base (NG009) e pessoa indisponível (NG003) têm a sua chave", async () => {
    invoke.mockResolvedValue(erroHttp(400, { error: "NG009 valor invalido" }));
    expect((await gravar(montar(), "123456789")).erro).toMatchObject({ codigo: "NG009", chave: "pessoasPagina.erroNeg.ng009" });
    invoke.mockResolvedValue(erroHttp(400, { error: "NG003 pessoa indisponivel" }));
    expect((await gravar(montar(), "123456789")).erro).toMatchObject({ codigo: "NG003" });
  });

  it("a função ainda não existe (proxy sem ela na lista, ou função por aplicar): diz que não está disponível, não é avaria genérica", async () => {
    invoke.mockResolvedValue(erroHttp(400, { error: "RPC não permitida" }));
    expect((await gravar(montar(), "123456789")).erro).toMatchObject({ codigo: null, chave: "pessoasPagina.erroNeg.nifIndisponivel" });
    invoke.mockResolvedValue(erroHttp(404, { error: "Could not find the function public.neg_guardar_nif_pessoa(p_entity_id) in the schema cache" }));
    expect((await gravar(montar(), "123456789")).erro).toMatchObject({ chave: "pessoasPagina.erroNeg.nifIndisponivel" });
    invoke.mockResolvedValue(erroHttp(400, { error: "function public.neg_guardar_nif_pessoa does not exist" }));
    expect((await gravar(montar(), "123456789")).erro).toMatchObject({ chave: "pessoasPagina.erroNeg.nifIndisponivel" });
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("um 404 sozinho (pessoa inexistente, outro erro) NÃO é «ainda não disponível»", async () => {
    invoke.mockResolvedValue(erroHttp(404, { error: "NG003 pessoa indisponivel" }));
    expect((await gravar(montar(), "123456789")).erro).toMatchObject({ codigo: "NG003", chave: "pessoasPagina.erroNeg.ng003" });
    invoke.mockResolvedValue(erroHttp(404, { error: "Not found" }));
    expect((await gravar(montar(), "123456789")).erro).toMatchObject({ chave: "pessoasPagina.erroNeg.generico" });
  });

  it("uma falha de rede ou desconhecida dá a mensagem genérica, vai ao Sentry e o NIF não aparece em nada", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } });
    const { erro } = await gravar(montar(), "123456789");
    expect(erro).toMatchObject({ chave: "pessoasPagina.erroNeg.generico" });
    expect(captureMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify([captureMock.mock.calls, String((erro as Error).message)])).not.toContain("123456789");
  });

  it("uma exceção ao invocar também sai como ErroNeg", async () => {
    invoke.mockRejectedValue(new Error("boom"));
    expect((await gravar(montar(), "123456789")).erro).toBeInstanceOf(ErroNeg);
  });

  it("sem organização (exemplo) não chama o proxy", async () => {
    const { erro } = await gravar(montar(true), "123456789");
    expect(erro).toMatchObject({ chave: "pessoasPagina.erroNeg.generico" });
    expect(invoke).not.toHaveBeenCalled();
  });
});
