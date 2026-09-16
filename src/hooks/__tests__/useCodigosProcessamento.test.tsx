/**
 * `useCodigosProcessamento`: le o catalogo (transversais + proprios,
 * decidido pela RLS -- este hook nao filtra nada por si), cria um codigo
 * PROPRIO e (des)activa -- nunca `delete` (a RLS bloqueia-o, mas o hook nem
 * o expoe). `hrFrom`/`resolveCurrentBusinessUserId` simulados. Nada toca em
 * base nenhuma.
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
let respostaCodigos: { data: unknown; error: unknown } = { data: [], error: null };
let erroEscrita: unknown = null;

function buildChain() {
  const chain: Record<string, unknown> = {
    select: () => chain,
    order: () => chain,
    eq: (campo: string, valor: unknown) => {
      const ultima = chamadasEscrita[chamadasEscrita.length - 1];
      if (ultima && !ultima.eq) ultima.eq = [campo, valor];
      return chain;
    },
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
      return Promise.resolve(respostaCodigos).then(onFulfilled, onRejected);
    },
  };
  return chain;
}

vi.mock("@/lib/hr/hrDb", () => ({
  hrFrom: () => buildChain(),
  isPermissionError: (erro: unknown) =>
    !!erro && typeof erro === "object" && (erro as { code?: string }).code === "42501",
}));

import { useCodigosProcessamento } from "@/hooks/useCodigosProcessamento";

const CODIGO_TRANSVERSAL = {
  id: "c-100",
  organization_id: null,
  codigo: "100",
  nome: "Horas extraordinarias ao valor normal",
  descricao: null,
  activo: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const CODIGO_PROPRIO = {
  id: "c-300",
  organization_id: ORG_ID,
  codigo: "300",
  nome: "Recibos verdes",
  descricao: null,
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
  respostaCodigos = { data: [CODIGO_TRANSVERSAL, CODIGO_PROPRIO], error: null };
});

describe("useCodigosProcessamento", () => {
  it("carrega os codigos que a RLS devolver, transversais e proprios juntos", async () => {
    const { result } = renderHook(() => useCodigosProcessamento(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.codigos).toEqual([CODIGO_TRANSVERSAL, CODIGO_PROPRIO]);
  });

  it("um erro de permissao na leitura devolve lista vazia, sem lancar", async () => {
    respostaCodigos = { data: null, error: { code: "42501", message: "insufficient_privilege" } };
    const { result } = renderHook(() => useCodigosProcessamento(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.codigos).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("criar insere com organization_id da organizacao activa (nunca NULL)", async () => {
    const { result } = renderHook(() => useCodigosProcessamento(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.criar({ codigo: "300", nome: "Recibos verdes", descricao: null });

    expect(chamadasEscrita).toHaveLength(1);
    expect(chamadasEscrita[0].tipo).toBe("insert");
    expect(chamadasEscrita[0].payload).toMatchObject({
      organization_id: ORG_ID,
      codigo: "300",
      nome: "Recibos verdes",
      created_by: "business-user-1",
      updated_by: "business-user-1",
    });
  });

  it("definirActivo(false) desactiva pelo id -- nunca chama delete", async () => {
    const { result } = renderHook(() => useCodigosProcessamento(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.definirActivo("c-300", false);

    expect(chamadasEscrita).toHaveLength(1);
    expect(chamadasEscrita[0].tipo).toBe("update");
    expect(chamadasEscrita[0].payload).toMatchObject({ activo: false });
    expect(chamadasEscrita[0].eq).toEqual(["id", "c-300"]);
    expect((result.current as Record<string, unknown>).eliminar).toBeUndefined();
  });

  it("propaga o erro da base ao criar, em vez de o engolir", async () => {
    erroEscrita = { message: "recusado" };
    const { result } = renderHook(() => useCodigosProcessamento(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      result.current.criar({ codigo: "300", nome: "X", descricao: null }),
    ).rejects.toBeTruthy();
  });
});
