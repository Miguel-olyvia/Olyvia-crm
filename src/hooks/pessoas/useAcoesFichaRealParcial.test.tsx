// useAcoesFichaReal: falha a meio do resultado da visita, mensagem do código numa falha parcial, ids de repetição e referências estáveis.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { AGORA, chamadas, erroDe, FICHA, invalidadas, limparAcoes, montarAcoes as montar, prepararAcoes, semear } from "./acoesFichaTestUtil";
import { fichaDb, LEAD_ID, PESSOA_ID, seccaoDb, visitaDb } from "./fichaFabrica";
import { captureMock, parametros, respostaErro, respostaOk, rpcMock } from "./fichaTestUtil";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpcMock(...args) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));

beforeEach(prepararAcoes);
afterEach(limparAcoes);

describe("registarResultadoVisita: falha a meio", () => {
  const pedido = { resultado: "semInteresse" as const, motivo: "preco" as const };

  it("encerrou e o resultado da visita falhou: invalida e avisa das duas coisas (chave parcial + a do código)", async () => {
    const { result, client } = montar();
    semear(client);
    rpcMock.mockReturnValueOnce(respostaOk({ mudou: true })).mockReturnValueOnce(respostaErro("NG002"));
    const erro = await erroDe(act(async () => { await result.current.registarResultadoVisita("passada", pedido); }));
    expect(erro.chave).toBe("pessoasPagina.real.ficha.partialVisit");
    expect(erro.chaveExtra).toBe("pessoasPagina.erroNeg.ng002");
    expect(erro.codigo).toBe("NG002");
    expect(invalidadas(client)).toEqual([true, true]);
    expect(chamadas()).toEqual(["neg_encerrar_abordagem", "neg_resultado_visita"]);
  });

  it("repetir é seguro: o encerramento repetido devolve mudou=false (sem erro) e o resultado fica registado", async () => {
    const { result } = montar();
    rpcMock.mockReturnValueOnce(respostaOk({ mudou: true })).mockReturnValueOnce(respostaErro("NG002"));
    await erroDe(act(async () => { await result.current.registarResultadoVisita("passada", pedido); }));
    rpcMock.mockReturnValueOnce(respostaOk({ mudou: false })).mockReturnValueOnce(respostaOk({}));
    await act(async () => { await result.current.registarResultadoVisita("passada", pedido); });
    expect(chamadas()).toEqual(["neg_encerrar_abordagem", "neg_resultado_visita", "neg_encerrar_abordagem", "neg_resultado_visita"]);
    expect(parametros(2)).toEqual(parametros(0));
  });

  it("um resultado que não encerra e falha é uma falha total: não invalida nem fala em parcial", async () => {
    const { result, client } = montar();
    semear(client);
    rpcMock.mockReturnValueOnce(respostaErro("NG002"));
    const erro = await erroDe(act(async () => { await result.current.registarResultadoVisita("passada", { resultado: "aPensar" }); }));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.ng002");
    expect(invalidadas(client)).toEqual([false, false]);
  });

  it("se o encerramento falha, não há nada gravado: falha total, sem parcial", async () => {
    const { result, client } = montar();
    semear(client);
    rpcMock.mockReturnValueOnce(respostaErro("NG011"));
    const erro = await erroDe(act(async () => { await result.current.registarResultadoVisita("passada", pedido); }));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.ng011");
    expect(invalidadas(client)).toEqual([false, false]);
  });
});

describe("falha parcial da chamada: a mensagem do código não se perde", () => {
  const perder = { resultado: "semInteresse" as const, nota: "", passo: "perder" as const, motivo: "preco" as const };

  it("guarda a chave do código (NG011) ao lado da chave de aviso parcial", async () => {
    rpcMock.mockReturnValueOnce(respostaOk({})).mockReturnValueOnce(respostaErro("NG011"));
    const { result } = montar();
    const erro = await erroDe(act(async () => { await result.current.registarChamada(PESSOA_ID, perder); }));
    expect(erro.chave).toBe("pessoasPagina.real.ficha.partialCall");
    expect(erro.chaveExtra).toBe("pessoasPagina.erroNeg.ng011");
  });

  it("uma falha sem código conhecido não leva chave extra (nada de mensagem genérica a mais)", async () => {
    rpcMock.mockReturnValueOnce(respostaOk({})).mockReturnValueOnce(respostaErro("08006"));
    const { result } = montar();
    const erro = await erroDe(act(async () => { await result.current.registarChamada(PESSOA_ID, perder); }));
    expect(erro.chave).toBe("pessoasPagina.real.ficha.partialCall");
    expect(erro.chaveExtra).toBeUndefined();
  });
});

