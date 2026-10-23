// As mutações de um negócio da ficha real: perder, anular a perda, ligar e desligar um registo, e ganhar. Cada uma chama a função neg_*
// certa, traduz o erro pelo CÓDIGO, não repete um pedido igual que ainda está a correr e refaz a ficha e a lista depois de escrever.
// (Criar negócio está em useMutacoesNegocioCriar.test.tsx; ganhar e refrescar em useMutacoesNegocioGanhar.test.tsx.)
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { ErroNeg } from "./chamarNeg";
import { PESSOA_ID } from "./fichaFabrica";
import { chamadas, erroDe, invalidadas, limparAcoes, prepararAcoes, semear } from "./acoesFichaTestUtil";
import { captureMock, criarCliente, fonteReal, montarHook, nomeChamado, parametros, respostaErro, respostaOk, rpcMock } from "./fichaTestUtil";
import { useMutacoesNegocio } from "./useMutacoesNegocio";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpcMock(...args) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));

beforeEach(prepararAcoes);
afterEach(limparAcoes);

const NEG = "99999999-9999-4999-8999-999999999999";

function montar(fonte: Parameters<typeof montarHook>[2] = {}) {
  const client = fonte.client ?? criarCliente();
  const r = montarHook(() => useMutacoesNegocio(PESSOA_ID, null), undefined, { client, fonte: fonte.fonte ?? fonteReal() });
  return { ...r, client };
}

