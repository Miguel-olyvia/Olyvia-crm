// Resultado da visita, nota, adiar e a falta de organização (o resto de useAcoesFichaReal está em useAcoesFichaReal.test.tsx).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { LEAD_ID, PESSOA_ID } from "./fichaFabrica";
import { chamadas, erroDe, invalidadas, limparAcoes, montarAcoes as montar, prepararAcoes, semear } from "./acoesFichaTestUtil";
import { captureMock, nomeChamado, parametros, respostaErro, respostaOk, rpcMock } from "./fichaTestUtil";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpcMock(...args) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));

beforeEach(prepararAcoes);
afterEach(limparAcoes);

describe("registarResultadoVisita", () => {
  it("um resultado que encerra: neg_encerrar_abordagem ANTES de neg_resultado_visita", async () => {
    rpcMock.mockReturnValue(respostaOk({}));
    const { result } = montar();
    await act(async () => { await result.current.registarResultadoVisita("passada", { resultado: "semInteresse", motivo: "preco" }); });
    expect(chamadas()).toEqual(["neg_encerrar_abordagem", "neg_resultado_visita"]);
    expect(parametros(0)).toMatchObject({ p_resultado: "semInteresse", p_motivo: "preco", p_lead_id: LEAD_ID });
    expect(parametros(1)).toEqual({ p_visita_id: "passada", p_resultado: "semInteresse", p_feita: true });
  });

  it("um resultado que não encerra só chama neg_resultado_visita", async () => {
    rpcMock.mockReturnValue(respostaOk({}));
    const { result } = montar();
    await act(async () => { await result.current.registarResultadoVisita("passada", { resultado: "aPensar" }); });
    expect(chamadas()).toEqual(["neg_resultado_visita"]);
    expect(parametros(0)).toEqual({ p_visita_id: "passada", p_resultado: "aPensar", p_feita: true });
  });

  it("p_feita é verdadeiro se a visita já começou e falso se ainda não", async () => {
    rpcMock.mockReturnValue(respostaOk({}));
    const { result } = montar();
    await act(async () => { await result.current.registarResultadoVisita("futura", { resultado: "interessado" }); });
    expect(parametros(0).p_feita).toBe(false);
  });

  it("uma visita que não está na ficha recusa sem chamar a base", async () => {
    const { result } = montar();
    const erro = await erroDe(act(async () => { await result.current.registarResultadoVisita("outra", { resultado: "interessado" }); }));
    expect(erro.chave).toBe("pessoasPagina.real.visit.err.visitNotLoaded");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("se o encerramento falha, o resultado da visita não se regista (a nota fixa apagaria o motivo)", async () => {
    rpcMock.mockReturnValue(respostaErro("NG002"));
    const { result, client } = montar();
    semear(client);
    const erro = await erroDe(act(async () => { await result.current.registarResultadoVisita("passada", { resultado: "obraInviavel", motivo: "preco" }); }));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.ng002");
    expect(chamadas()).toEqual(["neg_encerrar_abordagem"]);
    expect(invalidadas(client)).toEqual([false, false]);
  });

  it("depois de um sucesso invalida a ficha e a lista", async () => {
    rpcMock.mockReturnValue(respostaOk({}));
    const { result, client } = montar();
    semear(client);
    await act(async () => { await result.current.registarResultadoVisita("passada", { resultado: "aPensar" }); });
    expect(invalidadas(client)).toEqual([true, true]);
  });
});

describe("nota e adiar (M8, atrás da capacidade)", () => {
  it("juntarNota chama neg_registar_nota com o texto aparado e um id estável", async () => {
    const { result, client } = montar();
    semear(client);
    rpcMock.mockReturnValueOnce(respostaErro("08006"));
    await erroDe(act(async () => { await result.current.juntarNota(PESSOA_ID, "  Prefere de manhã "); }));
    rpcMock.mockReturnValueOnce(respostaOk({ nota_id: "x", mudou: true }));
    await act(async () => { await result.current.juntarNota(PESSOA_ID, "Prefere de manhã"); });
    expect(nomeChamado(1)).toBe("neg_registar_nota");
    expect(parametros(1)).toEqual({ p_id: "uuid-1", p_organization_id: "org-1", p_entity_id: PESSOA_ID, p_texto: "Prefere de manhã" });
    expect(parametros(0).p_id).toBe("uuid-1");
    expect(invalidadas(client)).toEqual([true, true]);
  });

  it("adiar chama neg_adiar_contacto com o início do dia de Lisboa (hoje + dias)", async () => {
    rpcMock.mockReturnValue(respostaOk({ mudou: true }));
    const { result } = montar();
    await act(async () => { await result.current.adiar(PESSOA_ID, 3); });
    expect(nomeChamado(0)).toBe("neg_adiar_contacto");
    expect(parametros(0)).toEqual({ p_id: "uuid-1", p_organization_id: "org-1", p_entity_id: PESSOA_ID, p_proxima_acao_em: "2026-10-21T23:00:00.000Z" });
  });

  it("uma falha de neg_registar_nota chega traduzível e não invalida", async () => {
    rpcMock.mockReturnValue(respostaErro("NG009"));
    const { result, client } = montar();
    semear(client);
    const erro = await erroDe(act(async () => { await result.current.juntarNota(PESSOA_ID, "x"); }));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.ng009");
    expect(invalidadas(client)).toEqual([false, false]);
  });
});

describe("sem organização ativa", () => {
  it("em modo exemplo nenhuma ação chama a base", async () => {
    const { result } = montar({ fonte: { modo: "exemplo" } });
    const erro = await erroDe(act(async () => { await result.current.encerrar(PESSOA_ID, { resultado: "semInteresse", motivo: "preco" }); }));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.generico");
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