describe("o p_id de uma repetição não atravessa dias", () => {
  const dados = { resultado: "naoAtendeu" as const, nota: "a", passo: "nenhum" as const };

  it("a mesma chamada repetida no dia seguinte (sem ter tido sucesso) leva um id novo", async () => {
    const { result } = montar();
    rpcMock.mockReturnValueOnce(respostaErro("08006"));
    await erroDe(act(async () => { await result.current.registarChamada(PESSOA_ID, dados); }));
    vi.setSystemTime(new Date("2026-10-20T12:00:00.000Z"));
    rpcMock.mockReturnValueOnce(respostaOk({}));
    await act(async () => { await result.current.registarChamada(PESSOA_ID, dados); });
    expect(parametros(0).p_id).toBe("uuid-1");
    expect(parametros(1).p_id).toBe("uuid-2");
  });

  it("no mesmo dia continua a ser o mesmo id", async () => {
    const { result } = montar();
    rpcMock.mockReturnValueOnce(respostaErro("08006"));
    await erroDe(act(async () => { await result.current.registarChamada(PESSOA_ID, dados); }));
    vi.setSystemTime(new Date(new Date(AGORA).getTime() + 3_600_000));
    rpcMock.mockReturnValueOnce(respostaOk({}));
    await act(async () => { await result.current.registarChamada(PESSOA_ID, dados); });
    expect(parametros(1).p_id).toBe(parametros(0).p_id);
  });

  it("a nota e o adiar também mudam de id no dia seguinte", async () => {
    const { result } = montar();
    rpcMock.mockReturnValueOnce(respostaErro("08006")).mockReturnValueOnce(respostaErro("08006"));
    await erroDe(act(async () => { await result.current.juntarNota(PESSOA_ID, "x"); }));
    await erroDe(act(async () => { await result.current.adiar(PESSOA_ID, 1); }));
    vi.setSystemTime(new Date("2026-10-20T12:00:00.000Z"));
    rpcMock.mockReturnValue(respostaOk({}));
    await act(async () => { await result.current.juntarNota(PESSOA_ID, "x"); });
    await act(async () => { await result.current.adiar(PESSOA_ID, 1); });
    expect(parametros(2).p_id).not.toBe(parametros(0).p_id);
    expect(parametros(3).p_id).not.toBe(parametros(1).p_id);
  });
});

describe("estado estável entre renders", () => {
  const dados = { resultado: "naoAtendeu" as const, nota: "a", passo: "nenhum" as const };

  it("os ids guardados sobrevivem a um novo render (o mapa não é refeito)", async () => {
    const { result, rerender } = montar();
    rpcMock.mockReturnValueOnce(respostaErro("08006"));
    await erroDe(act(async () => { await result.current.registarChamada(PESSOA_ID, dados); }));
    rerender({ ficha: fichaDb({ visitas: seccaoDb([visitaDb()]) }) });
    rerender({ ficha: FICHA });
    rpcMock.mockReturnValueOnce(respostaOk({}));
    await act(async () => { await result.current.registarChamada(PESSOA_ID, dados); });
    expect(parametros(1).p_id).toBe(parametros(0).p_id);
  });

  it("as ações usam sempre a ficha mais recente (o lead novo) sem precisar de ser refeitas", async () => {
    const { result, rerender } = montar();
    const antes = result.current;
    rerender({ ficha: fichaDb({ lead: { id: "outro-lead", estado: "new", aberta: true, encerramento: null } }) });
    expect(result.current).toBe(antes);
    rpcMock.mockReturnValueOnce(respostaOk({}));
    await act(async () => { await result.current.encerrar(PESSOA_ID, { resultado: "semInteresse", motivo: "preco" }); });
    expect(parametros(0).p_lead_id).toBe("outro-lead");
    expect(parametros(0).p_lead_id).not.toBe(LEAD_ID);
  });
});
