// useQuestionarioLevantamento: lê o questionário (com inativas) por neg_questionario_levantamento e grava SÓ por neg_guardar_questionario,
// enviando a versão lida. Parâmetros exatos, cache refrescada depois de gravar, erros como ErroNeg e um só pedido em voo. Supabase simulado.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, waitFor } from "@testing-library/react";
import { ErroNeg } from "../chamarNeg";
import { CHAVES_ERRO_NEG } from "../errosNeg";
import { captureMock, criarCliente, fonteReal, montarHook, nomeChamado, parametros, respostaErro, respostaOk, rpcMock } from "../fichaTestUtil";
import { lerQuestionario } from "./questionario";
import { copiarBruto, QUESTIONARIO_BRUTO } from "./questionarioTestUtil";
import { questionarioQueryKey, useQuestionarioLevantamento } from "./useQuestionarioLevantamento";

const fromMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args), from: (...args: unknown[]) => fromMock(...args) },
}));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));

const SECCOES = lerQuestionario(QUESTIONARIO_BRUTO)!.seccoes;
const novoBruto = (versao: number) => ({ ...copiarBruto(), versao });
const respostaGravar = (versao: number, mudou = true) => ({ versao, mudou, criadas: { seccoes: 0, perguntas: 0, opcoes: 0 }, refs: {} });
const montar = (habilitado = true, opcoes: Parameters<typeof montarHook>[2] = {}) => montarHook((h: boolean) => useQuestionarioLevantamento(h), habilitado, opcoes);
const leituras = () => rpcMock.mock.calls.filter((c) => c[0] === "neg_questionario_levantamento").length;

beforeEach(() => {
  [rpcMock, captureMock, fromMock].forEach((m) => m.mockReset());
  rpcMock.mockImplementation((nome: string) => (nome === "neg_questionario_levantamento" ? respostaOk(QUESTIONARIO_BRUTO) : respostaOk(respostaGravar(8))));
});

describe("useQuestionarioLevantamento: leitura", () => {
  it("lê o questionário da organização com as inativas (o separador as mostra) e devolve-o já limpo", async () => {
    const { result } = montar();
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.dados).not.toBeNull());
    expect(nomeChamado(0)).toBe("neg_questionario_levantamento");
    expect(parametros(0)).toEqual({ p_organization_id: "org-1", p_incluir_inactivas: true });
    expect(result.current.dados).toEqual(lerQuestionario(QUESTIONARIO_BRUTO));
    expect(result.current.isError).toBe(false);
  });

  it("não lê nada com o hook desligado nem fora do modo real", async () => {
    montar(false);
    montar(true, { fonte: { modo: "exemplo" } });
    await new Promise((r) => setTimeout(r, 20));
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("a organização vem da fonte da página", async () => {
    const { result } = montar(true, { fonte: fonteReal("org-9") });
    await waitFor(() => expect(result.current.dados).not.toBeNull());
    expect(parametros(0).p_organization_id).toBe("org-9");
  });

  it.each(["NG008", "42501"])("%s na leitura: sem dados, erro à vista com o código, e não vai para o registo de avarias", async (codigo) => {
    rpcMock.mockReturnValue(respostaErro(codigo));
    const { result } = montar();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.dados).toBeNull();
    expect((result.current.erro as ErroNeg).codigo).toBe(codigo);
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("uma resposta que não é um questionário é um erro (e não dados inventados)", async () => {
    rpcMock.mockReturnValue(respostaOk({ versao: "x" }));
    const { result } = montar();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.dados).toBeNull();
  });

  it("recarregar volta a ler, põe o resultado na cache e devolve-o; se falhar devolve null", async () => {
    const client = criarCliente();
    const { result } = montar(true, { client });
    await waitFor(() => expect(result.current.dados).not.toBeNull());
    rpcMock.mockReturnValue(respostaOk(novoBruto(9)));
    let lido: unknown;
    await act(async () => { lido = await result.current.recarregar(); });
    expect((lido as { versao: number }).versao).toBe(9);
    expect(client.getQueryData<{ versao: number }>(questionarioQueryKey("org-1"))?.versao).toBe(9);
    rpcMock.mockReturnValue(respostaErro("NG008"));
    await act(async () => { lido = await result.current.recarregar(); });
    expect(lido).toBeNull();
  });
});

