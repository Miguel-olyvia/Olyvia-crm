// useRegrasQualificacao: lê as regras da tabela (como Leads, pela regra de acesso dela) e escreve SÓ por neg_guardar_regras_qualificacao.
// Parâmetros exatos, cache e Leads só depois de sucesso, erros traduzíveis e um só pedido em voo (sem duplo clique). O Supabase é simulado.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, waitFor } from "@testing-library/react";
import { ErroNeg } from "../chamarNeg";
import { CHAVES_ERRO_NEG } from "../errosNeg";
import { captureMock, criarCliente, fonteReal, montarHook, nomeChamado, parametros, respostaErro, respostaOk, rpcMock } from "../fichaTestUtil";
import { regrasQualificacaoQueryKey, useRegrasQualificacao } from "./useRegrasQualificacao";

const fromMock = vi.fn();
const selectMock = vi.fn();
const eqMock = vi.fn();
const maybeSingleMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args), from: (...args: unknown[]) => fromMock(...args) },
}));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));

const REGRA_MQL = { all: [{ type: "has_source" }], any: [] };
const linha = (mql: unknown, sql: unknown) => Promise.resolve({ data: { mql_when: mql, sql_when: sql }, error: null });

beforeEach(() => {
  [rpcMock, captureMock, fromMock, selectMock, eqMock, maybeSingleMock].forEach((m) => m.mockReset());
  fromMock.mockReturnValue({ select: selectMock });
  selectMock.mockReturnValue({ eq: eqMock });
  eqMock.mockReturnValue({ maybeSingle: maybeSingleMock });
  maybeSingleMock.mockReturnValue(linha(null, null));
});

const montar = (habilitado = true, opcoes: Parameters<typeof montarHook>[2] = {}) => montarHook((h: boolean) => useRegrasQualificacao(h), habilitado, opcoes);
const depoisDe = (mql: unknown, sql: unknown, mudou = true) => ({
  antes: { mql_when: null, sql_when: null }, depois: { mql_when: mql, sql_when: sql }, mudou,
});

describe("useRegrasQualificacao: leitura", () => {
  it("lê só a linha da organização, só as duas colunas, e devolve as regras limpas", async () => {
    maybeSingleMock.mockReturnValue(linha(REGRA_MQL, { any: [{ type: "has_deal_won" }, { type: "has_signed_contract" }] }));
    const { result } = montar();
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.dados).not.toBeNull());
    expect(fromMock).toHaveBeenCalledWith("lead_qualification_rules");
    expect(selectMock).toHaveBeenCalledWith("mql_when, sql_when");
    expect(eqMock).toHaveBeenCalledWith("organization_id", "org-1");
    expect(result.current.dados).toEqual({ mql: REGRA_MQL, sql: { all: [], any: [{ type: "has_signed_contract" }] }, descartadas: 1 });
    expect(result.current.isError).toBe(false);
  });

  it("sem linha, a organização ainda não tem regras: dados vazios e sem erro", async () => {
    maybeSingleMock.mockReturnValue(Promise.resolve({ data: null, error: null }));
    const { result } = montar();
    await waitFor(() => expect(result.current.dados).not.toBeNull());
    expect(result.current.dados).toEqual({ mql: null, sql: null, descartadas: 0 });
  });

  it("não lê nada com o hook desligado nem fora do modo real", async () => {
    montar(false);
    montar(true, { fonte: { modo: "exemplo" } });
    await new Promise((r) => setTimeout(r, 20));
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("uma falha da leitura fica à vista, vai para o registo de erros e não inventa dados", async () => {
    maybeSingleMock.mockReturnValue(Promise.resolve({ data: null, error: { code: "XX000", message: "rebentou" } }));
    const { result } = montar();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.dados).toBeNull();
    expect(captureMock).toHaveBeenCalled();
  });

  it("recarregar volta a ler", async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.dados).not.toBeNull());
    maybeSingleMock.mockReturnValue(linha(REGRA_MQL, null));
    act(() => result.current.recarregar());
    await waitFor(() => expect(result.current.dados?.mql).toEqual(REGRA_MQL));
  });
});

