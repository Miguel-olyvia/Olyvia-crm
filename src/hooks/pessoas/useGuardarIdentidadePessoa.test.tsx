// Guardar a identidade da pessoa (tipo e nome, SEM NIF) com neg_guardar_identidade_pessoa: parâmetros exatos (a assinatura é
// uuid, uuid, text, text, text, text), invalidação só depois de sucesso e erros traduzíveis. O Supabase é simulado.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { ErroNeg } from "./chamarNeg";
import { PESSOA_ID } from "./fichaFabrica";
import { captureMock, criarCliente, fonteReal, montarHook, nomeChamado, parametros, respostaErro, respostaOk, rpcMock } from "./fichaTestUtil";
import { useGuardarIdentidadePessoa } from "./useGuardarIdentidadePessoa";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpcMock(...args) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));

beforeEach(() => { rpcMock.mockReset(); captureMock.mockReset(); });
afterEach(() => vi.clearAllMocks());

const montar = (sobre: Parameters<typeof montarHook>[2] = {}) => {
  const client = sobre.client ?? criarCliente();
  client.setQueryData(["neg-ficha-pessoa", "org-1", PESSOA_ID], { x: 1 });
  client.setQueryData(["neg-resumo-pessoas", "org-1", { papel: null }], { x: 2 });
  const r = montarHook((id: string) => useGuardarIdentidadePessoa(id), PESSOA_ID, { ...sobre, client });
  const invalidadas = () => [client.getQueryState(["neg-ficha-pessoa", "org-1", PESSOA_ID])?.isInvalidated, client.getQueryState(["neg-resumo-pessoas", "org-1", { papel: null }])?.isInvalidated];
  return { ...r, client, invalidadas };
};
const erroDe = async (p: Promise<unknown> | void): Promise<ErroNeg> => ((await Promise.resolve(p).then(() => null, (e) => e)) as ErroNeg);

describe("useGuardarIdentidadePessoa: parâmetros", () => {
  it("empresa: manda o tipo e o nome da empresa aparado, sem nome próprio nem apelido", async () => {
    rpcMock.mockReturnValue(respostaOk({ tipo: "organization", nome: "Obras Lda", empresa_nome: "Obras Lda", mudou: true }));
    const { result } = montar();
    let r;
    await act(async () => { r = await result.current.guardar({ tipo: "organization", nomeEmpresa: "  Obras Lda  " }); });
    expect(nomeChamado(0)).toBe("neg_guardar_identidade_pessoa");
    expect(parametros(0)).toEqual({
      p_organization_id: "org-1", p_entity_id: PESSOA_ID, p_tipo: "organization", p_nome_empresa: "Obras Lda", p_nome_proprio: null, p_apelido: null,
    });
    expect(r).toEqual({ tipo: "organization", nome: "Obras Lda", empresaNome: "Obras Lda", mudou: true });
  });

  it("pessoa singular com nome: manda tipo, nome próprio e apelido apanhados, sem nome de empresa", async () => {
    rpcMock.mockReturnValue(respostaOk({ tipo: "person", nome: "Ana Lopes", empresa_nome: null, mudou: true }));
    const { result } = montar();
    await act(async () => { await result.current.guardar({ tipo: "person", nomeProprio: " Ana ", apelido: " Lopes " }); });
    expect(parametros(0)).toEqual({
      p_organization_id: "org-1", p_entity_id: PESSOA_ID, p_tipo: "person", p_nome_empresa: null, p_nome_proprio: "Ana", p_apelido: "Lopes",
    });
  });

  it("pessoa singular sem mexer no nome: os nomes vão a null (a base mantém o que lá está)", async () => {
    rpcMock.mockReturnValue(respostaOk({ tipo: "person", nome: "Ana Lopes", empresa_nome: null, mudou: false }));
    const { result } = montar();
    await act(async () => { await result.current.guardar({ tipo: "person" }); });
    expect(parametros(0)).toMatchObject({ p_tipo: "person", p_nome_proprio: null, p_apelido: null, p_nome_empresa: null });
  });

  it("um texto só de espaços vale como em falta (null), nunca uma cadeia vazia", async () => {
    rpcMock.mockReturnValue(respostaOk({ tipo: "person", nome: "x", empresa_nome: null, mudou: false }));
    const { result } = montar();
    await act(async () => { await result.current.guardar({ tipo: "person", nomeProprio: "   ", apelido: "" }); });
    expect(parametros(0)).toMatchObject({ p_nome_proprio: null, p_apelido: null });
  });

  it("nunca manda NIF nem outro parâmetro além dos seis da assinatura", async () => {
    rpcMock.mockReturnValue(respostaOk({ tipo: "organization", nome: "A", empresa_nome: "A", mudou: false }));
    const { result } = montar();
    await act(async () => { await result.current.guardar({ tipo: "organization", nomeEmpresa: "A" }); });
    expect(Object.keys(parametros(0)).sort()).toEqual(["p_apelido", "p_entity_id", "p_nome_empresa", "p_nome_proprio", "p_organization_id", "p_tipo"]);
  });

  it("uma resposta que não se reconhece não rebenta: o resultado vem sem nome e sem alteração", async () => {
    rpcMock.mockReturnValue(respostaOk(null));
    const { result } = montar();
    let r;
    await act(async () => { r = await result.current.guardar({ tipo: "organization", nomeEmpresa: "A" }); });
    expect(r).toEqual({ tipo: null, nome: null, empresaNome: null, mudou: false });
  });
});

describe("useGuardarIdentidadePessoa: invalidação e erros", () => {
  it("depois de um sucesso refaz a ficha e as listas", async () => {
    rpcMock.mockReturnValue(respostaOk({ tipo: "organization", nome: "A", empresa_nome: "A", mudou: true }));
    const { result, invalidadas } = montar();
    await act(async () => { await result.current.guardar({ tipo: "organization", nomeEmpresa: "A" }); });
    expect(invalidadas()).toEqual([true, true]);
  });

  it("NG003 (pessoa partilhada, não existe ou não se vê) devolve a chave genérica e não invalida nada", async () => {
    rpcMock.mockReturnValue(respostaErro("NG003"));
    const { result, invalidadas } = montar();
    const erro = await erroDe(act(async () => { await result.current.guardar({ tipo: "organization", nomeEmpresa: "A" }); }));
    expect(erro).toBeInstanceOf(ErroNeg);
    expect(erro.chave).toBe("pessoasPagina.erroNeg.ng003");
    expect(invalidadas()).toEqual([false, false]);
  });

  it.each([["NG009", "ng009"], ["NG008", "ng008"], ["42501", "permissao"]])("%s dá a chave %s", async (codigo, chave) => {
    rpcMock.mockReturnValue(respostaErro(codigo));
    const { result } = montar();
    const erro = await erroDe(act(async () => { await result.current.guardar({ tipo: "person", nomeProprio: "A", apelido: "B" }); }));
    expect(erro.chave).toBe(`pessoasPagina.erroNeg.${chave}`);
  });

  it("sem organização (modo exemplo) recusa sem chamar a base", async () => {
    const { result } = montar({ fonte: { modo: "exemplo" } });
    const erro = await erroDe(act(async () => { await result.current.guardar({ tipo: "organization", nomeEmpresa: "A" }); }));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.generico");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("sem pessoa (id vazio) recusa sem chamar a base", async () => {
    const r = montarHook((id: string) => useGuardarIdentidadePessoa(id), "", { fonte: fonteReal() });
    const erro = await erroDe(act(async () => { await r.result.current.guardar({ tipo: "organization", nomeEmpresa: "A" }); }));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.generico");
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
