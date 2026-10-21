// As três funções do fecho v4 pela ficha real: «Fechar agora» (neg_reavaliar_negocio), «Reabrir negócio» (neg_reabrir_ganho) e «Manter perdido»
// (neg_dispensar_alerta): os parâmetros, a leitura das respostas sem rebentar com formas inesperadas, o motivo (1 a 1000, NG009), a defesa
// em profundidade de pessoas.edit, o duplo clique e o refrescar da ficha. As migrations D e F só se aplicam depois: aqui a base é simulada.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { fichaDb, PESSOA_ID } from "./fichaFabrica";
import { erroDe, invalidadas, limparAcoes, prepararAcoes, semear } from "./acoesFichaTestUtil";
import { captureMock, criarCliente, fonteReal, montarHook, nomeChamado, parametros, respostaErro, respostaOk, rpcMock } from "./fichaTestUtil";
import { useMutacoesNegocio } from "./useMutacoesNegocio";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpcMock(...args) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));

beforeEach(prepararAcoes);
afterEach(limparAcoes);

const NEGOCIO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DOC = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function montar(editar = true) {
  const client = criarCliente();
  const r = montarHook(() => useMutacoesNegocio(PESSOA_ID, fichaDb({ permissoes: { editar, criar: true } }), {}), undefined, { client, fonte: fonteReal() });
  return { ...r, client };
}