describe("useRegrasQualificacao: guardar", () => {
  it("chama neg_guardar_regras_qualificacao com exatamente os três parâmetros, as regras já limpas", async () => {
    rpcMock.mockReturnValue(respostaOk(depoisDe(REGRA_MQL, null)));
    const { result } = montar(false);
    await act(async () => {
      await result.current.guardar({ all: [{ type: "has_source", value: 9 }, { type: "has_deal_won" }] as never, any: [] }, { all: [], any: [] });
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(nomeChamado(0)).toBe("neg_guardar_regras_qualificacao");
    expect(parametros(0)).toEqual({ p_organization_id: "org-1", p_mql_when: REGRA_MQL, p_sql_when: null });
    expect(Object.keys(parametros(0)).sort()).toEqual(["p_mql_when", "p_organization_id", "p_sql_when"]);
  });

  it("nunca escreve na tabela: não toca no cliente de tabelas ao guardar", async () => {
    rpcMock.mockReturnValue(respostaOk(depoisDe(null, null, false)));
    const { result } = montar(false);
    await act(async () => { await result.current.guardar(null, null); });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("com regras vazias manda null nas duas (a base não guarda regras por omissão)", async () => {
    rpcMock.mockReturnValue(respostaOk(depoisDe(null, null, false)));
    const { result } = montar(false);
    await act(async () => { await result.current.guardar({ all: [], any: [] }, null); });
    expect(parametros(0)).toEqual({ p_organization_id: "org-1", p_mql_when: null, p_sql_when: null });
  });

  it("depois de gravar: devolve mudou, põe as regras novas na cache e marca as de Leads para reler", async () => {
    rpcMock.mockReturnValue(respostaOk(depoisDe(REGRA_MQL, null, true)));
    const client = criarCliente();
    client.setQueryData(regrasQualificacaoQueryKey("org-1"), { mql: null, sql: null, descartadas: 0 });
    client.setQueryData(["lead-pipeline-rules", "org-1"], { x: 1 });
    const { result } = montar(false, { client });
    let r;
    await act(async () => { r = await result.current.guardar(REGRA_MQL, null); });
    expect(r).toEqual({ mudou: true, depois: { mql: REGRA_MQL, sql: null } });
    expect(client.getQueryData(regrasQualificacaoQueryKey("org-1"))).toEqual({ mql: REGRA_MQL, sql: null, descartadas: 0 });
    expect(client.getQueryState(["lead-pipeline-rules", "org-1"])?.isInvalidated).toBe(true);
  });

  it("mudou:false (já estava assim) não mexe nas regras de Leads", async () => {
    rpcMock.mockReturnValue(respostaOk(depoisDe(REGRA_MQL, null, false)));
    const client = criarCliente();
    client.setQueryData(["lead-pipeline-rules", "org-1"], { x: 1 });
    const { result } = montar(false, { client });
    let r;
    await act(async () => { r = await result.current.guardar(REGRA_MQL, null); });
    expect(r).toMatchObject({ mudou: false });
    expect(client.getQueryState(["lead-pipeline-rules", "org-1"])?.isInvalidated).toBe(false);
  });

  it("uma resposta que não se reconhece, mas que diz que mudou, manda reler as regras da base", async () => {
    rpcMock.mockReturnValue(respostaOk({ mudou: true }));
    const client = criarCliente();
    client.setQueryData(regrasQualificacaoQueryKey("org-1"), { mql: null, sql: null, descartadas: 0 });
    const { result } = montar(false, { client });
    let r;
    await act(async () => { r = await result.current.guardar(REGRA_MQL, null); });
    expect(r).toEqual({ mudou: true, depois: null });
    expect(client.getQueryState(regrasQualificacaoQueryKey("org-1"))?.isInvalidated).toBe(true);
  });

  it.each(["NG008", "NG009", "42501"])("%s: lança ErroNeg com o código e não toca em cache nem em Leads", async (codigo) => {
    rpcMock.mockReturnValue(respostaErro(codigo));
    const client = criarCliente();
    client.setQueryData(regrasQualificacaoQueryKey("org-1"), { mql: null, sql: null, descartadas: 0 });
    client.setQueryData(["lead-pipeline-rules", "org-1"], { x: 1 });
    const { result } = montar(false, { client });
    const erro = await act(async () => result.current.guardar(REGRA_MQL, null).then(() => null, (e: unknown) => e)) as unknown as ErroNeg;
    expect(erro).toBeInstanceOf(ErroNeg);
    expect(erro.codigo).toBe(codigo);
    expect(erro.chave).toBe(CHAVES_ERRO_NEG[codigo]);
    expect(client.getQueryData(regrasQualificacaoQueryKey("org-1"))).toEqual({ mql: null, sql: null, descartadas: 0 });
    expect(client.getQueryState(["lead-pipeline-rules", "org-1"])?.isInvalidated).toBe(false);
    expect(client.getQueryState(regrasQualificacaoQueryKey("org-1"))?.isInvalidated).toBe(false);
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("depois de uma falha volta a poder guardar (o estado ocupado não fica preso)", async () => {
    rpcMock.mockReturnValueOnce(respostaErro("NG009")).mockReturnValueOnce(respostaOk(depoisDe(REGRA_MQL, null)));
    const { result } = montar(false);
    await act(async () => { await result.current.guardar(REGRA_MQL, null).catch(() => undefined); });
    expect(result.current.aGuardar).toBe(false);
    await act(async () => { await result.current.guardar(REGRA_MQL, null); });
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });

  it("duplo clique: dois pedidos seguidos dão uma só chamada e a mesma promessa; aGuardar acompanha o voo", async () => {
    let acabar: (v: unknown) => void = () => undefined;
    rpcMock.mockReturnValue(new Promise((r) => { acabar = r; }));
    const { result } = montar(false);
    let p1: Promise<unknown> = Promise.resolve();
    let p2: Promise<unknown> = Promise.resolve();
    act(() => {
      p1 = result.current.guardar(REGRA_MQL, null);
      p2 = result.current.guardar(REGRA_MQL, null);
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(p2).toBe(p1);
    expect(result.current.aGuardar).toBe(true);
    await act(async () => { acabar({ data: depoisDe(REGRA_MQL, null), error: null }); await p1; });
    expect(result.current.aGuardar).toBe(false);
    // Acabado o voo, um pedido novo é um pedido novo.
    rpcMock.mockReturnValue(respostaOk(depoisDe(REGRA_MQL, null, false)));
    await act(async () => { await result.current.guardar(REGRA_MQL, null); });
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });

  it("fora do modo real não há organização: recusa com a mensagem genérica e não chama a base", async () => {
    const { result } = montar(false, { fonte: { modo: "exemplo" } });
    const erro = await act(async () => result.current.guardar(REGRA_MQL, null).then(() => null, (e: unknown) => e)) as unknown as ErroNeg;
    expect(erro).toBeInstanceOf(ErroNeg);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("a organização vem da fonte da página (outra organização, outro parâmetro)", async () => {
    rpcMock.mockReturnValue(respostaOk(depoisDe(null, null, false)));
    const { result } = montar(false, { fonte: fonteReal("org-9") });
    await act(async () => { await result.current.guardar(null, null); });
    expect(parametros(0).p_organization_id).toBe("org-9");
  });
});
