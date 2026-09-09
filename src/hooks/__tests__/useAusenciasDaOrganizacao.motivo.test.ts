/**
 * `motivo` de `pessoas_ausencias_pedidos` deixou de ter SELECT directo para
 * `authenticated` (migration 20261122050000, REVOKE SELECT (motivo)). O
 * PostgREST recusa o pedido INTEIRO quando uma coluna pedida nao tem grant --
 * por isso a regressao a impedir para sempre e simples de descrever: nenhuma
 * consulta de lista pode pedir `motivo`. Le-se so por
 * `rpc_hr_ausencia_ver_motivo`, uma vez por pedido, quando o detalhe abre.
 *
 * Supabase simulado. Nada toca em base nenhuma.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const ORG_ACTIVA = "org-activa";

/** Colunas pedidas por tabela, capturadas de `select(...)`. */
let colunasPedidas: Record<string, string[]> = {};
let rpcChamadas: Array<{ fn: string; args: Record<string, unknown> }> = [];
let rpcResposta: { data: unknown; error: unknown } = { data: null, error: null };

function buildChain(table: string) {
  colunasPedidas[table] = colunasPedidas[table] ?? [];
  const chain: any = {
    select: (colunas: string) => {
      colunasPedidas[table].push(colunas);
      return chain;
    },
    eq: () => chain,
    order: () => chain,
    gte: () => chain,
    lte: () => chain,
    limit: () => chain,
    then: (onFulfilled: any, onRejected: any) =>
      Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected),
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => buildChain(table),
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcChamadas.push({ fn, args });
      return Promise.resolve(rpcResposta);
    },
  },
}));

vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: { id: ORG_ACTIVA, name: "Nike" }, companies: [] }),
}));

vi.mock("@/lib/observability/captureFlowError", () => ({
  captureFlowError: vi.fn(),
}));

import { useAusenciasDaOrganizacao } from "@/hooks/useAusenciasDaOrganizacao";

describe("useAusenciasDaOrganizacao — motivo so por RPC", () => {
  beforeEach(() => {
    colunasPedidas = {};
    rpcChamadas = [];
    rpcResposta = { data: null, error: null };
  });

  it("nunca pede a coluna motivo ao carregar a fila de pedidos", async () => {
    const { result } = renderHook(() => useAusenciasDaOrganizacao());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const pedidas = colunasPedidas.pessoas_ausencias_pedidos ?? [];
    expect(pedidas.length).toBeGreaterThan(0);
    for (const colunas of pedidas) {
      expect(colunas.split(",").map((c) => c.trim())).not.toContain("motivo");
    }
  });

  it("nunca pede select(*) sobre pessoas_ausencias_pedidos", async () => {
    const { result } = renderHook(() => useAusenciasDaOrganizacao());
    await waitFor(() => expect(result.current.loading).toBe(false));

    for (const colunas of colunasPedidas.pessoas_ausencias_pedidos ?? []) {
      expect(colunas.trim()).not.toBe("*");
    }
  });

  it("verMotivo chama rpc_hr_ausencia_ver_motivo com o id do pedido e devolve o texto", async () => {
    rpcResposta = { data: "Consulta medica", error: null };
    const { result } = renderHook(() => useAusenciasDaOrganizacao());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const texto = await result.current.verMotivo("pedido-1");

    expect(texto).toBe("Consulta medica");
    expect(rpcChamadas).toContainEqual({
      fn: "rpc_hr_ausencia_ver_motivo",
      args: { _pedido_id: "pedido-1" },
    });
  });

  it("verMotivo devolve null quando o pedido nao tem motivo escrito", async () => {
    rpcResposta = { data: null, error: null };
    const { result } = renderHook(() => useAusenciasDaOrganizacao());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.verMotivo("pedido-1")).resolves.toBeNull();
  });

  it("verMotivo rejeita quando a base recusa (tipo sensivel sem permissao)", async () => {
    rpcResposta = { data: null, error: { code: "42501", message: "insufficient_privilege" } };
    const { result } = renderHook(() => useAusenciasDaOrganizacao());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.verMotivo("pedido-1")).rejects.toBeTruthy();
  });
});
