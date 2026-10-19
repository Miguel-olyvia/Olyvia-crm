import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, waitFor } from "@testing-library/react";
import { atividadeDb, fichaDb, pessoaDb, PESSOA_ID, seccaoDb } from "./fichaFabrica";
import {
  captureMock, fonteReal, montarHook, nomeChamado, parametros, respostaErro, respostaOk, rpcMock,
} from "./fichaTestUtil";
import { fichaPessoaQueryKey, useFichaPessoa } from "./useFichaPessoa";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpcMock(...args) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));

const OUTRA = "33333333-3333-4333-8333-333333333333";
const montar = (id: string | null = PESSOA_ID, fonte = fonteReal()) => montarHook((i: string | null) => useFichaPessoa(i), id, { fonte });

beforeEach(() => { rpcMock.mockReset(); captureMock.mockReset(); });

describe("useFichaPessoa: a leitura", () => {
  it("chama neg_ficha_pessoa com os parâmetros exatos e passa de a-carregar a ok", async () => {
    rpcMock.mockReturnValue(respostaOk(fichaDb()));
    const { result } = montar();
    expect(result.current.estado).toBe("a-carregar");
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    expect(nomeChamado(0)).toBe("neg_ficha_pessoa");
    expect(parametros(0)).toEqual({ p_organization_id: "org-1", p_entity_id: PESSOA_ID, p_limite: 30, p_depois: null, p_partes: null });
    expect(result.current.ficha?.pessoa.nome).toBe("Ana Lopes");
    expect(result.current.erro).toBeNull();
  });

  it("a chave leva a organização e a pessoa, e o prefixo serve para invalidar", () => {
    expect(fichaPessoaQueryKey("org-1", PESSOA_ID)).toEqual(["neg-ficha-pessoa", "org-1", PESSOA_ID]);
    expect(fichaPessoaQueryKey("org-1")).toEqual(["neg-ficha-pessoa", "org-1"]);
    expect(fichaPessoaQueryKey(null, undefined)).toEqual(["neg-ficha-pessoa", null]);
  });

  it("em modo exemplo não pede nada", async () => {
    const { result } = montar(PESSOA_ID, { modo: "exemplo" });
    await act(async () => { await Promise.resolve(); });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(result.current.estado).toBe("indisponivel");
    expect(result.current.ficha).toBeNull();
  });

  it.each([["abc"], [""], [null], ["1111-1111"]])("com o id %j não pede nada", async (id) => {
    const { result } = montar(id as string | null);
    await act(async () => { await Promise.resolve(); });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(result.current.estado).toBe("indisponivel");
  });

  it("ao trocar de pessoa não mostra a anterior enquanto a nova carrega", async () => {
    rpcMock.mockReturnValueOnce(respostaOk(fichaDb()));
    const { result, rerender } = montar();
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    let resolver: (v: unknown) => void = () => undefined;
    rpcMock.mockReturnValueOnce(new Promise((r) => { resolver = r; }));
    rerender(OUTRA);
    expect(result.current.ficha).toBeNull();
    expect(result.current.estado).toBe("a-carregar");
    resolver({ data: fichaDb({ pessoa: pessoaDb({ id: OUTRA, nome: "Outra" }) }), error: null });
    await waitFor(() => expect(result.current.ficha?.pessoa.nome).toBe("Outra"));
  });
});

describe("useFichaPessoa: erros", () => {
  it.each([["NG003"], ["NG008"]])("%s dá indisponivel, com a chave do erro, e não repete", async (codigo) => {
    rpcMock.mockReturnValue(respostaErro(codigo));
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("indisponivel"));
    expect(result.current.erro?.codigo).toBe(codigo);
    expect(result.current.erro?.chave).toBe(`pessoasPagina.erroNeg.${codigo.toLowerCase()}`);
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it.each([["NG009"], ["42501"], ["57014"]])("%s dá erro e não se repete", async (codigo) => {
    rpcMock.mockReturnValue(codigo === "57014" ? Promise.resolve({ data: null, error: { code: "57014", message: "timeout" } }) : respostaErro(codigo));
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("erro"));
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("um erro sem código repete no máximo 2 vezes (3 chamadas) e dá erro", async () => {
    rpcMock.mockReturnValue(Promise.resolve({ data: null, error: { code: "08006", message: "ligação" } }));
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("erro"), { timeout: 4000 });
    expect(rpcMock).toHaveBeenCalledTimes(3);
    expect(result.current.erro?.chave).toBe("pessoasPagina.erroNeg.generico");
  });

  it("recarregar volta a pedir a ficha", async () => {
    rpcMock.mockReturnValue(respostaErro("NG009"));
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("erro"));
    rpcMock.mockReturnValue(respostaOk(fichaDb()));
    act(() => result.current.recarregar());
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });
});

