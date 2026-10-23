// useFichaPessoa: erro em cache ao reabrir, atualização falhada com dados, itens carregados que sobrevivem ao refetch e
// estados de «carregar mais» indexados por pessoa.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, waitFor } from "@testing-library/react";
import { atividadeDb, fichaDb, pessoaDb, PESSOA_ID, seccaoDb } from "./fichaFabrica";
import { captureMock, fonteReal, montarHook, parametros, respostaErro, respostaOk, rpcMock } from "./fichaTestUtil";
import { fichaPessoaQueryKey, useFichaPessoa } from "./useFichaPessoa";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpcMock(...args) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));

const OUTRA = "33333333-3333-4333-8333-333333333333";
const CURSOR = { em: "2026-10-01T09:00:00Z", id: "a2" };
const montar = (id: string | null = PESSOA_ID) => montarHook((i: string | null) => useFichaPessoa(i), id, { fonte: fonteReal() });
const doOutra = () => fichaDb({ pessoa: pessoaDb({ id: OUTRA, nome: "Outra" }) });
const comAtividade = (ids: string[], sobre = {}) => fichaDb({
  atividade: seccaoDb(ids.map((id) => atividadeDb({ id })), { total: 4, tem_mais: true, proximo: CURSOR, ...sobre }),
});

beforeEach(() => { rpcMock.mockReset(); captureMock.mockReset(); });

describe("erro em cache ao reabrir a mesma pessoa", () => {
  it("enquanto a nova leitura corre, não é uma falha (nem erro nem indisponível)", async () => {
    rpcMock.mockReturnValueOnce(respostaErro("NG009"));
    const { result, rerender } = montar();
    await waitFor(() => expect(result.current.estado).toBe("erro"));
    rpcMock.mockReturnValueOnce(respostaOk(doOutra()));
    rerender(OUTRA);
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    let resolver: (v: unknown) => void = () => undefined;
    rpcMock.mockReturnValueOnce(new Promise((r) => { resolver = r; }));
    rerender(PESSOA_ID);
    expect(result.current.estado).toBe("a-carregar");
    expect(result.current.erro).toBeNull();
    await act(async () => { resolver({ data: fichaDb(), error: null }); await Promise.resolve(); });
    await waitFor(() => expect(result.current.estado).toBe("ok"));
  });

  it("se a nova leitura também falha, volta a ser uma falha", async () => {
    rpcMock.mockReturnValueOnce(respostaErro("NG009"));
    const { result, rerender } = montar();
    await waitFor(() => expect(result.current.estado).toBe("erro"));
    rpcMock.mockReturnValueOnce(respostaOk(doOutra()));
    rerender(OUTRA);
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    rpcMock.mockReturnValueOnce(respostaErro("NG009"));
    rerender(PESSOA_ID);
    await waitFor(() => expect(result.current.estado).toBe("erro"));
  });
});

describe("atualização falhada com a ficha em cache", () => {
  it("continua ok, mas expõe o erro e atualizacaoFalhou", async () => {
    rpcMock.mockReturnValueOnce(respostaOk(fichaDb()));
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    expect(result.current.atualizacaoFalhou).toBe(false);
    rpcMock.mockReturnValueOnce(respostaErro("NG009"));
    act(() => result.current.recarregar());
    await waitFor(() => expect(result.current.atualizacaoFalhou).toBe(true));
    expect(result.current.estado).toBe("ok");
    expect(result.current.erro?.codigo).toBe("NG009");
    expect(result.current.ficha).not.toBeNull();
  });

  it("uma atualização seguinte bem-sucedida limpa o aviso", async () => {
    rpcMock.mockReturnValueOnce(respostaOk(fichaDb()));
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    rpcMock.mockReturnValueOnce(respostaErro("NG009"));
    act(() => result.current.recarregar());
    await waitFor(() => expect(result.current.atualizacaoFalhou).toBe(true));
    rpcMock.mockReturnValueOnce(respostaOk(fichaDb()));
    act(() => result.current.recarregar());
    await waitFor(() => expect(result.current.atualizacaoFalhou).toBe(false));
  });
});

