// Guardar a identidade da pessoa (tipo e nome, SEM NIF) com um UPDATE direto à entidade (anew_entities): só as colunas type, display_name,
// first_name e last_name, filtrado pela organização, invalidação só depois de sucesso e erros traduzíveis. O Supabase é simulado.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { ErroNeg } from "./chamarNeg";
import { PESSOA_ID } from "./fichaFabrica";
import { captureMock, criarCliente, fonteReal, montarHook } from "./fichaTestUtil";
import { useGuardarIdentidadePessoa } from "./useGuardarIdentidadePessoa";

const fromMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const eqMock = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (...args: unknown[]) => fromMock(...args) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));

type Resposta = { data: unknown; error: unknown };
const responde = (r: Resposta) => selectMock.mockReturnValue(Promise.resolve(r));

beforeEach(() => {
  captureMock.mockReset();
  fromMock.mockReset();
  updateMock.mockReset();
  eqMock.mockReset();
  selectMock.mockReset();
  const cadeia = { update: updateMock, eq: eqMock, select: selectMock };
  fromMock.mockReturnValue(cadeia);
  updateMock.mockReturnValue(cadeia);
  eqMock.mockReturnValue(cadeia);
});
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
const escrito = (): Record<string, unknown> => updateMock.mock.calls[0][0] as Record<string, unknown>;

describe("useGuardarIdentidadePessoa: o que se escreve na entidade", () => {
  it("empresa: o nome da empresa (aparado) é o nome da entidade e fica sem nome próprio nem apelido", async () => {
    responde({ data: [{ id: PESSOA_ID, type: "organization", display_name: "Obras Lda" }], error: null });
    const { result } = montar();
    let r;
    await act(async () => { r = await result.current.guardar({ tipo: "organization", nomeEmpresa: "  Obras   Lda  " }); });
    expect(fromMock).toHaveBeenCalledWith("anew_entities");
    expect(escrito()).toEqual({ type: "organization", display_name: "Obras Lda", first_name: null, last_name: null });
    expect(r).toEqual({ tipo: "organization", nome: "Obras Lda", empresaNome: "Obras Lda", mudou: true });
  });

  it("só atualiza a pessoa certa, desta organização", async () => {
    responde({ data: [{ id: PESSOA_ID, type: "organization", display_name: "A" }], error: null });
    const { result } = montar();
    await act(async () => { await result.current.guardar({ tipo: "organization", nomeEmpresa: "A" }); });
    expect(eqMock).toHaveBeenCalledWith("id", PESSOA_ID);
    expect(eqMock).toHaveBeenCalledWith("organization_id", "org-1");
  });

  it("pessoa singular: nome próprio e apelido apanhados, e o nome visível é a junção dos dois", async () => {
    responde({ data: [{ id: PESSOA_ID, type: "person", display_name: "Ana Lopes" }], error: null });
    const { result } = montar();
    let r;
    await act(async () => { r = await result.current.guardar({ tipo: "person", nomeProprio: " Ana ", apelido: " Lopes " }); });
    expect(escrito()).toEqual({ type: "person", display_name: "Ana Lopes", first_name: "Ana", last_name: "Lopes" });
    expect(r).toEqual({ tipo: "person", nome: "Ana Lopes", empresaNome: null, mudou: true });
  });

  it("pessoa singular sem mexer no nome: muda só o tipo, nunca apaga o nome que lá está", async () => {
    responde({ data: [{ id: PESSOA_ID, type: "person", display_name: "Ana Lopes" }], error: null });
    const { result } = montar();
    await act(async () => { await result.current.guardar({ tipo: "person" }); });
    expect(escrito()).toEqual({ type: "person" });
  });

  it("um texto só de espaços vale como em falta: não escreve nome nenhum", async () => {
    responde({ data: [{ id: PESSOA_ID, type: "person", display_name: "x" }], error: null });
    const { result } = montar();
    await act(async () => { await result.current.guardar({ tipo: "person", nomeProprio: "   ", apelido: "" }); });
    expect(escrito()).toEqual({ type: "person" });
  });

  it("nunca escreve NIF nem outras colunas além do tipo e do nome", async () => {
    responde({ data: [{ id: PESSOA_ID, type: "organization", display_name: "A" }], error: null });
    const { result } = montar();
    await act(async () => { await result.current.guardar({ tipo: "organization", nomeEmpresa: "A" }); });
    expect(Object.keys(escrito()).sort()).toEqual(["display_name", "first_name", "last_name", "type"]);
  });
});

describe("useGuardarIdentidadePessoa: invalidação e erros", () => {
  it("depois de um sucesso refaz a ficha e as listas", async () => {
    responde({ data: [{ id: PESSOA_ID, type: "organization", display_name: "A" }], error: null });
    const { result, invalidadas } = montar();
    await act(async () => { await result.current.guardar({ tipo: "organization", nomeEmpresa: "A" }); });
    expect(invalidadas()).toEqual([true, true]);
  });

  it("nenhuma linha atualizada (não existe, apagada ou escondida) devolve a chave ng003 e não invalida nada", async () => {
    responde({ data: [], error: null });
    const { result, invalidadas } = montar();
    const erro = await erroDe(act(async () => { await result.current.guardar({ tipo: "organization", nomeEmpresa: "A" }); }));
    expect(erro).toBeInstanceOf(ErroNeg);
    expect(erro.chave).toBe("pessoasPagina.erroNeg.ng003");
    expect(invalidadas()).toEqual([false, false]);
  });

  it("sem permissão (42501) dá a chave de permissão", async () => {
    responde({ data: null, error: { code: "42501", message: "x" } });
    const { result, invalidadas } = montar();
    const erro = await erroDe(act(async () => { await result.current.guardar({ tipo: "person", nomeProprio: "A", apelido: "B" }); }));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.permissao");
    expect(invalidadas()).toEqual([false, false]);
  });

  it("um erro desconhecido dá a chave genérica e fica registado", async () => {
    responde({ data: null, error: { code: "XX000", message: "boom" } });
    const { result } = montar();
    const erro = await erroDe(act(async () => { await result.current.guardar({ tipo: "person", nomeProprio: "A", apelido: "B" }); }));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.generico");
    expect(captureMock).toHaveBeenCalled();
  });

  it("sem organização (modo exemplo) recusa sem chamar a base", async () => {
    const { result } = montar({ fonte: { modo: "exemplo" } });
    const erro = await erroDe(act(async () => { await result.current.guardar({ tipo: "organization", nomeEmpresa: "A" }); }));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.generico");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("sem pessoa (id vazio) recusa sem chamar a base", async () => {
    const r = montarHook((id: string) => useGuardarIdentidadePessoa(id), "", { fonte: fonteReal() });
    const erro = await erroDe(act(async () => { await r.result.current.guardar({ tipo: "organization", nomeEmpresa: "A" }); }));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.generico");
    expect(fromMock).not.toHaveBeenCalled();
  });
});
