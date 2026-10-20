// useAcoesVisita.concluir: dar uma visita como feita sem resultado (neg_resultado_visita com p_resultado nulo e p_feita verdadeiro). Ao contrário de
// `resultado`, não precisa da visita na ficha: serve a visita que o painel «Visita e levantamento» acabou de criar (a ficha ainda não a tem).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { FICHA, invalidadas, limparAcoes, prepararAcoes, semear } from "./acoesFichaTestUtil";
import type { ErroNeg } from "./chamarNeg";
import { PESSOA_ID } from "./fichaFabrica";
import { captureMock, fonteReal, montarHook, parametros, respostaErro, respostaOk, rpcMock } from "./fichaTestUtil";
import type { FontePessoas } from "./useFontePessoas";
import { useAcoesVisita } from "./useAcoesVisita";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpcMock(...args) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));

const montar = (fonte: FontePessoas = fonteReal()) =>
  montarHook((p: { ficha: typeof FICHA | null }) => useAcoesVisita(PESSOA_ID, p.ficha), { ficha: null }, { fonte });
const erroDe = async (p: Promise<unknown>): Promise<ErroNeg> => (await Promise.resolve(p).then(() => null, (e) => e)) as ErroNeg;

beforeEach(prepararAcoes);
afterEach(limparAcoes);

describe("concluir", () => {
  it("chama neg_resultado_visita sem resultado e com p_feita verdadeiro, mesmo sem a visita na ficha, e invalida a ficha e as listas", async () => {
    const { result, client } = montar();
    semear(client);
    rpcMock.mockReturnValue(respostaOk({ mudou: true }));
    await act(async () => { await result.current.concluir("visita-nova"); });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock.mock.calls[0][0]).toBe("neg_resultado_visita");
    expect(parametros(0)).toEqual({ p_visita_id: "visita-nova", p_resultado: null, p_feita: true });
    expect(invalidadas(client)).toEqual([true, true]);
  });

  it("um erro lê-se para o diálogo do resultado (NG009: visita que ainda não aconteceu) e não invalida", async () => {
    const { result, client } = montar();
    semear(client);
    rpcMock.mockReturnValue(respostaErro("NG009"));
    const erro = await erroDe(act(async () => result.current.concluir("v")));
    expect(erro.chave).toBe("pessoasPagina.real.visit.err.resultado.ng009");
    expect(erro.codigo).toBe("NG009");
    expect(invalidadas(client)).toEqual([false, false]);
  });

  it("um duplo clique partilha a resposta: só uma chamada à base", async () => {
    const { result } = montar();
    rpcMock.mockReturnValue(respostaOk({ mudou: true }));
    await act(async () => { await Promise.all([result.current.concluir("v"), result.current.concluir("v")]); });
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("sem visita no pedido ou sem a fonte real não chama a base", async () => {
    const { result } = montar();
    const vazio = await erroDe(act(async () => result.current.concluir("")));
    expect(vazio.chave).toBe("pessoasPagina.real.visit.err.noVisit");
    const exemplo = montar({ modo: "exemplo" });
    const semBase = await erroDe(act(async () => exemplo.result.current.concluir("v")));
    expect(semBase.chave).toBe("pessoasPagina.erroNeg.generico");
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