describe("o refetch não apaga os itens já carregados", () => {
  it("depois de carregar mais e recarregar, os itens carregados continuam e o cursor é o das páginas já carregadas", async () => {
    rpcMock.mockReturnValueOnce(respostaOk(comAtividade(["a1", "a2"])));
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    rpcMock.mockReturnValueOnce(respostaOk(comAtividade(["a3", "a4"], { tem_mais: false, proximo: null })));
    await act(async () => { await result.current.carregarMais("atividade"); });
    expect(result.current.ficha?.atividade?.itens.map((i) => i.id)).toEqual(["a1", "a2", "a3", "a4"]);
    // a primeira página, agora com um item novo à frente
    rpcMock.mockReturnValueOnce(respostaOk(comAtividade(["a0", "a1"], { total: 5 })));
    act(() => result.current.recarregar());
    await waitFor(() => expect(result.current.ficha?.atividade?.itens.map((i) => i.id)).toEqual(["a0", "a1", "a2", "a3", "a4"]));
    expect(result.current.ficha?.atividade).toMatchObject({ total: 5, tem_mais: false, proximo: null });
  });

  it("sem itens carregados além da primeira página, o refetch mostra a página nova tal como veio", async () => {
    rpcMock.mockReturnValueOnce(respostaOk(comAtividade(["a1", "a2"])));
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    rpcMock.mockReturnValueOnce(respostaOk(comAtividade(["b1"], { total: 1, tem_mais: false, proximo: null })));
    act(() => result.current.recarregar());
    await waitFor(() => expect(result.current.ficha?.atividade?.itens.map((i) => i.id)).toEqual(["b1"]));
  });
});

describe("carregar mais indexado por pessoa", () => {
  it("um carregamento a meio de A não aparece em B, e o resultado de A só vai para a ficha de A", async () => {
    const { result, rerender, client } = montar();
    rpcMock.mockReturnValueOnce(respostaOk(comAtividade(["a1", "a2"])));
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    let resolver: (v: unknown) => void = () => undefined;
    rpcMock.mockReturnValueOnce(new Promise((r) => { resolver = r; }));
    let pendente: Promise<void> = Promise.resolve();
    act(() => { pendente = result.current.carregarMais("atividade"); });
    expect(result.current.carregandoTipos).toEqual(["atividade"]);
    rpcMock.mockReturnValueOnce(respostaOk(doOutra()));
    rerender(OUTRA);
    await waitFor(() => expect(result.current.ficha?.pessoa.id).toBe(OUTRA));
    expect(result.current.aCarregarMais).toBe(false);
    expect(result.current.carregandoTipos).toEqual([]);
    await act(async () => { resolver({ data: comAtividade(["a3"], { tem_mais: false, proximo: null }), error: null }); await pendente; });
    expect(result.current.ficha?.pessoa.id).toBe(OUTRA);
    expect(result.current.aCarregarMais).toBe(false);
    const deA = client.getQueryData<ReturnType<typeof fichaDb>>(fichaPessoaQueryKey("org-1", PESSOA_ID));
    expect(deA?.atividade?.itens.map((i) => i.id)).toEqual(["a1", "a2", "a3"]);
    expect(parametros(1).p_entity_id).toBe(PESSOA_ID);
  });

  it("uma falha de A não fica como erro de B", async () => {
    const { result, rerender } = montar();
    rpcMock.mockReturnValueOnce(respostaOk(comAtividade(["a1", "a2"])));
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    let rejeitar: (v: unknown) => void = () => undefined;
    rpcMock.mockReturnValueOnce(new Promise((r) => { rejeitar = r; }));
    let pendente: Promise<void> = Promise.resolve();
    act(() => { pendente = result.current.carregarMais("atividade"); });
    rpcMock.mockReturnValueOnce(respostaOk(doOutra()));
    rerender(OUTRA);
    await waitFor(() => expect(result.current.ficha?.pessoa.id).toBe(OUTRA));
    await act(async () => { rejeitar({ data: null, error: { code: "NG009", message: "x" } }); await pendente; });
    expect(result.current.erroAoCarregarMais).toBeNull();
    expect(result.current.errosMais).toEqual({});
    rerender(PESSOA_ID);
    await waitFor(() => expect(result.current.errosMais.atividade?.codigo).toBe("NG009"));
  });

  it("os estados são por secção: uma a carregar não ocupa as outras", async () => {
    const ficha = fichaDb({
      atividade: seccaoDb([atividadeDb({ id: "a1" })], { tem_mais: true, proximo: CURSOR }),
      contactos: seccaoDb([], { tem_mais: true, proximo: CURSOR }),
    });
    rpcMock.mockReturnValueOnce(respostaOk(ficha));
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    rpcMock.mockReturnValueOnce(new Promise(() => undefined));
    act(() => { void result.current.carregarMais("atividade"); });
    expect(result.current.carregandoTipos).toEqual(["atividade"]);
    rpcMock.mockReturnValueOnce(respostaErro("NG009"));
    await act(async () => { await result.current.carregarMais("contactos"); });
    expect(result.current.carregandoTipos).toEqual(["atividade"]);
    expect(Object.keys(result.current.errosMais)).toEqual(["contactos"]);
  });
});
