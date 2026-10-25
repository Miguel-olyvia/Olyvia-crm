// As leituras do diálogo de criar o contrato no guia: a proposta aceite (lida por id e só na organização, com o nome do cliente) e as minutas ativas.
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const h = vi.hoisted(() => ({
  linhas: {} as Record<string, { data: unknown; error: unknown }>,
  filtros: [] as Array<{ tabela: string; coluna: string; valor: unknown }>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabela: string) => {
      const c: Record<string, unknown> = {};
      c.select = () => c;
      c.order = () => c;
      c.eq = (coluna: string, valor: unknown) => { h.filtros.push({ tabela, coluna, valor }); return c; };
      c.maybeSingle = () => Promise.resolve(h.linhas[tabela] ?? { data: null, error: null });
      c.then = (ok: (v: unknown) => unknown) => Promise.resolve(h.linhas[tabela] ?? { data: [], error: null }).then(ok);
      return c;
    },
  },
}));

import { useMinutasAtivas, usePropostaParaContrato } from "./useDadosDoContrato";

const envolver = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

describe("usePropostaParaContrato", () => {
  it("lê a proposta por id e na organização, com o nome do cliente e os totais dos orçamentos", async () => {
    h.filtros.length = 0;
    h.linhas = {
      proposals: { data: { id: "p1", title: "WC", entity_id: "e1", quotes: [{ total: 10 }] }, error: null },
      anew_entities: { data: { display_name: "Pedro" }, error: null },
    };
    const { result } = renderHook(() => usePropostaParaContrato("p1", "org-1"), { wrapper: envolver });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ id: "p1", title: "WC", _clientName: "Pedro", quotes: [{ total: 10 }] });
    expect(h.filtros).toEqual(expect.arrayContaining([
      { tabela: "proposals", coluna: "id", valor: "p1" }, { tabela: "proposals", coluna: "organization_id", valor: "org-1" },
    ]));
  });

  it("sem entidade não lê o cliente, e uma proposta que já não existe dá null", async () => {
    h.linhas = { proposals: { data: { id: "p1", title: null, entity_id: null, quotes: null }, error: null } };
    const sem = renderHook(() => usePropostaParaContrato("p1", "org-1"), { wrapper: envolver });
    await waitFor(() => expect(sem.result.current.isSuccess).toBe(true));
    expect(sem.result.current.data).toEqual({ id: "p1", title: null, _clientName: null, quotes: [] });
    h.linhas = { proposals: { data: null, error: null } };
    const nula = renderHook(() => usePropostaParaContrato("p2", "org-1"), { wrapper: envolver });
    await waitFor(() => expect(nula.result.current.isSuccess).toBe(true));
    expect(nula.result.current.data).toBeNull();
  });

  it("um erro da base chega como erro da consulta", async () => {
    h.linhas = { proposals: { data: null, error: { message: "RLS" } } };
    const { result } = renderHook(() => usePropostaParaContrato("p1", "org-1"), { wrapper: envolver });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("usePropostaParaContrato: a leitura do nome do cliente", () => {
  it("se a leitura da entidade falha, o erro chega como erro da consulta (não um cliente em branco)", async () => {
    h.linhas = {
      proposals: { data: { id: "p1", title: "WC", entity_id: "e1", quotes: [] }, error: null },
      anew_entities: { data: null, error: { message: "timeout" } },
    };
    const { result } = renderHook(() => usePropostaParaContrato("p1", "org-1"), { wrapper: envolver });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});

describe("useMinutasAtivas", () => {
  it("lê só as minutas ativas da organização", async () => {
    h.filtros.length = 0;
    h.linhas = { client_contract_templates: { data: [{ id: "t1", name: "Minuta", body_html: "x" }], error: null } };
    const { result } = renderHook(() => useMinutasAtivas("org-1"), { wrapper: envolver });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: "t1", name: "Minuta", body_html: "x" }]);
    expect(h.filtros).toEqual(expect.arrayContaining([
      { tabela: "client_contract_templates", coluna: "organization_id", valor: "org-1" }, { tabela: "client_contract_templates", coluna: "is_active", valor: true },
    ]));
  });

  it("um erro da base chega como erro da consulta, não como lista vazia", async () => {
    h.linhas = { client_contract_templates: { data: null, error: { message: "RLS" } } };
    const { result } = renderHook(() => useMinutasAtivas("org-1"), { wrapper: envolver });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
