/**
 * `useProcessamentoPeriodo`: le o periodo de (organizacao, ano, mes), abre
 * (`rpc_hr_processamento_periodo_abrir`) e fecha
 * (`rpc_hr_processamento_periodo_fechar`) -- escrita SO por RPC, nunca
 * insert/update directo. `hrFrom`/`hrRpc` simulados. Nada toca em base
 * nenhuma.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const ORG_ID = "org-nike";

vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: { id: ORG_ID, name: "Nike" } }),
}));

let respostaPeriodo: { data: unknown; error: unknown } = { data: null, error: null };
let chamadasRpc: Array<{ fn: string; args: unknown }> = [];
let respostaRpc: { data: unknown; error: unknown } = { data: "novo-periodo-id", error: null };

function buildChain() {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve(respostaPeriodo),
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

import { useProcessamentoPeriodo } from "@/hooks/useProcessamentoPeriodo";

const PERIODO_ABERTO = {
  id: "periodo-1",
  organization_id: ORG_ID,
  ano: 2026,
  mes: 9,
  estado: "aberto",
  fechado_em: null,
  fechado_por: null,
  created_at: "2026-09-01T00:00:00Z",
  created_by: "user-1",
};

beforeEach(() => {
  chamadasRpc = [];
  respostaPeriodo = { data: null, error: null };
  respostaRpc = { data: "novo-periodo-id", error: null };
});

describe("useProcessamentoPeriodo", () => {
  it("sem periodo para o mes, devolve periodo null", async () => {
    const { result } = renderHook(() => useProcessamentoPeriodo(2026, 9));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.periodo).toBeNull();
  });

  it("carrega o periodo existente para (organizacao, ano, mes)", async () => {
    respostaPeriodo = { data: PERIODO_ABERTO, error: null };
    const { result } = renderHook(() => useProcessamentoPeriodo(2026, 9));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.periodo).toEqual(PERIODO_ABERTO);
  });

  it("um erro de permissao na leitura devolve periodo null, sem lancar", async () => {
    respostaPeriodo = { data: null, error: { code: "42501", message: "insufficient_privilege" } };
    const { result } = renderHook(() => useProcessamentoPeriodo(2026, 9));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.periodo).toBeNull();
    expect(result.current.recusado).toBe(true);
  });

  it("abrir chama a RPC com a organizacao activa, o ano e o mes", async () => {
    const { result } = renderHook(() => useProcessamentoPeriodo(2026, 9));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.abrir();

    expect(chamadasRpc).toHaveLength(1);
    expect(chamadasRpc[0]).toEqual({
      fn: "rpc_hr_processamento_periodo_abrir",
      args: { p_organization_id: ORG_ID, p_ano: 2026, p_mes: 9 },
    });
  });

  it("fechar chama a RPC com o id do periodo carregado", async () => {
    respostaPeriodo = { data: PERIODO_ABERTO, error: null };
    const { result } = renderHook(() => useProcessamentoPeriodo(2026, 9));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.fechar();

    expect(chamadasRpc).toHaveLength(1);
    expect(chamadasRpc[0]).toEqual({
      fn: "rpc_hr_processamento_periodo_fechar",
      args: { p_periodo_id: "periodo-1" },
    });
  });

  it("fechar sem periodo carregado nao chama a RPC e devolve erro", async () => {
    const { result } = renderHook(() => useProcessamentoPeriodo(2026, 9));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const erro = await result.current.fechar();

    expect(chamadasRpc).toHaveLength(0);
    expect(erro).toBeTruthy();
  });

  it("propaga o erro da RPC ao abrir, em vez de o engolir", async () => {
    respostaRpc = { data: null, error: { message: "Ja existe um periodo" } };
    const { result } = renderHook(() => useProcessamentoPeriodo(2026, 9));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const erro = await result.current.abrir();
    expect(erro).toBeTruthy();
  });
});