describe("useFichaPessoa: carregar mais", () => {
  const cursor = { em: "2026-10-01T09:00:00Z", id: "a2" };
  const primeira = () => fichaDb({
    atividade: seccaoDb([atividadeDb({ id: "a1" }), atividadeDb({ id: "a2" })], { total: 4, tem_mais: true, proximo: cursor }),
  });

  it("pede só essa parte, com o cursor da secção e o limite de 30", async () => {
    rpcMock.mockReturnValueOnce(respostaOk(primeira()));
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    rpcMock.mockReturnValueOnce(respostaOk(fichaDb({ atividade: seccaoDb([atividadeDb({ id: "a3" })], { total: 4 }) })));
    await act(async () => { await result.current.carregarMais("atividade"); });
    expect(parametros(1)).toEqual({
      p_organization_id: "org-1", p_entity_id: PESSOA_ID, p_limite: 30, p_depois: { atividade: cursor }, p_partes: ["atividade"],
    });
  });

  it("junta ao cache sem duplicar ids, atualiza o cursor e não mexe nas outras secções", async () => {
    const original = primeira();
    rpcMock.mockReturnValueOnce(respostaOk(original));
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    const antes = result.current.ficha;
    const seguinte = fichaDb({ atividade: seccaoDb([atividadeDb({ id: "a2" }), atividadeDb({ id: "a3" })], { total: 4, tem_mais: false, proximo: null }) });
    rpcMock.mockReturnValueOnce(respostaOk(seguinte));
    await act(async () => { await result.current.carregarMais("atividade"); });
    const depois = result.current.ficha;
    expect(depois?.atividade?.itens.map((i) => i.id)).toEqual(["a1", "a2", "a3"]);
    expect(depois?.atividade).toMatchObject({ tem_mais: false, proximo: null, total: 4 });
    expect(depois?.contactos).toBe(antes?.contactos);
    expect(depois).not.toBe(antes);
    expect(antes?.atividade?.itens).toHaveLength(2); // o objeto anterior não foi mutado
    expect(result.current.aCarregarMais).toBe(false);
  });

  it("marca aCarregarMais enquanto espera", async () => {
    rpcMock.mockReturnValueOnce(respostaOk(primeira()));
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    let resolver: (v: unknown) => void = () => undefined;
    rpcMock.mockReturnValueOnce(new Promise((r) => { resolver = r; }));
    let pendente: Promise<void> = Promise.resolve();
    act(() => { pendente = result.current.carregarMais("atividade"); });
    expect(result.current.aCarregarMais).toBe(true);
    await act(async () => { resolver({ data: fichaDb({ atividade: seccaoDb([]) }), error: null }); await pendente; });
    expect(result.current.aCarregarMais).toBe(false);
  });

  it("sem mais itens (proximo nulo) não chama a base", async () => {
    rpcMock.mockReturnValueOnce(respostaOk(fichaDb()));
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    await act(async () => { await result.current.carregarMais("visitas"); });
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("uma falha deixa a ficha como estava e fica em erroAoCarregarMais", async () => {
    rpcMock.mockReturnValueOnce(respostaOk(primeira()));
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    rpcMock.mockReturnValueOnce(respostaErro("NG009"));
    await act(async () => { await result.current.carregarMais("atividade"); });
    expect(result.current.ficha?.atividade?.itens).toHaveLength(2);
    expect(result.current.erroAoCarregarMais?.codigo).toBe("NG009");
    expect(result.current.estado).toBe("ok");
  });
});
