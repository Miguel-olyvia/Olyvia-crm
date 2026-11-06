/**
 * Os pedidos PENDENTES vem de uma consulta propria (filtrada por estado no servidor e paginada), separada do historico
 * limitado a 500 linhas. A fila nunca pode afirmar «nada por decidir» se a leitura dos pendentes falhou ou ficou truncada.
 * Supabase simulado.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const ORG_ACTIVA = "org-activa";

let historico: Array<Record<string, unknown>> = [];
let pendentesNaBase: Array<Record<string, unknown>> = [];
let erroPendentes: unknown = null;
let filtrosEstado: unknown[] = [];

function buildChain(table: string) {
  let usouIn = false;
  let intervalo: [number, number] | null = null;
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    gte: () => chain,
    lte: () => chain,
    limit: () => chain,
    in: (_c: string, valores: unknown) => {
      usouIn = true;
      filtrosEstado.push(valores);
      return chain;
    },
    range: (de: number, ate: number) => {
      intervalo = [de, ate];
      return chain;
    },
    then: (ok: any, ko: any) => {
      let resposta: { data: unknown; error: unknown } = { data: [], error: null };
      if (table === "pessoas_ausencias_pedidos") {
        if (usouIn) {
          resposta = erroPendentes
            ? { data: null, error: erroPendentes }
            : { data: pendentesNaBase.slice(intervalo?.[0] ?? 0, (intervalo?.[1] ?? 99999) + 1), error: null };
        } else {
          resposta = { data: historico, error: null };
        }
      }
      return Promise.resolve(resposta).then(ok, ko);
    },
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => buildChain(t), rpc: () => Promise.resolve({ data: null, error: null }) },
}));
vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: { id: ORG_ACTIVA, name: "Nike" }, companies: [] }),
}));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

import { useAusenciasDaOrganizacao } from "@/hooks/useAusenciasDaOrganizacao";

const pedido = (id: string, estado: string) => ({ id, estado, pessoa_id: "p", data_inicio: "2026-01-01" });

describe("useAusenciasDaOrganizacao — pendentes", () => {
  beforeEach(() => {
    historico = [];
    pendentesNaBase = [];
    erroPendentes = null;
    filtrosEstado = [];
  });

  it("um pendente que NAO esta no historico limitado aparece na mesma (consulta propria, filtrada por estado)", async () => {
    historico = [pedido("recente", "aprovado")];
    pendentesNaBase = [pedido("antigo", "pendente_rh")];
    const { result } = renderHook(() => useAusenciasDaOrganizacao());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.pendentes.map((p) => p.id)).toEqual(["antigo"]);
    expect(filtrosEstado).toEqual([["pendente_chefia", "pendente_rh"]]);
    expect(result.current.erro).toBe(false);
  });

  it("pagina os pendentes ate esgotar (mais de mil)", async () => {
    pendentesNaBase = Array.from({ length: 1001 }, (_, i) => pedido(`x${i}`, "pendente_chefia"));
    const { result } = renderHook(() => useAusenciasDaOrganizacao());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.pendentes).toHaveLength(1001);
    expect(result.current.erro).toBe(false);
  });

  it("se a leitura dos pendentes falha, erro=true e nenhum pendente (a fila nao afirma «nada por decidir»)", async () => {
    historico = [pedido("a", "pendente_rh")];
    erroPendentes = { code: "XX000", message: "falha" };
    const { result } = renderHook(() => useAusenciasDaOrganizacao());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.erro).toBe(true);
    expect(result.current.pendentes).toEqual([]);
  });

  it("uma recusa por permissao nos pendentes diz recusado", async () => {
    erroPendentes = { code: "42501", message: "permission denied" };
    const { result } = renderHook(() => useAusenciasDaOrganizacao());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.recusado).toBe(true);
    expect(result.current.erro).toBe(false);
  });

  it("lista truncada pelo tecto de paginas conta como erro, nunca como completa", async () => {
    pendentesNaBase = Array.from({ length: 20000 }, (_, i) => pedido(`x${i}`, "pendente_rh"));
    const { result } = renderHook(() => useAusenciasDaOrganizacao());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.erro).toBe(true);
  });
});
