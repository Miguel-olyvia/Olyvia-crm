// Dar um negócio como ganho (neg_ganhar_negocio) pela ficha real, e refazer a ficha à mão: os parâmetros, as conversões, os avisos, os erros pelo código.
// (O resto das mutações está em useMutacoesNegocio.test.tsx.)
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { PESSOA_ID } from "./fichaFabrica";
import { erroDe, invalidadas, limparAcoes, prepararAcoes, semear } from "./acoesFichaTestUtil";
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

describe("ganhar", () => {
  const resposta = (extra: Record<string, unknown> = {}) => respostaOk({
    mudou: true, estado: "ganho", conversao: "feita", lead_id: "l1", client_id: "c1", outras_leads_abertas: 0, ...extra,
  });

  it("chama neg_ganhar_negocio com o negócio e a lead escolhida", async () => {
    rpcMock.mockReturnValue(resposta());
    const { result } = montar();
    await act(async () => { await result.current.ganhar(NEG, "lead-9"); });
    expect(nomeChamado(0)).toBe("neg_ganhar_negocio");
    expect(parametros(0)).toEqual({ p_negocio_id: NEG, p_lead_id: "lead-9" });
  });

  it("sem lead escolhida manda p_lead_id nulo (a base escolhe a mais recente)", async () => {
    rpcMock.mockReturnValue(resposta());
    const { result } = montar();
    await act(async () => { await result.current.ganhar(NEG, null); });
    expect(parametros(0)).toEqual({ p_negocio_id: NEG, p_lead_id: null });
  });

  it.each(["feita", "ja_cliente", "ja_convertida"] as const)("a conversão «%s» chega ao ecrã", async (conversao) => {
    rpcMock.mockReturnValue(resposta({ conversao }));
    const { result } = montar();
    let r: { conversao: string | null } | undefined;
    await act(async () => { r = await result.current.ganhar(NEG, null); });
    expect(r?.conversao).toBe(conversao);
  });

  it("devolve se mudou e quantas outras leads abertas a pessoa tem", async () => {
    rpcMock.mockReturnValue(resposta({ mudou: false, outras_leads_abertas: 2 }));
    const { result } = montar();
    let r: unknown;
    await act(async () => { r = await result.current.ganhar(NEG, null); });
    expect(r).toEqual({ mudou: false, conversao: "feita", outrasLeadsAbertas: 2 });
  });

  it("uma conversão que não se conhece fica nula e um número de leads inválido vale 0 (nada rebenta)", async () => {
    rpcMock.mockReturnValue(resposta({ conversao: "outra", outras_leads_abertas: "muitas" }));
    const { result } = montar();
    let r: unknown;
    await act(async () => { r = await result.current.ganhar(NEG, null); });
    expect(r).toEqual({ mudou: true, conversao: null, outrasLeadsAbertas: 0 });
  });

  it("depois de ganhar invalida a ficha e a lista", async () => {
    rpcMock.mockReturnValue(resposta());
    const { result, client } = montar();
    semear(client);
    await act(async () => { await result.current.ganhar(NEG, null); });
    expect(invalidadas(client)).toEqual([true, true]);
  });

  it.each([["NG006", "ng006"], ["NG007", "ng007"], ["NG012", "ng012"], ["NG015", "ng015"], ["42501", "permissao"]])(
    "%s traduz-se pelo código (%s) e não refaz nada",
    async (codigo, chave) => {
      rpcMock.mockReturnValue(respostaErro(codigo));
      const { result, client } = montar();
      semear(client);
      const erro = await erroDe(act(async () => { await result.current.ganhar(NEG, null); }));
      expect(erro.codigo).toBe(codigo);
      expect(erro.chave).toBe(`pessoasPagina.erroNeg.${chave}`);
      expect(invalidadas(client)).toEqual([false, false]);
    },
  );

  it("uma resposta vazia da base é um erro genérico, não um sucesso", async () => {
    rpcMock.mockReturnValue(respostaOk(null));
    const { result } = montar();
    const erro = await erroDe(act(async () => { await result.current.ganhar(NEG, null); }));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.generico");
  });
});

describe("refrescar", () => {
  it("refaz a ficha e a lista (para um passo de fora, como um documento criado, aparecer)", () => {
    const { result, client } = montar();
    semear(client);
    act(() => { result.current.refrescar(); });
    expect(invalidadas(client)).toEqual([true, true]);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("sem organização (o exemplo) não faz nada", () => {
    const { result, client } = montar({ fonte: { modo: "exemplo" } });
    semear(client);
    act(() => { result.current.refrescar(); });
    expect(invalidadas(client)).toEqual([false, false]);
  });
});
