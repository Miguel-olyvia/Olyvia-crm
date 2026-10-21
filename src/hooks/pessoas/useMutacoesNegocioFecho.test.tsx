// Mudar o tipo de fecho de um negócio (neg_mudar_fecho) pela ficha real: os parâmetros, a resposta «precisa_confirmar» (a base manda pedir
// confirmação; só se muda repetindo a chamada com a confirmação), os erros NG022 e NG023 pelo código e o refrescar da ficha.
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
const resposta = (extra: Record<string, unknown> = {}) => respostaOk({ mudou: true, fecho: "proposta", precisa_confirmar: false, ...extra });

function montar() {
  const client = criarCliente();
  const r = montarHook(() => useMutacoesNegocio(PESSOA_ID, fichaDb(), {}), undefined, { client, fonte: fonteReal() });
  return { ...r, client };
}

describe("mudarFecho: a chamada", () => {
  it("chama neg_mudar_fecho com o negócio, o tipo e a confirmação (falsa à primeira)", async () => {
    rpcMock.mockReturnValue(resposta());
    const { result } = montar();
    await act(async () => { await result.current.mudarFecho?.(NEGOCIO, "proposta", false); });
    expect(nomeChamado(0)).toBe("neg_mudar_fecho");
    expect(parametros(0)).toEqual({ p_negocio_id: NEGOCIO, p_fecho: "proposta", p_confirmar: false });
  });

  it("com a confirmação manda p_confirmar verdadeiro", async () => {
    rpcMock.mockReturnValue(resposta());
    const { result } = montar();
    await act(async () => { await result.current.mudarFecho?.(NEGOCIO, "contrato", true); });
    expect(parametros(0)).toEqual({ p_negocio_id: NEGOCIO, p_fecho: "contrato", p_confirmar: true });
  });

  it("um tipo desconhecido recusa com NG009 sem chamar a base", async () => {
    const { result } = montar();
    const erro = await erroDe(act(async () => { await result.current.mudarFecho?.(NEGOCIO, "outro" as never, false); }));
    expect(erro.codigo).toBe("NG009");
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("mudarFecho: permissão de editar", () => {
  it("quem não pode editar recusa sem chamar a base (42501): o botão já não aparece, e isto é a defesa em profundidade", async () => {
    const client = criarCliente();
    const { result } = montarHook(() => useMutacoesNegocio(PESSOA_ID, fichaDb({ permissoes: { editar: false, criar: true } }), {}), undefined, { client, fonte: fonteReal() });
    const erro = await erroDe(act(async () => { await result.current.mudarFecho?.(NEGOCIO, "proposta", false); }));
    expect(erro.codigo).toBe("42501");
    expect(erro.chave).toBe("pessoasPagina.erroNeg.permissao");
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("mudarFecho: as respostas", () => {
  it("mudou: devolve o tipo novo e que não precisa de confirmação", async () => {
    rpcMock.mockReturnValue(resposta());
    const { result } = montar();
    let r: unknown;
    await act(async () => { r = await result.current.mudarFecho?.(NEGOCIO, "proposta", false); });
    expect(r).toEqual({ mudou: true, fecho: "proposta", precisaConfirmar: false });
  });

  it("precisa_confirmar: devolve que não mudou e que é preciso confirmar, sem inventar nada", async () => {
    rpcMock.mockReturnValue(resposta({ mudou: false, fecho: "contrato", precisa_confirmar: true }));
    const { result } = montar();
    let r: unknown;
    await act(async () => { r = await result.current.mudarFecho?.(NEGOCIO, "proposta", false); });
    expect(r).toEqual({ mudou: false, fecho: "contrato", precisaConfirmar: true });
  });

  it("já era esse tipo: mudou false e nada a confirmar", async () => {
    rpcMock.mockReturnValue(resposta({ mudou: false, fecho: "proposta" }));
    const { result } = montar();
    let r: unknown;
    await act(async () => { r = await result.current.mudarFecho?.(NEGOCIO, "proposta", false); });
    expect(r).toEqual({ mudou: false, fecho: "proposta", precisaConfirmar: false });
  });

  it("um valor de fecho desconhecido na resposta lê-se como nulo; precisa_confirmar só vale se for exatamente true", async () => {
    rpcMock.mockReturnValue(resposta({ fecho: "xpto", precisa_confirmar: "true" }));
    const { result } = montar();
    let r: unknown;
    await act(async () => { r = await result.current.mudarFecho?.(NEGOCIO, "proposta", false); });
    expect(r).toEqual({ mudou: true, fecho: null, precisaConfirmar: false });
  });

  it("uma resposta que não é um objeto dá o erro genérico", async () => {
    rpcMock.mockReturnValue(respostaOk(null));
    const { result } = montar();
    const erro = await erroDe(act(async () => { await result.current.mudarFecho?.(NEGOCIO, "proposta", false); }));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.generico");
  });

  it("depois de mudar refaz a ficha e a lista", async () => {
    rpcMock.mockReturnValue(resposta());
    const { result, client } = montar();
    semear(client);
    await act(async () => { await result.current.mudarFecho?.(NEGOCIO, "proposta", false); });
    expect(invalidadas(client)).toEqual([true, true]);
  });

  it("duas chamadas iguais ao mesmo tempo (duplo clique) fazem UMA chamada à base", async () => {
    let acabar: (v: unknown) => void = () => undefined;
    rpcMock.mockReturnValue(new Promise((r) => { acabar = r; }));
    const { result } = montar();
    let a: Promise<unknown> | undefined;
    let b: Promise<unknown> | undefined;
    act(() => {
      a = result.current.mudarFecho?.(NEGOCIO, "proposta", false);
      b = result.current.mudarFecho?.(NEGOCIO, "proposta", false);
    });
    await act(async () => { acabar({ data: { mudou: true, fecho: "proposta", precisa_confirmar: false }, error: null }); await Promise.all([a, b]); });
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});

describe("mudarFecho: os erros, pelo código", () => {
  it("NG022 (o tipo não muda neste estado) traduz-se e refaz a ficha: o estado do negócio já não é o que o ecrã mostra", async () => {
    rpcMock.mockReturnValue(respostaErro("NG022"));
    const { result, client } = montar();
    semear(client);
    const erro = await erroDe(act(async () => { await result.current.mudarFecho?.(NEGOCIO, "proposta", false); }));
    expect(erro.codigo).toBe("NG022");
    expect(erro.chave).toBe("pessoasPagina.erroNeg.ng022");
    expect(invalidadas(client)).toEqual([true, true]);
  });

  it("NG023 (ligar contrato a venda directa) traduz-se e refaz a ficha: o fecho que o ecrã mostra está desatualizado", async () => {
    rpcMock.mockReturnValue(respostaErro("NG023"));
    const { result, client } = montar();
    semear(client);
    const erro = await erroDe(act(async () => { await result.current.mudarFecho?.(NEGOCIO, "proposta", false); }));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.ng023");
    expect(invalidadas(client)).toEqual([true, true]);
  });

  it("sem permissão (42501) traduz-se e não refaz nada", async () => {
    rpcMock.mockReturnValue(respostaErro("42501"));
    const { result, client } = montar();
    semear(client);
    const erro = await erroDe(act(async () => { await result.current.mudarFecho?.(NEGOCIO, "proposta", false); }));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.permissao");
    expect(invalidadas(client)).toEqual([false, false]);
  });
});
