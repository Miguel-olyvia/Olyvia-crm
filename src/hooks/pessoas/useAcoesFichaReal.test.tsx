import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { ErroNeg } from "./chamarNeg";
import { fichaDb, LEAD_ID, PESSOA_ID } from "./fichaFabrica";
import { AGORA, chamadas, erroDe, invalidadas, limparAcoes, montarAcoes as montar, prepararAcoes, semear } from "./acoesFichaTestUtil";
import { captureMock, nomeChamado, parametros, respostaErro, respostaOk, rpcMock } from "./fichaTestUtil";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpcMock(...args) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));

beforeEach(prepararAcoes);
afterEach(limparAcoes);

describe("useAcoesFichaReal: capacidades", () => {
  it("chamada e encerrar ligadas; nota, adiar e visita desligadas enquanto M8 e o P6 não existem", () => {
    const { result } = montar();
    // ALTERADO no P3 (negocios era false): o negócio completo está ligado.
    expect(result.current.capacidades).toEqual({ chamada: true, encerrar: true, adiar: false, nota: false, visita: false, negocios: true });
  });
});

describe("registarChamada", () => {
  const dados = (extra = {}) => ({ resultado: "naoAtendeu" as const, nota: "", passo: "nenhum" as const, ...extra });

  it("neg_registar_contacto com os parâmetros exatos (nota aparada, sem próxima ação)", async () => {
    rpcMock.mockReturnValue(respostaOk({ mudou: true }));
    const { result } = montar();
    await act(async () => { await result.current.registarChamada(PESSOA_ID, dados({ nota: "  Sem resposta  " })); });
    expect(chamadas()).toEqual(["neg_registar_contacto"]);
    expect(parametros(0)).toEqual({
      p_id: "uuid-1", p_organization_id: "org-1", p_entity_id: PESSOA_ID, p_resultado: "naoAtendeu", p_nota: "Sem resposta", p_quando: AGORA,
      p_proxima_acao_em: null, p_negocio_id: null,
    });
  });

  it("uma nota vazia ou só de espaços vai como null", async () => {
    rpcMock.mockReturnValue(respostaOk({}));
    const { result } = montar();
    await act(async () => { await result.current.registarChamada(PESSOA_ID, dados({ nota: "   " })); });
    expect(parametros(0).p_nota).toBeNull();
  });

  it("p_proxima_acao_em por passo: ligarAmanha, ligarHoje, ligarData e nenhum (em Lisboa, hora de verão)", async () => {
    rpcMock.mockReturnValue(respostaOk({}));
    const { result } = montar();
    await act(async () => { await result.current.registarChamada(PESSOA_ID, dados({ passo: "ligarAmanha" })); });
    await act(async () => { await result.current.registarChamada(PESSOA_ID, dados({ passo: "ligarHoje", nota: "b" })); });
    await act(async () => { await result.current.registarChamada(PESSOA_ID, dados({ passo: "ligarData", data: "2026-10-27", hora: "10:00", nota: "c" })); });
    await act(async () => { await result.current.registarChamada(PESSOA_ID, dados({ passo: "nenhum", nota: "d" })); });
    expect(parametros(0).p_proxima_acao_em).toBe("2026-10-19T23:00:00.000Z"); // 20/10 00:00 em Lisboa
    expect(parametros(1).p_proxima_acao_em).toBe("2026-10-18T23:00:00.000Z"); // 19/10 00:00 em Lisboa
    expect(parametros(2).p_proxima_acao_em).toBe("2026-10-27T10:00:00.000Z"); // 27/10 já é inverno (UTC+0)
    expect(parametros(3).p_proxima_acao_em).toBeNull();
  });

  it("o passo «perder» regista o contacto ANTES de encerrar a abordagem", async () => {
    rpcMock.mockReturnValue(respostaOk({}));
    const { result } = montar();
    await act(async () => { await result.current.registarChamada(PESSOA_ID, dados({ resultado: "semInteresse", passo: "perder", motivo: "preco" })); });
    expect(chamadas()).toEqual(["neg_registar_contacto", "neg_encerrar_abordagem"]);
    expect(parametros(1)).toEqual({
      p_organization_id: "org-1", p_entity_id: PESSOA_ID, p_resultado: "semInteresse", p_motivo: "preco", p_motivo_outro: null, p_lead_id: LEAD_ID,
    });
  });

  it("o motivo «outro» leva o texto aparado", async () => {
    rpcMock.mockReturnValue(respostaOk({}));
    const { result } = montar();
    await act(async () => { await result.current.registarChamada(PESSOA_ID, dados({ passo: "perder", motivo: "outro", motivoOutro: " Mudou de casa " })); });
    expect(parametros(1)).toMatchObject({ p_motivo: "outro", p_motivo_outro: "Mudou de casa" });
  });

  it("o mesmo pedido repetido depois de uma falha reutiliza o p_id; depois de um sucesso o p_id é novo", async () => {
    const { result } = montar();
    rpcMock.mockReturnValueOnce(respostaErro("08006"));
    await erroDe(act(async () => { await result.current.registarChamada(PESSOA_ID, dados({ nota: "a" })); }));
    rpcMock.mockReturnValueOnce(respostaOk({}));
    await act(async () => { await result.current.registarChamada(PESSOA_ID, dados({ nota: "a" })); });
    rpcMock.mockReturnValueOnce(respostaOk({}));
    await act(async () => { await result.current.registarChamada(PESSOA_ID, dados({ nota: "a" })); });
    expect(parametros(0).p_id).toBe("uuid-1");
    expect(parametros(1).p_id).toBe("uuid-1");
    expect(parametros(2).p_id).toBe("uuid-2");
  });

  it("dados diferentes têm ids diferentes", async () => {
    rpcMock.mockReturnValue(respostaErro("08006"));
    const { result } = montar();
    await erroDe(act(async () => { await result.current.registarChamada(PESSOA_ID, dados({ nota: "a" })); }));
    await erroDe(act(async () => { await result.current.registarChamada(PESSOA_ID, dados({ nota: "b" })); }));
    expect(parametros(0).p_id).not.toBe(parametros(1).p_id);
  });

  it("uma falha do contacto lança o erro da base, não encerra, não invalida e não deixa aviso parcial", async () => {
    const { result, client } = montar();
    semear(client);
    rpcMock.mockReturnValueOnce(respostaErro("NG008"));
    const erro = await erroDe(act(async () => { await result.current.registarChamada(PESSOA_ID, dados({ resultado: "semInteresse", passo: "perder", motivo: "preco" })); }));
    expect(erro).toBeInstanceOf(ErroNeg);
    expect(erro.chave).toBe("pessoasPagina.erroNeg.ng008");
    expect(chamadas()).toEqual(["neg_registar_contacto"]);
    expect(invalidadas(client)).toEqual([false, false]);
  });

  it("contacto gravado e encerramento falhado: invalida na mesma, avisa das duas coisas e repete só com o mesmo id", async () => {
    const { result, client } = montar();
    semear(client);
    rpcMock.mockReturnValueOnce(respostaOk({})).mockReturnValueOnce(respostaErro("NG011"));
    const pedido = dados({ resultado: "semInteresse", passo: "perder", motivo: "preco" });
    const erro = await erroDe(act(async () => { await result.current.registarChamada(PESSOA_ID, pedido); }));
    expect(erro.chave).toBe("pessoasPagina.real.ficha.partialCall");
    expect(erro.codigo).toBe("NG011");
    expect(invalidadas(client)).toEqual([true, true]);
    expect(rpcMock).toHaveBeenCalledTimes(2); // não se repete sozinha
    rpcMock.mockReturnValue(respostaOk({}));
    await act(async () => { await result.current.registarChamada(PESSOA_ID, pedido); });
    expect(parametros(2).p_id).toBe(parametros(0).p_id);
    expect(chamadas().slice(2)).toEqual(["neg_registar_contacto", "neg_encerrar_abordagem"]);
  });

  it("depois de um sucesso completo invalida a ficha e a lista", async () => {
    rpcMock.mockReturnValue(respostaOk({}));
    const { result, client } = montar();
    semear(client);
    await act(async () => { await result.current.registarChamada(PESSOA_ID, dados()); });
    expect(invalidadas(client)).toEqual([true, true]);
  });

  it("«Marcar visita» é do P6: recusa sem chamar a base", async () => {
    const { result } = montar();
    const erro = await erroDe(act(async () => { await result.current.registarChamada(PESSOA_ID, dados({ resultado: "atendeuInteressado", passo: "marcarVisita", data: "2026-10-27", hora: "10:00" })); }));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.generico");
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("encerrar e reativar", () => {
  it("encerrar chama neg_encerrar_abordagem com o lead da ficha", async () => {
    rpcMock.mockReturnValue(respostaOk({}));
    const { result, client } = montar();
    semear(client);
    await act(async () => { await result.current.encerrar(PESSOA_ID, { resultado: "obraInviavel", motivo: "outro", motivoOutro: "Prédio devoluto" }); });
    expect(nomeChamado(0)).toBe("neg_encerrar_abordagem");
    expect(parametros(0)).toEqual({
      p_organization_id: "org-1", p_entity_id: PESSOA_ID, p_resultado: "obraInviavel", p_motivo: "outro", p_motivo_outro: "Prédio devoluto", p_lead_id: LEAD_ID,
    });
    expect(invalidadas(client)).toEqual([true, true]);
  });

  it("NG011 ao encerrar lança o erro com a chave do P0 e não invalida", async () => {
    rpcMock.mockReturnValue(respostaErro("NG011"));
    const { result, client } = montar();
    semear(client);
    const erro = await erroDe(act(async () => { await result.current.encerrar(PESSOA_ID, { resultado: "semInteresse", motivo: "preco" }); }));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.ng011");
    expect(invalidadas(client)).toEqual([false, false]);
  });

  it("NG008 (funcionalidade desligada) também chega traduzível", async () => {
    rpcMock.mockReturnValue(respostaErro("NG008"));
    const { result } = montar();
    const erro = await erroDe(act(async () => { await result.current.encerrar(PESSOA_ID, { resultado: "semInteresse", motivo: "preco" }); }));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.ng008");
  });

  it("sem lead na ficha, p_lead_id vai a null", async () => {
    rpcMock.mockReturnValue(respostaOk({}));
    const { result } = montar({ ficha: fichaDb({ lead: null }) });
    await act(async () => { await result.current.encerrar(PESSOA_ID, { resultado: "semInteresse", motivo: "preco" }); });
    expect(parametros(0).p_lead_id).toBeNull();
  });

  it("reativar chama neg_reabrir_abordagem sem motivo", async () => {
    rpcMock.mockReturnValue(respostaOk({}));
    const { result, client } = montar();
    semear(client);
    await act(async () => { await result.current.reativar(PESSOA_ID); });
    expect(nomeChamado(0)).toBe("neg_reabrir_abordagem");
    expect(parametros(0)).toEqual({ p_organization_id: "org-1", p_entity_id: PESSOA_ID, p_motivo: null, p_lead_id: LEAD_ID });
    expect(invalidadas(client)).toEqual([true, true]);
  });
});


describe("encerrar e reativar: a lead certa (a mais recente pode estar morta)", () => {
  const MORTA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const ABERTA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const ENCERRADA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const morta = { id: MORTA, estado: "converted", aberta: false, encerramento: null };
  const lead = (id: string, fecho: string | null, criada: string) => ({ id, status: "new", created_at: criada, closure_result: fecho });

  it("encerrar escreve na lead aberta e não na lead morta que é a mais recente", async () => {
    rpcMock.mockReturnValue(respostaOk({}));
    const { result } = montar({ ficha: fichaDb({ lead: morta, leads_abertas: [lead(ABERTA, null, "2026-09-01T10:00:00Z")] }) });
    await act(async () => { await result.current.encerrar(PESSOA_ID, { resultado: "semInteresse", motivo: "preco" }); });
    expect(parametros(0).p_lead_id).toBe(ABERTA);
  });

  it("reativar usa a lead encerrada que está entre as abertas quando a mais recente está morta", async () => {
    rpcMock.mockReturnValue(respostaOk({}));
    const { result } = montar({ ficha: fichaDb({ lead: morta, leads_abertas: [lead(ENCERRADA, "semInteresse", "2026-09-01T10:00:00Z")] }) });
    await act(async () => { await result.current.reativar(PESSOA_ID); });
    expect(parametros(0).p_lead_id).toBe(ENCERRADA);
  });

  it("reativar usa a lead que tem o encerramento quando ela é a da ficha", async () => {
    rpcMock.mockReturnValue(respostaOk({}));
    const encerrada = { id: ENCERRADA, estado: "new", aberta: true, encerramento: { resultado: "semInteresse", motivo: "preco", motivo_outro: null, em: "2026-10-01T10:00:00Z" } };
    const { result } = montar({ ficha: fichaDb({ lead: encerrada, leads_abertas: [lead(ENCERRADA, "semInteresse", "2026-09-01T10:00:00Z")] }) });
    await act(async () => { await result.current.reativar(PESSOA_ID); });
    expect(parametros(0).p_lead_id).toBe(ENCERRADA);
  });

  it("com várias abertas escreve na mais recente", async () => {
    rpcMock.mockReturnValue(respostaOk({}));
    const { result } = montar({ ficha: fichaDb({ lead: morta, leads_abertas: [lead("velha", null, "2026-08-01T10:00:00Z"), lead(ABERTA, null, "2026-09-10T10:00:00Z")] }) });
    await act(async () => { await result.current.encerrar(PESSOA_ID, { resultado: "semInteresse", motivo: "preco" }); });
    expect(parametros(0).p_lead_id).toBe(ABERTA);
  });
});
