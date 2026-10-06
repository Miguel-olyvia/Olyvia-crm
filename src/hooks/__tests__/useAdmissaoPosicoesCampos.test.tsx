/**
 * `useAdmissaoPosicoesCampos`: o formulario interno de criar pessoa le a
 * configuracao por aqui. `campos = null` significa "nao se sabe", e o hook diz
 * PORQUE (a carregar, sem acesso, ou erro) -- em modo "RH, agora" um erro de
 * leitura nao pode passar por "organizacao sem configuracao".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const ORG_ID = "org-nike";

vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: { id: ORG_ID, name: "Nike" } }),
}));

const captureFlowError = vi.fn();
vi.mock("@/lib/observability/captureFlowError", () => ({
  captureFlowError: (...args: unknown[]) => captureFlowError(...args),
}));

const chamadas: Array<{ nome: string; args: unknown }> = [];
let resposta: { data: unknown; error: unknown } = { data: [], error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (nome: string, args: unknown) => {
      chamadas.push({ nome, args });
      return Promise.resolve(resposta);
    },
  },
}));

import { useAdmissaoPosicoesCampos } from "@/hooks/useAdmissaoPosicoesCampos";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  chamadas.length = 0;
  captureFlowError.mockReset();
  resposta = { data: [], error: null };
});

describe("useAdmissaoPosicoesCampos", () => {
  it("le por rpc_hr_admissao_posicoes_campos com a organizacao activa", async () => {
    renderHook(() => useAdmissaoPosicoesCampos(), { wrapper });
    await waitFor(() => expect(chamadas.length).toBe(1));
    expect(chamadas[0]).toEqual({
      nome: "rpc_hr_admissao_posicoes_campos",
      args: { p_organization_id: ORG_ID },
    });
  });

  it("devolve as posicoes lidas e normaliza o que a base manda", async () => {
    resposta = {
      data: [
        { codigo: "nif", origem: "pessoa", condicional: true, posicao: "ficha", configuravel: true },
        { codigo: "cargo", origem: "rh", condicional: false, posicao: "convite", configuravel: false },
        { codigo: "", origem: "pessoa" },
        { origem: "pessoa" },
      ],
      error: null,
    };
    const { result } = renderHook(() => useAdmissaoPosicoesCampos(), { wrapper });
    await waitFor(() => expect(result.current.carregando).toBe(false));

    expect(result.current.erro).toBe(false);
    expect(result.current.semAcesso).toBe(false);
    expect(result.current.campos?.map((c) => [c.codigo, c.posicao, c.configuravel])).toEqual([
      ["nif", "ficha", true],
      ["cargo", "rh", false],
    ]);
  });

  it("uma configuracao legitimamente vazia e [] e NAO null", async () => {
    resposta = { data: [], error: null };
    const { result } = renderHook(() => useAdmissaoPosicoesCampos(), { wrapper });
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.campos).toEqual([]);
    expect(result.current.erro).toBe(false);
  });

  it("uma falha da base da erro=true, campos=null e regista-se", async () => {
    resposta = { data: null, error: { message: "boom", code: "XX000" } };
    const { result } = renderHook(() => useAdmissaoPosicoesCampos(), { wrapper });
    await waitFor(() => expect(result.current.erro).toBe(true));

    expect(result.current.campos).toBeNull();
    expect(result.current.semAcesso).toBe(false);
    expect(captureFlowError).toHaveBeenCalledTimes(1);
  });

  it("uma resposta que nao e lista tambem e erro, nao 'sem configuracao'", async () => {
    resposta = { data: { nao: "e uma lista" }, error: null };
    const { result } = renderHook(() => useAdmissaoPosicoesCampos(), { wrapper });
    await waitFor(() => expect(result.current.erro).toBe(true));
    expect(result.current.campos).toBeNull();
  });

  it("uma recusa por permissao e semAcesso: nao e erro e nao vai para o Sentry", async () => {
    resposta = { data: null, error: { message: "insufficient_privilege", code: "42501" } };
    const { result } = renderHook(() => useAdmissaoPosicoesCampos(), { wrapper });
    await waitFor(() => expect(result.current.semAcesso).toBe(true));

    expect(result.current.erro).toBe(false);
    expect(result.current.campos).toBeNull();
    expect(captureFlowError).not.toHaveBeenCalled();
  });

  it("desactivado, nem chama a base", async () => {
    const { result } = renderHook(() => useAdmissaoPosicoesCampos(false), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(chamadas).toHaveLength(0);
    expect(result.current.campos).toBeNull();
    expect(result.current.erro).toBe(false);
  });
});