describe("useQuestionarioLevantamento: guardar", () => {
  it("chama neg_guardar_questionario com exatamente os três parâmetros: organização, versão lida e secções", async () => {
    const { result } = montar(false);
    await act(async () => { await result.current.guardar(7, SECCOES); });
    expect(rpcMock.mock.calls.filter((c) => c[0] === "neg_guardar_questionario")).toHaveLength(1);
    expect(nomeChamado(0)).toBe("neg_guardar_questionario");
    expect(Object.keys(parametros(0)).sort()).toEqual(["p_organization_id", "p_seccoes", "p_versao"]);
    expect(parametros(0)).toMatchObject({ p_organization_id: "org-1", p_versao: 7 });
    expect((parametros(0).p_seccoes as unknown[])).toHaveLength(4);
  });

  it("nunca escreve numa tabela", async () => {
    const { result } = montar(false);
    await act(async () => { await result.current.guardar(7, SECCOES); });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("mudou: relê o questionário da base, põe-no na cache e diz que recarregou", async () => {
    const client = criarCliente();
    client.setQueryData(questionarioQueryKey("org-1"), lerQuestionario(QUESTIONARIO_BRUTO));
    rpcMock.mockImplementation((nome: string) => (nome === "neg_questionario_levantamento" ? respostaOk(novoBruto(8)) : respostaOk(respostaGravar(8))));
    const { result } = montar(false, { client });
    let r;
    await act(async () => { r = await result.current.guardar(7, SECCOES); });
    expect(r).toEqual({ mudou: true, versao: 8, recarregou: true });
    expect(leituras()).toBe(1);
    expect(client.getQueryData<{ versao: number }>(questionarioQueryKey("org-1"))?.versao).toBe(8);
  });

  it("mudou:false não relê (nada mudou na base)", async () => {
    rpcMock.mockImplementation(() => respostaOk(respostaGravar(7, false)));
    const { result } = montar(false);
    let r;
    await act(async () => { r = await result.current.guardar(7, SECCOES); });
    expect(r).toEqual({ mudou: false, versao: 7, recarregou: true });
    expect(leituras()).toBe(0);
  });

  it("gravou mas a releitura falhou: devolve recarregou:false (o ecrã não deve fingir que mostra o que está na base)", async () => {
    rpcMock.mockImplementation((nome: string) => (nome === "neg_questionario_levantamento" ? respostaErro("NG008") : respostaOk(respostaGravar(8))));
    const { result } = montar(false);
    let r;
    await act(async () => { r = await result.current.guardar(7, SECCOES); });
    expect(r).toEqual({ mudou: true, versao: 8, recarregou: false });
  });

  it("uma resposta que não se reconhece conta como mudou (relê) e fica sem versão conhecida", async () => {
    rpcMock.mockImplementation((nome: string) => (nome === "neg_questionario_levantamento" ? respostaOk(novoBruto(8)) : respostaOk({})));
    const { result } = montar(false);
    let r;
    await act(async () => { r = await result.current.guardar(7, SECCOES); });
    expect(r).toMatchObject({ mudou: true, recarregou: true });
  });

  it.each(["NG008", "NG009", "NG021", "42501"])("%s: lança ErroNeg com o código, sem tocar na cache nem reler, e sem ir para as avarias", async (codigo) => {
    rpcMock.mockReturnValue(respostaErro(codigo));
    const client = criarCliente();
    const antes = lerQuestionario(QUESTIONARIO_BRUTO);
    client.setQueryData(questionarioQueryKey("org-1"), antes);
    const { result } = montar(false, { client });
    const erro = await act(async () => result.current.guardar(7, SECCOES).then(() => null, (e: unknown) => e)) as unknown as ErroNeg;
    expect(erro).toBeInstanceOf(ErroNeg);
    expect(erro.codigo).toBe(codigo);
    expect(erro.chave).toBe(CHAVES_ERRO_NEG[codigo]);
    expect(client.getQueryData(questionarioQueryKey("org-1"))).toBe(antes);
    expect(leituras()).toBe(0);
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("depois de uma falha volta a poder guardar (o estado ocupado não fica preso)", async () => {
    rpcMock.mockReturnValueOnce(respostaErro("NG009")).mockImplementation(() => respostaOk(respostaGravar(7, false)));
    const { result } = montar(false);
    await act(async () => { await result.current.guardar(7, SECCOES).catch(() => undefined); });
    expect(result.current.aGuardar).toBe(false);
    await act(async () => { await result.current.guardar(7, SECCOES); });
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });

  it("duplo clique: dois pedidos seguidos dão uma só chamada e a mesma promessa; aGuardar acompanha o voo (a releitura incluída)", async () => {
    let acabar: (v: unknown) => void = () => undefined;
    rpcMock.mockImplementation((nome: string) =>
      nome === "neg_questionario_levantamento" ? respostaOk(novoBruto(8)) : new Promise((r) => { acabar = r; }));
    const { result } = montar(false);
    let p1: Promise<unknown> = Promise.resolve();
    let p2: Promise<unknown> = Promise.resolve();
    act(() => {
      p1 = result.current.guardar(7, SECCOES);
      p2 = result.current.guardar(7, SECCOES);
    });
    expect(rpcMock.mock.calls.filter((c) => c[0] === "neg_guardar_questionario")).toHaveLength(1);
    expect(p2).toBe(p1);
    expect(result.current.aGuardar).toBe(true);
    await act(async () => { acabar({ data: respostaGravar(8), error: null }); await p1; });
    expect(result.current.aGuardar).toBe(false);
  });

  it("fora do modo real não há organização: recusa e não chama a base", async () => {
    const { result } = montar(false, { fonte: { modo: "exemplo" } });
    const erro = await act(async () => result.current.guardar(7, SECCOES).then(() => null, (e: unknown) => e)) as unknown as ErroNeg;
    expect(erro).toBeInstanceOf(ErroNeg);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