describe("perder", () => {
  it("chama neg_perder_negocio com o negócio, a fase da base e o motivo", async () => {
    rpcMock.mockReturnValue(respostaOk({ mudou: true, estado: "perdido" }));
    const { result } = montar();
    let r: { mudou: boolean } | undefined;
    await act(async () => { r = await result.current.perder({ negocioId: NEG, fase: "proposta", motivo: "Preço" }); });
    expect(nomeChamado(0)).toBe("neg_perder_negocio");
    expect(parametros(0)).toEqual({ p_negocio_id: NEG, p_fase: "proposta", p_motivo: "Preço" });
    expect(r).toEqual({ mudou: true });
  });

  it("mudou: false (já estava perdido com o mesmo motivo) devolve-se tal e qual", async () => {
    rpcMock.mockReturnValue(respostaOk({ mudou: false, estado: "perdido" }));
    const { result } = montar();
    let r: { mudou: boolean } | undefined;
    await act(async () => { r = await result.current.perder({ negocioId: NEG, fase: "orcamento", motivo: "Preço" }); });
    expect(r).toEqual({ mudou: false });
  });

  it("depois de um sucesso invalida a ficha e a lista", async () => {
    rpcMock.mockReturnValue(respostaOk({ mudou: true }));
    const { result, client } = montar();
    semear(client);
    await act(async () => { await result.current.perder({ negocioId: NEG, fase: "orcamento", motivo: "Preço" }); });
    expect(invalidadas(client)).toEqual([true, true]);
  });

  it("um motivo vazio ou só com espaços recusa sem chamar a base (NG009)", async () => {
    const { result } = montar();
    const erro = await erroDe(act(async () => { await result.current.perder({ negocioId: NEG, fase: "orcamento", motivo: "   " }); }));
    expect(erro).toBeInstanceOf(ErroNeg);
    expect(erro.codigo).toBe("NG009");
    expect(erro.chave).toBe("pessoasPagina.erroNeg.ng009");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("duas chamadas iguais ao mesmo tempo (duplo clique) fazem UMA chamada à base", async () => {
    let acabar: (v: unknown) => void = () => undefined;
    rpcMock.mockReturnValue(new Promise((resolve) => { acabar = resolve; }));
    const { result } = montar();
    let primeira: Promise<unknown> | undefined;
    let segunda: Promise<unknown> | undefined;
    act(() => {
      primeira = result.current.perder({ negocioId: NEG, fase: "orcamento", motivo: "Preço" });
      segunda = result.current.perder({ negocioId: NEG, fase: "orcamento", motivo: "Preço" });
    });
    await act(async () => { acabar({ data: { mudou: true }, error: null }); await Promise.all([primeira, segunda]); });
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("terminada a primeira, um pedido igual volta a chamar a base", async () => {
    rpcMock.mockReturnValue(respostaOk({ mudou: true }));
    const { result } = montar();
    await act(async () => { await result.current.perder({ negocioId: NEG, fase: "orcamento", motivo: "Preço" }); });
    await act(async () => { await result.current.perder({ negocioId: NEG, fase: "orcamento", motivo: "Preço" }); });
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });

  it("NG001 (o negócio já não está disponível) traduz-se pelo código e refaz a ficha: o que se vê está desatualizado", async () => {
    rpcMock.mockReturnValue(respostaErro("NG001"));
    const { result, client } = montar();
    semear(client);
    const erro = await erroDe(act(async () => { await result.current.perder({ negocioId: NEG, fase: "orcamento", motivo: "Preço" }); }));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.ng001");
    expect(invalidadas(client)).toEqual([true, true]);
  });

  it("um erro de valor (NG009) não refaz nada", async () => {
    rpcMock.mockReturnValue(respostaErro("NG009"));
    const { result, client } = montar();
    semear(client);
    const erro = await erroDe(act(async () => { await result.current.perder({ negocioId: NEG, fase: "orcamento", motivo: "Preço" }); }));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.ng009");
    expect(invalidadas(client)).toEqual([false, false]);
  });

  it("sem organização (o exemplo) recusa sem chamar a base", async () => {
    const { result } = montar({ fonte: { modo: "exemplo" } });
    const erro = await erroDe(act(async () => { await result.current.perder({ negocioId: NEG, fase: "orcamento", motivo: "Preço" }); }));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.generico");
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("anular a perda", () => {
  it("chama neg_anular_perda com a razão sem espaços nas pontas", async () => {
    rpcMock.mockReturnValue(respostaOk({ mudou: true, estado: "aberto" }));
    const { result } = montar();
    let r: { mudou: boolean } | undefined;
    await act(async () => { r = await result.current.anular(NEG, "  O cliente voltou  "); });
    expect(nomeChamado(0)).toBe("neg_anular_perda");
    expect(parametros(0)).toEqual({ p_negocio_id: NEG, p_motivo_reabertura: "O cliente voltou" });
    expect(r).toEqual({ mudou: true });
  });

  it("razão vazia, ou com mais de 1000 caracteres, recusa sem chamar a base (NG009)", async () => {
    const { result } = montar();
    for (const razao of ["", "   ", "x".repeat(1001)]) {
      const erro = await erroDe(act(async () => { await result.current.anular(NEG, razao); }));
      expect(erro.codigo, JSON.stringify(razao.length)).toBe("NG009");
    }
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("1000 caracteres ainda passam", async () => {
    rpcMock.mockReturnValue(respostaOk({ mudou: true }));
    const { result } = montar();
    await act(async () => { await result.current.anular(NEG, "x".repeat(1000)); });
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("mudou: false (já estava aberto) invalida em silêncio e devolve mudou: false", async () => {
    rpcMock.mockReturnValue(respostaOk({ mudou: false, estado: "aberto" }));
    const { result, client } = montar();
    semear(client);
    let r: { mudou: boolean } | undefined;
    await act(async () => { r = await result.current.anular(NEG, "Razão"); });
    expect(r).toEqual({ mudou: false });
    expect(invalidadas(client)).toEqual([true, true]);
  });

  it("NG002 (o estado não permite) traduz-se e refaz a ficha", async () => {
    rpcMock.mockReturnValue(respostaErro("NG002"));
    const { result, client } = montar();
    semear(client);
    const erro = await erroDe(act(async () => { await result.current.anular(NEG, "Razão"); }));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.ng002");
    expect(invalidadas(client)).toEqual([true, true]);
  });
});

describe("ligar e desligar um registo", () => {
  it.each(["contacto", "visita", "levantamento", "orcamento", "proposta", "contrato"] as const)("ligar %s: neg_ligar_registo com o tipo e o id", async (tipo) => {
    rpcMock.mockReturnValue(respostaOk({ mudou: true }));
    const { result } = montar();
    await act(async () => { await result.current.ligar(NEG, { tipo, id: "reg-1" }); });
    expect(nomeChamado(0)).toBe("neg_ligar_registo");
    expect(parametros(0)).toEqual({ p_negocio_id: NEG, p_tipo: tipo, p_registo_id: "reg-1" });
  });

  it("desligar: neg_desligar_registo com o tipo e o id", async () => {
    rpcMock.mockReturnValue(respostaOk({ mudou: true }));
    const { result } = montar();
    await act(async () => { await result.current.desligar(NEG, { tipo: "visita", id: "v-1" }); });
    expect(nomeChamado(0)).toBe("neg_desligar_registo");
    expect(parametros(0)).toEqual({ p_negocio_id: NEG, p_tipo: "visita", p_registo_id: "v-1" });
  });

  it("mudou: false invalida em silêncio (a ficha ficava desatualizada)", async () => {
    rpcMock.mockReturnValue(respostaOk({ mudou: false }));
    const { result, client } = montar();
    semear(client);
    await act(async () => { await result.current.ligar(NEG, { tipo: "contacto", id: "c-1" }); });
    expect(invalidadas(client)).toEqual([true, true]);
  });

  it("NG004 (o registo não pode ser ligado) traduz-se e refaz a ficha", async () => {
    rpcMock.mockReturnValue(respostaErro("NG004"));
    const { result, client } = montar();
    semear(client);
    const erro = await erroDe(act(async () => { await result.current.ligar(NEG, { tipo: "contacto", id: "c-1" }); }));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.ng004");
    expect(invalidadas(client)).toEqual([true, true]);
  });

  it("NG005 ao desligar um levantamento traduz-se pelo código", async () => {
    rpcMock.mockReturnValue(respostaErro("NG005"));
    const { result } = montar();
    const erro = await erroDe(act(async () => { await result.current.desligar(NEG, { tipo: "levantamento", id: "l-1" }); }));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.ng005");
  });

  it("ligar dois registos diferentes ao mesmo tempo faz duas chamadas; o mesmo duas vezes, uma", async () => {
    rpcMock.mockReturnValue(respostaOk({ mudou: true }));
    const { result } = montar();
    await act(async () => {
      await Promise.all([
        result.current.ligar(NEG, { tipo: "contacto", id: "a" }), result.current.ligar(NEG, { tipo: "contacto", id: "a" }),
        result.current.ligar(NEG, { tipo: "contacto", id: "b" }),
      ]);
    });
    expect(chamadas()).toEqual(["neg_ligar_registo", "neg_ligar_registo"]);
  });

  it("um tipo que a base não conhece nem chega a ser chamado", async () => {
    const { result } = montar();
    const erro = await erroDe(act(async () => { await result.current.ligar(NEG, { tipo: "nota" as never, id: "x" }); }));
    expect(erro.codigo).toBe("NG009");
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