describe("reavaliar («Fechar agora»)", () => {
  it("chama neg_reavaliar_negocio só com o negócio e lê o que a base devolveu", async () => {
    rpcMock.mockReturnValue(respostaOk({ mudou: true, estado: "ganho", origem_tipo: "proposta", origem_id: DOC, prova: "P1", conversao: "feita" }));
    const { result } = montar();
    let r: unknown;
    await act(async () => { r = await result.current.reavaliar?.(NEGOCIO); });
    expect(nomeChamado(0)).toBe("neg_reavaliar_negocio");
    expect(parametros(0)).toEqual({ p_negocio_id: NEGOCIO });
    expect(r).toEqual({ mudou: true, estado: "ganho", origemTipo: "proposta", origemId: DOC, prova: "P1", conversao: "feita", motivo: null });
  });

  it("sem positivo com prova: mudou false e o motivo, sem inventar origem nem prova", async () => {
    rpcMock.mockReturnValue(respostaOk({ mudou: false, estado: "aberto", motivo: "sem_positivo_com_prova" }));
    const { result } = montar();
    let r: unknown;
    await act(async () => { r = await result.current.reavaliar?.(NEGOCIO); });
    expect(r).toEqual({ mudou: false, estado: "aberto", origemTipo: null, origemId: null, prova: null, conversao: null, motivo: "sem_positivo_com_prova" });
  });

  it("valores desconhecidos na resposta leem-se como nulos; a conversão por fazer conhece-se", async () => {
    rpcMock.mockReturnValue(respostaOk({ mudou: "true", estado: "xpto", origem_tipo: "outro", origem_id: 7, prova: 3, conversao: "por_fazer" }));
    const { result } = montar();
    let r: unknown;
    await act(async () => { r = await result.current.reavaliar?.(NEGOCIO); });
    expect(r).toEqual({ mudou: false, estado: null, origemTipo: null, origemId: null, prova: null, conversao: "por_fazer", motivo: null });
  });

  it("uma resposta que não é um objeto dá o erro genérico", async () => {
    rpcMock.mockReturnValue(respostaOk(null));
    const { result } = montar();
    const erro = await erroDe(act(async () => { await result.current.reavaliar?.(NEGOCIO); }));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.generico");
  });

  it("quem não pode editar recusa sem ir à base (42501)", async () => {
    const { result } = montar(false);
    const erro = await erroDe(act(async () => { await result.current.reavaliar?.(NEGOCIO); }));
    expect(erro.codigo).toBe("42501");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("refaz a ficha e a lista, e o duplo clique faz uma só chamada", async () => {
    let acabar: (v: unknown) => void = () => undefined;
    rpcMock.mockReturnValue(new Promise((res) => { acabar = res; }));
    const { result, client } = montar();
    semear(client);
    let a: Promise<unknown> | undefined;
    let b: Promise<unknown> | undefined;
    act(() => { a = result.current.reavaliar?.(NEGOCIO); b = result.current.reavaliar?.(NEGOCIO); });
    await act(async () => { acabar({ data: { mudou: true, estado: "ganho" }, error: null }); await Promise.all([a, b]); });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(invalidadas(client)).toEqual([true, true]);
  });

  it("NG002 (o negócio já não está aberto) traduz-se e refaz a ficha", async () => {
    rpcMock.mockReturnValue(respostaErro("NG002"));
    const { result, client } = montar();
    semear(client);
    const erro = await erroDe(act(async () => { await result.current.reavaliar?.(NEGOCIO); }));
    expect(erro.codigo).toBe("NG002");
    expect(invalidadas(client)).toEqual([true, true]);
  });
});

describe("reabrirGanho («Reabrir negócio»)", () => {
  it("chama neg_reabrir_ganho com o negócio e o motivo limpo", async () => {
    rpcMock.mockReturnValue(respostaOk({ mudou: true, estado: "aberto" }));
    const { result } = montar();
    let r: unknown;
    await act(async () => { r = await result.current.reabrirGanho?.(NEGOCIO, "  Cliente pediu alterações  "); });
    expect(nomeChamado(0)).toBe("neg_reabrir_ganho");
    expect(parametros(0)).toEqual({ p_negocio_id: NEGOCIO, p_motivo: "Cliente pediu alterações" });
    expect(r).toEqual({ mudou: true });
  });

  it.each(["", "   ", "x".repeat(1001)])("um motivo inválido (%#) é NG009 sem ir à base", async (motivo) => {
    const { result } = montar();
    const erro = await erroDe(act(async () => { await result.current.reabrirGanho?.(NEGOCIO, motivo); }));
    expect(erro.codigo).toBe("NG009");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("1000 caracteres passam", async () => {
    rpcMock.mockReturnValue(respostaOk({ mudou: true }));
    const { result } = montar();
    await act(async () => { await result.current.reabrirGanho?.(NEGOCIO, "x".repeat(1000)); });
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("sem pessoas.reopen a base recusa (42501) e o erro vem traduzido; não há defesa local porque a ficha não traz essa permissão", async () => {
    rpcMock.mockReturnValue(respostaErro("42501"));
    const { result } = montar();
    const erro = await erroDe(act(async () => { await result.current.reabrirGanho?.(NEGOCIO, "motivo"); }));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.permissao");
  });

  it("refaz a ficha depois de reabrir", async () => {
    rpcMock.mockReturnValue(respostaOk({ mudou: true }));
    const { result, client } = montar();
    semear(client);
    await act(async () => { await result.current.reabrirGanho?.(NEGOCIO, "motivo"); });
    expect(invalidadas(client)).toEqual([true, true]);
  });
});

describe("dispensarAlerta («Manter perdido»)", () => {
  it("chama neg_dispensar_alerta só com o negócio", async () => {
    rpcMock.mockReturnValue(respostaOk({ mudou: true, estado: "perdido", alerta: null }));
    const { result } = montar();
    let r: unknown;
    await act(async () => { r = await result.current.dispensarAlerta?.(NEGOCIO); });
    expect(nomeChamado(0)).toBe("neg_dispensar_alerta");
    expect(parametros(0)).toEqual({ p_negocio_id: NEGOCIO });
    expect(r).toEqual({ mudou: true });
  });

  it("sem alerta em aberto a base diz mudou false", async () => {
    rpcMock.mockReturnValue(respostaOk({ mudou: false, estado: "perdido" }));
    const { result } = montar();
    let r: unknown;
    await act(async () => { r = await result.current.dispensarAlerta?.(NEGOCIO); });
    expect(r).toEqual({ mudou: false });
  });

  it("quem não pode editar recusa sem ir à base (42501)", async () => {
    const { result } = montar(false);
    const erro = await erroDe(act(async () => { await result.current.dispensarAlerta?.(NEGOCIO); }));
    expect(erro.codigo).toBe("42501");
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
