/**
 * `useConfiguracaoObrigatoriosAdmissao`: le por `rpc_hr_admissao_configuracao_ler`
 * (gate baixo, o formulario interno tambem a usa), grava por
 * `rpc_hr_admissao_definir_posicao` (sem upsert directo na tabela), e tolera
 * linhas antigas com `obrigatorio` booleano. Um erro na leitura fica visivel
 * em `erro` em vez de virar lista vazia silenciosa.
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
  { codigo: "nif", origem: "pessoa", condicional: true, posicao: "convite", configuravel: true },
  { codigo: "niss", origem: "pessoa", condicional: true, posicao: "ficha", configuravel: true },
  { codigo: "cargo", origem: "rh", condicional: false, posicao: "rh", configuravel: false },
];

const chamadas: Array<{ nome: string; args: unknown }> = [];
let leituraResposta: { data: unknown; error: unknown } = { data: CAMPOS, error: null };
let escritaResposta: { data: unknown; error: unknown } = { data: null, error: null };
const fromMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: (nome: string, args: unknown) => {
      chamadas.push({ nome, args });
      return Promise.resolve(
        nome === "rpc_hr_admissao_definir_posicao" ? escritaResposta : leituraResposta,
      );
    },
  },
}));

import { getLocalizedFallback } from "@/utils/friendlyError";
import {
  useConfiguracaoObrigatoriosAdmissao,
  normalizarLinhaConfiguracao,
} from "@/hooks/useConfiguracaoObrigatoriosAdmissao";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  chamadas.length = 0;
  fromMock.mockReset();
  leituraResposta = { data: CAMPOS, error: null };
  escritaResposta = { data: null, error: null };
});

describe("useConfiguracaoObrigatoriosAdmissao", () => {
  it("le por rpc_hr_admissao_configuracao_ler com a organizacao activa", async () => {
    const { result } = renderHook(() => useConfiguracaoObrigatoriosAdmissao(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(chamadas[0]).toEqual({
      nome: "rpc_hr_admissao_configuracao_ler",
      args: { p_organization_id: ORG_ID },
    });
  });

  it("devolve a lista populada, com as posicoes da base", async () => {
    const { result } = renderHook(() => useConfiguracaoObrigatoriosAdmissao(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.campos).toEqual(CAMPOS);
    expect(result.current.erro).toBeNull();
  });

  it("um erro na leitura fica visivel em `erro`, traduzido, nunca com o texto cru da base", async () => {
    leituraResposta = { data: null, error: { message: "relation foo exploded", code: "XX000" } };

    const { result } = renderHook(() => useConfiguracaoObrigatoriosAdmissao(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.campos).toEqual([]);
    expect(result.current.erro).toBe(getLocalizedFallback("friendlyError.unexpectedRetry"));
    expect(result.current.erro).not.toContain("exploded");
    // O erro original fica disponivel para registo, mas nao e o que se mostra.
    expect(result.current.erroOriginal).toMatchObject({ code: "XX000" });
  });

  it("uma recusa por permissao mostra o texto traduzido de 'sem permissao', nao 'permission denied'", async () => {
    leituraResposta = { data: null, error: { message: "permission denied for function x", code: "42501" } };

    const { result } = renderHook(() => useConfiguracaoObrigatoriosAdmissao(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.erro).toBe(getLocalizedFallback("friendlyError.forbidden"));
    expect(result.current.erro).not.toContain("permission denied");
  });

  it("tolera linhas antigas com `obrigatorio` booleano (true = convite, false = opcional)", async () => {
    leituraResposta = {
      data: [
        { codigo: "nif", origem: "pessoa", condicional: false, obrigatorio: true },
        { codigo: "niss", origem: "pessoa", condicional: false, obrigatorio: false },
      ],
      error: null,
    };

    const { result } = renderHook(() => useConfiguracaoObrigatoriosAdmissao(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.campos.map((c) => [c.codigo, c.posicao])).toEqual([
      ["nif", "convite"],
      ["niss", "opcional"],
    ]);
  });

  it("definirPosicao chama rpc_hr_admissao_definir_posicao e nao faz upsert directo", async () => {
    const { result } = renderHook(() => useConfiguracaoObrigatoriosAdmissao(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.definirPosicao("niss", "opcional");

    expect(chamadas).toContainEqual({
      nome: "rpc_hr_admissao_definir_posicao",
      args: { p_organization_id: ORG_ID, p_codigo: "niss", p_posicao: "opcional" },
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("um erro da base ao gravar chega a quem chamou", async () => {
    const { result } = renderHook(() => useConfiguracaoObrigatoriosAdmissao(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    escritaResposta = { data: null, error: { message: "codigo_nao_configuravel" } };

    await expect(result.current.definirPosicao("cargo", "convite")).rejects.toMatchObject({
      message: "codigo_nao_configuravel",
    });
  });
});

describe("useConfiguracaoObrigatoriosAdmissao -- cache", () => {
  function clienteEWrapper() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const comCliente = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return { queryClient, comCliente };
  }

  it("gravar uma posicao invalida tambem a configuracao que o formulario de criar pessoa le", async () => {
    const { queryClient, comCliente } = clienteEWrapper();
    const invalidar = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useConfiguracaoObrigatoriosAdmissao(), { wrapper: comCliente });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await result.current.definirPosicao("niss", "opcional");

    const chaves = invalidar.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(chaves).toContain(JSON.stringify(["hr-admissao-configuracao", ORG_ID]));
    expect(chaves).toContain(JSON.stringify(["organization-admissao-settings", ORG_ID]));
    expect(chaves).toContain(JSON.stringify(["hr-admissao-posicoes-campos", ORG_ID]));
  });

  it("um erro ao gravar nao invalida nada (a cache continua a dizer a verdade)", async () => {
    const { queryClient, comCliente } = clienteEWrapper();
    const { result } = renderHook(() => useConfiguracaoObrigatoriosAdmissao(), { wrapper: comCliente });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const invalidar = vi.spyOn(queryClient, "invalidateQueries");
    escritaResposta = { data: null, error: { message: "posicao_invalida" } };

    await expect(result.current.definirPosicao("niss", "convite")).rejects.toBeTruthy();
    expect(invalidar).not.toHaveBeenCalled();
  });
});

describe("normalizarLinhaConfiguracao", () => {
  it("origem rh fica sempre na posicao rh e nao configuravel", () => {
    expect(
      normalizarLinhaConfiguracao({ codigo: "cargo", origem: "rh", posicao: "convite" }),
    ).toMatchObject({ posicao: "rh", configuravel: false });
  });

  it("uma posicao desconhecida cai para convite", () => {
    expect(
      normalizarLinhaConfiguracao({ codigo: "nif", origem: "pessoa", posicao: "xpto" }).posicao,
    ).toBe("convite");
  });
});
