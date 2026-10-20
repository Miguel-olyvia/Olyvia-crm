// A ficha real e as visitas (P6): o que a ficha liga (alterar e cancelar pelos diálogos, sem abrir o menu «Visita e levantamento» nem o passo da
// chamada), o cancelamento por neg_cancelar_visita e o resultado da visita lido por diálogo (NG004, NG009 e NG018 com a mensagem da visita).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { chamadas, erroDe, invalidadas, limparAcoes, montarAcoes as montar, prepararAcoes, semear } from "./acoesFichaTestUtil";
import { captureMock, parametros, respostaErro, respostaOk, rpcMock } from "./fichaTestUtil";
import { CAPACIDADES_FICHA_REAL } from "./useAcoesFichaReal";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpcMock(...args) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));

beforeEach(prepararAcoes);
afterEach(limparAcoes);

const V = "pessoasPagina.real.visit.";

describe("capacidades da ficha real", () => {
  it("gere visitas já marcadas (alterar e cancelar) e marca visitas pela chamada (ALTERADO: `visita` era false)", () => {
    expect(CAPACIDADES_FICHA_REAL.gerirVisitas).toBe(true);
    expect(CAPACIDADES_FICHA_REAL.visita).toBe(true);
  });

  it("as ações devolvem as mesmas capacidades", () => {
    const { result } = montar();
    expect(result.current.capacidades).toBe(CAPACIDADES_FICHA_REAL);
  });
});

describe("cancelarVisita", () => {
  it("chama neg_cancelar_visita só com a visita, devolve vazio e invalida a ficha e a lista", async () => {
    const { result, client } = montar();
    semear(client);
    rpcMock.mockReturnValueOnce(respostaOk({ mudou: true }));
    const r = await act(async () => result.current.cancelarVisita?.("futura"));
    expect(r).toBeUndefined();
    expect(chamadas()).toEqual(["neg_cancelar_visita"]);
    expect(parametros(0)).toEqual({ p_visita_id: "futura" });
    expect(invalidadas(client)).toEqual([true, true]);
  });

  it("cancelar uma visita já cancelada (mudou=false) é sucesso silencioso", async () => {
    const { result } = montar();
    rpcMock.mockReturnValueOnce(respostaOk({ mudou: false }));
    await expect(act(async () => result.current.cancelarVisita?.("futura"))).resolves.toBeUndefined();
  });

  it("NG018 chega com a mensagem do diálogo de cancelar e não invalida", async () => {
    const { result, client } = montar();
    semear(client);
    rpcMock.mockReturnValueOnce(respostaErro("NG018"));
    const erro = await erroDe(act(async () => { await result.current.cancelarVisita?.("futura"); }));
    expect(erro.chave).toBe(`${V}err.cancelar.ng018`);
    expect(invalidadas(client)).toEqual([false, false]);
  });

  it("duplo clique: um pedido igual enquanto o primeiro corre não vai outra vez à base", async () => {
    const { result } = montar();
    let resolver!: (v: unknown) => void;
    rpcMock.mockReturnValueOnce(new Promise((ok) => { resolver = ok; }));
    let a!: Promise<void> | void;
    let b!: Promise<void> | void;
    await act(async () => {
      a = result.current.cancelarVisita?.("futura");
      b = result.current.cancelarVisita?.("futura");
      resolver({ data: { mudou: true }, error: null });
      await Promise.all([a, b]);
    });
    expect(chamadas()).toEqual(["neg_cancelar_visita"]);
  });
});

describe("registarResultadoVisita lido pelo diálogo da visita", () => {
  it("NG018 (visita cancelada) e NG009 (ainda por acontecer) chegam com a mensagem da visita", async () => {
    const { result } = montar();
    rpcMock.mockReturnValueOnce(respostaErro("NG018")).mockReturnValueOnce(respostaErro("NG009"));
    const cancelada = await erroDe(act(async () => { await result.current.registarResultadoVisita("passada", { resultado: "aPensar" }); }));
    expect(cancelada.chave).toBe(`${V}err.resultado.ng018`);
    const futura = await erroDe(act(async () => { await result.current.registarResultadoVisita("passada", { resultado: "aPensar" }); }));
    expect(futura.chave).toBe(`${V}err.resultado.ng009`);
  });

  it("NG004 depois de o encerramento ter ficado gravado: aviso parcial com a mensagem da visita ao lado", async () => {
    const { result, client } = montar();
    semear(client);
    rpcMock.mockReturnValueOnce(respostaOk({ mudou: true })).mockReturnValueOnce(respostaErro("NG004"));
    const erro = await erroDe(act(async () => { await result.current.registarResultadoVisita("passada", { resultado: "semInteresse", motivo: "preco" }); }));
    expect(erro.chave).toBe("pessoasPagina.real.ficha.partialVisit");
    expect(erro.chaveExtra).toBe(`${V}err.resultado.ng004`);
    expect(invalidadas(client)).toEqual([true, true]);
    expect(chamadas()).toEqual(["neg_encerrar_abordagem", "neg_resultado_visita"]);
  });

  it("duplo clique no resultado: grava uma vez", async () => {
    const { result } = montar();
    let resolver!: (v: unknown) => void;
    rpcMock.mockReturnValueOnce(new Promise((ok) => { resolver = ok; }));
    await act(async () => {
      const a = result.current.registarResultadoVisita("passada", { resultado: "aPensar" });
      const b = result.current.registarResultadoVisita("passada", { resultado: "aPensar" });
      resolver({ data: {}, error: null });
      await Promise.all([a, b]);
    });
    expect(chamadas()).toEqual(["neg_resultado_visita"]);
  });
});
