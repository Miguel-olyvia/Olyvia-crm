// Utilitários partilhados dos testes de useListaPessoas (sem testes). Os vi.mock ficam em cada ficheiro de teste.
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";
import type { ReactNode } from "react";
import { useListaPessoas } from "./useListaPessoas";
import { FontePessoasContext, type FontePessoas } from "./useFontePessoas";
import type { FiltrosLista, LinhaResumoDb } from "./listaPessoasTipos";

export const rpcMock = vi.fn();
export const captureMock = vi.fn();

export const real = (organizationId: string): FontePessoas => ({ modo: "real", organizationId, momentoGanho: null });
let fonte: FontePessoas = real("org-1");
export const definirFonte = (nova: FontePessoas): void => { fonte = nova; };

export const FILTROS: FiltrosLista = { papel: null, etapa: null, pesquisa: "", ordem: "recentes" };


export function linha(id: string, sobre: Partial<LinhaResumoDb> = {}): LinhaResumoDb {
  return {
    entity_id: id, nome: `Pessoa ${id}`, papel: "lead", lead_id: null, client_id: null, assigned_to: null,
    lead_status: null, closure_result: null, etapa: "nova", negocios_abertos: 0, negocios_ganhos: 0,
    negocios_perdidos: 0, fase_mais_avancada: null, pronto_a_ganhar: false, valor_em_jogo: null,
    ultimo_contacto_em: null, proxima_visita_em: null, ultima_visita_feita_em: null, ultimo_negocio_em: null,
    por_ligar_contactos: 0, por_ligar_visitas: 0, por_ligar_levantamentos: 0,
    chave_ordem: `chave-${id}`, ha_mais: false, ...sobre,
  };
}

export const ok = (linhas: LinhaResumoDb[] | null) => Promise.resolve({ data: linhas, error: null });
export const falha = (code: string) => Promise.resolve({ data: null, error: { code, message: "x" } });

export function montar(filtros: FiltrosLista = FILTROS) {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <FontePessoasContext.Provider value={fonte}>{children}</FontePessoasContext.Provider>
    </QueryClientProvider>
  );
  return { client, ...renderHook((f: FiltrosLista) => useListaPessoas(f), { wrapper, initialProps: filtros }) };
}

// Deixa correr as promessas pendentes, sem relógio real.
export const esvaziar = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });

export const params = (n: number) => rpcMock.mock.calls[n][1] as Record<string, unknown>;
