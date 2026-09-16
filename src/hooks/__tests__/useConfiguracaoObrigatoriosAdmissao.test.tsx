/**
 * `useConfiguracaoObrigatoriosAdmissao`: a lista de campos vinha SEMPRE vazia
 * porque o hook chamava `hr_admissao_campos_obrigatorios_org` directamente --
 * essa RPC e SO service_role (20261201050000), e `authenticated` leva
 * permission denied em silencio (o erro nunca chegava a toast nenhum, so ao
 * estado de erro do react-query). A correcao (20261201130000) foi um wrapper
 * novo, `rpc_hr_admissao_campos_obrigatorios_org`, com gate proprio. Este
 * teste fecha os dois lados: o hook chama o nome novo, e um erro na RPC fica
 * visivel em `erro` em vez de virar lista vazia silenciosa.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const ORG_ID = "org-nike";

vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: { id: ORG_ID, name: "Nike" } }),
}));

const CAMPOS = [
  { codigo: "nif", origem: "pessoa", condicional: false, obrigatorio: true },
  { codigo: "niss", origem: "pessoa", condicional: false, obrigatorio: false },
];

let rpcNomeChamado: string | null = null;
let rpcResposta: { data: unknown; error: unknown } = { data: CAMPOS, error: null };
let settingsResposta: { data: unknown; error: unknown } = {
  data: { organization_id: ORG_ID, campos_override: { niss: false } },
  error: null,
};
let upsertPayload: unknown = null;

function buildSettingsChain() {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve(settingsResposta),
    upsert: (payload: unknown) => {
      upsertPayload = payload;
      return Promise.resolve({ data: null, error: null });
    },
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => buildSettingsChain(),
    rpc: (nome: string) => {
      rpcNomeChamado = nome;
      return Promise.resolve(rpcResposta);
    },
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "user-1" } } }) },
  },
}));

import { useConfiguracaoObrigatoriosAdmissao } from "@/hooks/useConfiguracaoObrigatoriosAdmissao";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  rpcNomeChamado = null;
  rpcResposta = { data: CAMPOS, error: null };
  settingsResposta = {
    data: { organization_id: ORG_ID, campos_override: { niss: false } },
    error: null,
  };
  upsertPayload = null;
});

describe("useConfiguracaoObrigatoriosAdmissao", () => {
  it("chama o wrapper rpc_hr_admissao_campos_obrigatorios_org, nao a funcao so-service_role", async () => {
    const { result } = renderHook(() => useConfiguracaoObrigatoriosAdmissao(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(rpcNomeChamado).toBe("rpc_hr_admissao_campos_obrigatorios_org");
    expect(rpcNomeChamado).not.toBe("hr_admissao_campos_obrigatorios_org");
  });

  it("devolve a lista de campos populada, nao vazia", async () => {
    const { result } = renderHook(() => useConfiguracaoObrigatoriosAdmissao(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.campos).toEqual(CAMPOS);
    expect(result.current.campos).not.toHaveLength(0);
    expect(result.current.erro).toBeNull();
  });

  it("um erro na RPC (ex.: permission denied) fica visivel em `erro`, nao vira lista vazia silenciosa", async () => {
    rpcResposta = { data: null, error: { message: "permission denied for function" } };

    const { result } = renderHook(() => useConfiguracaoObrigatoriosAdmissao(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.campos).toEqual([]);
    expect(result.current.erro).toContain("permission denied");
  });

  it("definirObrigatorio(codigo, false) grava false explicito no override", async () => {
    const { result } = renderHook(() => useConfiguracaoObrigatoriosAdmissao(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.definirObrigatorio("nif", false);

    expect(upsertPayload).toMatchObject({
      organization_id: ORG_ID,
      campos_override: { niss: false, nif: false },
    });
  });

  it("definirObrigatorio(codigo, true) remove a chave em vez de gravar true", async () => {
    const { result } = renderHook(() => useConfiguracaoObrigatoriosAdmissao(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.definirObrigatorio("niss", true);

    expect(upsertPayload).toMatchObject({ organization_id: ORG_ID, campos_override: {} });
  });
});
