/**
 * `useCodigosProcessamento`: le o catalogo desta organizacao -- filtrado
 * explicitamente por `organization_id` no proprio hook, porque a RLS de
 * SELECT so confirma a permissao e nao restringe as linhas devolvidas
 * (20261201250000 acabou com a nocao de codigo transversal); cria um codigo
 * novo e (des)activa -- filtrando tambem por organizacao e tratando "zero
 * linhas afectadas" como erro -- nunca `delete` (a RLS bloqueia-o, mas o
 * hook nem o expoe).
 * `hrFrom`/`resolveCurrentBusinessUserId` simulados. Nada toca em base
 * nenhuma.
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

let chamadasEscrita: Array<{
  tipo: "insert" | "update";
  payload: unknown;
  eqs: Array<[string, unknown]>;
  selectApósUpdate?: boolean;
}> = [];
let respostaCodigos: { data: unknown; error: unknown } = { data: [], error: null };
let erroEscrita: unknown = null;
/** Linhas devolvidas pelo `.select("id")` apos o `update` -- vazio simula "zero linhas afectadas". */
let linhasAfectadasUpdate: unknown[] = [{ id: "c-300" }];
/** `.eq(...)` chamados na leitura (select), fora de qualquer insert/update. */
let eqsLeitura: Array<[string, unknown]> = [];

/**
 * Cada chamada a `hrFrom(...)` cria a sua propria cadeia -- por isso o
 * registo de qual chamada de escrita esta em curso (`entradaDesteChain`) e
 * local a esta funcao, e nunca confundido com um `select` de leitura
 * posterior (ex.: o refetch depois de `invalidar()`), que usaria a ultima
 * entrada de `chamadasEscrita` de uma chamada anterior se isto fosse global.
 */
function buildChain() {
  let entradaDesteChain: (typeof chamadasEscrita)[number] | null = null;
  const chain: Record<string, unknown> = {
    select: () => {
      if (entradaDesteChain?.tipo === "update") entradaDesteChain.selectApósUpdate = true;
      return chain;
    },
    order: () => chain,
    eq: (campo: string, valor: unknown) => {
      if (entradaDesteChain) {
        entradaDesteChain.eqs.push([campo, valor]);
      } else {
        eqsLeitura.push([campo, valor]);
      }
      return chain;
    },
    insert: (payload: unknown) => {
      entradaDesteChain = { tipo: "insert", payload, eqs: [] };
      chamadasEscrita.push(entradaDesteChain);
      return Promise.resolve({ data: null, error: erroEscrita });
    },
    update: (payload: unknown) => {
      entradaDesteChain = { tipo: "update", payload, eqs: [] };
      chamadasEscrita.push(entradaDesteChain);
      return chain;
    },
    then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
      if (entradaDesteChain?.tipo === "update") {
        const data = erroEscrita ? null : linhasAfectadasUpdate;
        return Promise.resolve({ data, error: erroEscrita }).then(onFulfilled, onRejected);
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

const CODIGO_A = {
  id: "c-100",
  organization_id: ORG_ID,
  codigo: "100",
  nome: "Horas extraordinarias ao valor normal",
  descricao: null,
  activo: true,
  modo_calculo: "percentagem_hora_normal",
  percentagem: 100,
  valor_fixo: null,
  origem_automatica: "horas_extra",
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
  modo_calculo: "manual",
  percentagem: null,
  valor_fixo: null,
  origem_automatica: null,
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
  linhasAfectadasUpdate = [{ id: "c-300" }];
  eqsLeitura = [];
  respostaCodigos = { data: [CODIGO_A, CODIGO_PROPRIO], error: null };
});

describe("useCodigosProcessamento", () => {
  it("carrega os codigos filtrando explicitamente por organization_id -- a RLS nao restringe as linhas por si", async () => {
    const { result } = renderHook(() => useCodigosProcessamento(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.codigos).toEqual([CODIGO_A, CODIGO_PROPRIO]);
    expect(eqsLeitura).toContainEqual(["organization_id", ORG_ID]);
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

  it("criar sem modo_calculo grava 'manual' e os parametros a null (20261201260000)", async () => {
    const { result } = renderHook(() => useCodigosProcessamento(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.criar({ codigo: "300", nome: "Recibos verdes", descricao: null });

    expect(chamadasEscrita[0].payload).toMatchObject({
      modo_calculo: "manual",
      percentagem: null,
      valor_fixo: null,
      origem_automatica: null,
    });
  });

  it("criar com modo_calculo explicito grava os parametros passados", async () => {
    const { result } = renderHook(() => useCodigosProcessamento(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.criar({
      codigo: "400",
      nome: "Horas nocturnas",
      descricao: null,
      modo_calculo: "percentagem_hora_normal",
      percentagem: 125,
      origem_automatica: "horas_extra_noturnas",
    });

    expect(chamadasEscrita[0].payload).toMatchObject({
      modo_calculo: "percentagem_hora_normal",
      percentagem: 125,
      valor_fixo: null,
      origem_automatica: "horas_extra_noturnas",
    });
  });

  it("definirActivo(false) desactiva pelo id filtrando tambem por organizacao -- nunca chama delete", async () => {
    const { result } = renderHook(() => useCodigosProcessamento(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.definirActivo("c-300", false);

    expect(chamadasEscrita).toHaveLength(1);
    expect(chamadasEscrita[0].tipo).toBe("update");
    expect(chamadasEscrita[0].payload).toMatchObject({ activo: false });
    expect(chamadasEscrita[0].eqs).toEqual([
      ["id", "c-300"],
      ["organization_id", ORG_ID],
    ]);
    expect((result.current as Record<string, unknown>).eliminar).toBeUndefined();
  });

  it("definirActivo trata zero linhas afectadas como erro -- nunca assume sucesso silencioso", async () => {
    linhasAfectadasUpdate = [];
    const { result } = renderHook(() => useCodigosProcessamento(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(result.current.definirActivo("c-de-outra-organizacao", false)).rejects.toThrow(
      /organiza/i,
    );
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
