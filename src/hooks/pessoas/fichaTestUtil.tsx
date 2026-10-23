// Só para testes: monta hooks da ficha real com um QueryClient novo, a fonte da ficha e o rpc simulado.
// Os vi.mock do Supabase ficam em cada ficheiro de teste (apontam para o `rpcMock` daqui).
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";
import type { ReactNode } from "react";
import { FontePessoasContext, type FontePessoas } from "./useFontePessoas";

export const rpcMock = vi.fn();
export const captureMock = vi.fn();

export const ORG = "org-1";
export const fonteReal = (organizationId: string = ORG): FontePessoas => ({ modo: "real", organizationId, momentoGanho: null });

export const respostaOk = (data: unknown) => Promise.resolve({ data, error: null });
export const respostaErro = (code: string) => Promise.resolve({ data: null, error: { code, message: "x" } });

export function criarCliente(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retryDelay: 0 }, mutations: { retry: false } } });
}

/** Monta um hook dentro do QueryClient e da fonte indicada. */
export function montarHook<P, R>(usar: (props: P) => R, props: P, opcoes: { fonte?: FontePessoas; client?: QueryClient } = {}) {
  const client = opcoes.client ?? criarCliente();
  const fonte = opcoes.fonte ?? fonteReal();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <FontePessoasContext.Provider value={fonte}>{children}</FontePessoasContext.Provider>
    </QueryClientProvider>
  );
  return { client, ...renderHook((p: P) => usar(p), { wrapper, initialProps: props }) };
}

export const parametros = (n: number): Record<string, unknown> => rpcMock.mock.calls[n][1] as Record<string, unknown>;
export const nomeChamado = (n: number): string => rpcMock.mock.calls[n][0] as string;
