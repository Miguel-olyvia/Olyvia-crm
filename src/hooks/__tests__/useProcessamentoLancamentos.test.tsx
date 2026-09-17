/**
 * `useProcessamentoLancamentos`: le os lancamentos de UM periodo, cria
 * (`rpc_hr_processamento_lancamento_criar`) e anula
 * (`rpc_hr_processamento_lancamento_anular`) -- escrita SO por RPC. Um
 * lancamento nunca se apaga: so se anula. `hrFrom`/`hrRpc` simulados. Nada
 * toca em base nenhuma.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const PERIODO_ID = "periodo-1";

let respostaLancamentos: { data: unknown; error: unknown } = { data: [], error: null };
let chamadasRpc: Array<{ fn: string; args: unknown }> = [];
let respostaRpc: { data: unknown; error: unknown } = { data: "novo-lancamento-id", error: null };

function buildChain() {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    order: () => Promise.resolve(respostaLancamentos),
  };
  return chain;
}

vi.mock("@/lib/hr/hrDb", () => ({
  hrFrom: () => buildChain(),
  hrRpc: (fn: string, args?: Record<string, unknown>) => {
    chamadasRpc.push({ fn, args });
    return Promise.resolve(respostaRpc);
  },
  isPermissionError: (erro: unknown) =>
    !!erro && typeof erro === "object" && (erro as { code?: string }).code === "42501",
}));

import { useProcessamentoLancamentos } from "@/hooks/useProcessamentoLancamentos";

const LANCAMENTO = {
  id: "lancamento-1",
  periodo_id: PERIODO_ID,
  pessoa_id: "pessoa-1",
  organization_id: "org-nike",
  descricao: "Premio de produtividade",
  valor: 150.5,
  codigo_processamento_id: null,
  anulado_em: null,
  anulado_por: null,
  anulado_motivo: null,
  created_at: "2026-09-05T00:00:00Z",
  created_by: "user-1",
  updated_at: "2026-09-05T00:00:00Z",
  updated_by: "user-1",
};

beforeEach(() => {
  chamadasRpc = [];
  respostaLancamentos = { data: [LANCAMENTO], error: null };
  respostaRpc = { data: "novo-lancamento-id", error: null };
});

describe("useProcessamentoLancamentos", () => {
  it("carrega os lancamentos do periodo", async () => {
    const { result } = renderHook(() => useProcessamentoLancamentos(PERIODO_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.lancamentos).toEqual([LANCAMENTO]);
  });

  it("sem periodo, nao carrega nada", async () => {
    const { result } = renderHook(() => useProcessamentoLancamentos(undefined));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.lancamentos).toEqual([]);
  });

  it("um erro de permissao na leitura devolve lista vazia, sem lancar", async () => {
    respostaLancamentos = { data: null, error: { code: "42501", message: "insufficient_privilege" } };
    const { result } = renderHook(() => useProcessamentoLancamentos(PERIODO_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.lancamentos).toEqual([]);
    expect(result.current.recusado).toBe(true);
  });

  it("criar chama a RPC com o periodo, a pessoa, a descricao, o valor e o codigo", async () => {
    const { result } = renderHook(() => useProcessamentoLancamentos(PERIODO_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.criar({
      pessoaId: "pessoa-1",
      descricao: "Premio",
      valor: 100,
      codigoProcessamentoId: "codigo-1",
    });

    expect(chamadasRpc).toHaveLength(1);
    expect(chamadasRpc[0]).toEqual({
      fn: "rpc_hr_processamento_lancamento_criar",
      args: {
        p_periodo_id: PERIODO_ID,
        p_pessoa_id: "pessoa-1",
        p_descricao: "Premio",
        p_valor: 100,
        p_codigo_processamento_id: "codigo-1",
      },
    });
  });

  it("anular chama a RPC com o id do lancamento e o motivo -- nunca delete", async () => {
    const { result } = renderHook(() => useProcessamentoLancamentos(PERIODO_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.anular("lancamento-1", "Valor lancado por engano");

    expect(chamadasRpc).toHaveLength(1);
    expect(chamadasRpc[0]).toEqual({
      fn: "rpc_hr_processamento_lancamento_anular",
      args: { p_lancamento_id: "lancamento-1", p_motivo: "Valor lancado por engano" },
    });
    expect((result.current as Record<string, unknown>).eliminar).toBeUndefined();
  });

  it("propaga o erro da RPC ao criar num periodo fechado, em vez de o engolir", async () => {
    respostaRpc = { data: null, error: { message: "Periodo ja esta fechado" } };
    const { result } = renderHook(() => useProcessamentoLancamentos(PERIODO_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const erro = await result.current.criar({
      pessoaId: "pessoa-1",
      descricao: "Premio",
      valor: 100,
      codigoProcessamentoId: null,
    });

    expect(erro).toBeTruthy();
  });
});
