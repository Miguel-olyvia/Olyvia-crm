/**
 * `useClausulasDocumentosRH`: cria, edita e (des)activa
 * `pessoas_documentos_clausulas` -- nunca `delete` (a RLS bloqueia-o de
 * qualquer forma, mas este hook nem o expoe). Mesmo padrao de
 * `useModelosDocumentosRH.test.tsx`. Supabase e `resolveCurrentBusinessUserId`
 * simulados. Nada toca em base nenhuma.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const ORG_ID = "org-nike";

vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: { id: ORG_ID, name: "Nike" } }),
}));

vi.mock("@/lib/identity/resolveBusinessUserId", () => ({
  resolveCurrentBusinessUserId: vi.fn(async () => "business-user-1"),
}));

let chamadasEscrita: Array<{ tipo: "insert" | "update"; payload: unknown; eq?: [string, unknown] }> = [];
let respostaClausulas: { data: unknown; error: unknown } = { data: [], error: null };
let erroEscrita: unknown = null;

function buildChain() {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (campo: string, valor: unknown) => {
      const ultima = chamadasEscrita[chamadasEscrita.length - 1];
      if (ultima && !ultima.eq) ultima.eq = [campo, valor];
      return chain;
    },
    order: () => chain,
    insert: (payload: unknown) => {
      chamadasEscrita.push({ tipo: "insert", payload });
      return Promise.resolve({ data: null, error: erroEscrita });
    },
    update: (payload: unknown) => {
      chamadasEscrita.push({ tipo: "update", payload });
      return chain;
    },
    then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
      const ultima = chamadasEscrita[chamadasEscrita.length - 1];
      if (ultima?.tipo === "update") {
        return Promise.resolve({ data: null, error: erroEscrita }).then(onFulfilled, onRejected);
      }
      return Promise.resolve(respostaClausulas).then(onFulfilled, onRejected);
    },
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => buildChain(),
  },
}));

import { useClausulasDocumentosRH } from "@/hooks/useClausulasDocumentosRH";

const CLAUSULA = {
  id: "c1",
  organization_id: ORG_ID,
  nome: "Confidencialidade",
  categoria: "confidencialidade",
  corpo_html: "<p>Texto</p>",
  activo: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  chamadasEscrita = [];
  erroEscrita = null;
  respostaClausulas = { data: [CLAUSULA], error: null };
});

describe("useClausulasDocumentosRH", () => {
  it("carrega as clausulas da organizacao activa, inactivas incluidas", async () => {
    const { result } = renderHook(() => useClausulasDocumentosRH(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.clausulas).toEqual([CLAUSULA]);
  });

  it("criar insere com organization_id e created_by/updated_by do id de negocio", async () => {
    const { result } = renderHook(() => useClausulasDocumentosRH(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.criar({
      nome: "Periodo experimental",
      categoria: "periodo experimental",
      corpo_html: "<p>Texto</p>",
    });

    expect(chamadasEscrita).toHaveLength(1);
    expect(chamadasEscrita[0].tipo).toBe("insert");
    expect(chamadasEscrita[0].payload).toMatchObject({
      organization_id: ORG_ID,
      nome: "Periodo experimental",
      categoria: "periodo experimental",
      corpo_html: "<p>Texto</p>",
      created_by: "business-user-1",
      updated_by: "business-user-1",
    });
  });

  it("editar actualiza pelo id, sem tocar em organization_id", async () => {
    const { result } = renderHook(() => useClausulasDocumentosRH(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.editar({
      id: "c1",
      nome: "Confidencialidade revista",
      categoria: "confidencialidade",
      corpo_html: "<p>Novo</p>",
    });

    expect(chamadasEscrita).toHaveLength(1);
    expect(chamadasEscrita[0].tipo).toBe("update");
    expect(chamadasEscrita[0].payload).toMatchObject({
      nome: "Confidencialidade revista",
      updated_by: "business-user-1",
    });
    expect(chamadasEscrita[0].eq).toEqual(["id", "c1"]);
  });

  it("definirActivo(false) desactiva sem apagar -- nunca chama delete", async () => {
    const { result } = renderHook(() => useClausulasDocumentosRH(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.definirActivo("c1", false);

    expect(chamadasEscrita).toHaveLength(1);
    expect(chamadasEscrita[0].tipo).toBe("update");
    expect(chamadasEscrita[0].payload).toMatchObject({ activo: false });
    expect((result.current as Record<string, unknown>).eliminar).toBeUndefined();
  });

  it("propaga o erro da base em vez de o engolir", async () => {
    erroEscrita = { message: "recusado" };
    const { result } = renderHook(() => useClausulasDocumentosRH(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      result.current.criar({ nome: "X", categoria: null, corpo_html: "<p>Y</p>" }),
    ).rejects.toBeTruthy();
  });
});
