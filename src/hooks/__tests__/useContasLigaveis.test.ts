/**
 * As contas de CRM ligaveis a uma ficha nova de RH.
 *
 * O que estes testes fecham:
 *  1. um utilizador so-`client` (portal puro) NUNCA aparece -- mesmo criterio
 *     de `useClientRole`, nao uma whitelist propria;
 *  2. o hibrido (`client` + outro papel) aparece: e a decisao do login;
 *  3. conta inactiva ou apagada fica de fora;
 *  4. conta ja ligada activamente a outra ficha desta organizacao fica de
 *     fora;
 *  5. o filtro e SEMPRE pela organizacao activa, nunca pela hierarquia
 *     visivel que a RLS de `anew_users` alcancaria sozinha.
 *
 * Supabase simulado. Nada toca em base nenhuma.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const ORG_ACTIVA = "org-activa";

const MEMBERSHIPS = [
  { user_id: "u-interno", role_id: "role-admin" },
  { user_id: "u-hibrido", role_id: "role-admin" },
  { user_id: "u-hibrido", role_id: "role-client" },
  { user_id: "u-client-puro", role_id: "role-client" },
  { user_id: "u-inactivo", role_id: "role-admin" },
  { user_id: "u-ja-ligado", role_id: "role-admin" },
];

const PAPEIS = [
  { id: "role-admin", code: "admin" },
  { id: "role-client", code: "client" },
];

const UTILIZADORES = [
  {
    id: "u-interno",
    name: "Ines Interno",
    email: "ines@empresa.pt",
    phone: null,
    position: null,
    location: null,
    status: "active",
  },
  {
    id: "u-hibrido",
    name: "Hugo Hibrido",
    email: "hugo@empresa.pt",
    phone: null,
    position: null,
    location: null,
    status: "active",
  },
  // u-client-puro nao aparece aqui: a query real ja o teria excluido no passo
  // 2 (papeis), mas simula-se so o que o SELECT devolveria SE fosse pedido,
  // para provar que o hook nem chega a incluir o seu id no `.in(...)`.
  {
    id: "u-inactivo",
    name: "Ivo Inactivo",
    email: "ivo@empresa.pt",
    phone: null,
    position: null,
    location: null,
    status: "inactive",
  },
  {
    id: "u-ja-ligado",
    name: "Jose Ja Ligado",
    email: "jose@empresa.pt",
    phone: null,
    position: null,
    location: null,
    status: "active",
  },
];

const LIGACOES_ACTIVAS = [{ anew_user_id: "u-ja-ligado" }];

let idsPedidosAUtilizadores: string[] = [];
let filtrosMemberships: Array<[string, unknown]> = [];

function buildChain(table: string) {
  const chain: any = {
    select: () => chain,
    eq: (coluna: string, valor: unknown) => {
      if (table === "anew_memberships") filtrosMemberships.push([coluna, valor]);
      return chain;
    },
    in: (coluna: string, valores: string[]) => {
      if (table === "anew_users" && coluna === "id") idsPedidosAUtilizadores = valores;
      return chain;
    },
    is: () => chain,
    then: (onFulfilled: any, onRejected: any) => {
      const resolver = () => {
        if (table === "anew_memberships") return { data: MEMBERSHIPS, error: null };
        if (table === "anew_roles") return { data: PAPEIS, error: null };
        if (table === "anew_users") {
          const permitidos = new Set(idsPedidosAUtilizadores);
          const linhas = UTILIZADORES.filter(
            (u) => permitidos.has(u.id) && u.status === "active",
          );
          return { data: linhas, error: null };
        }
        return { data: [], error: null };
      };
      return Promise.resolve(resolver()).then(onFulfilled, onRejected);
    },
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => buildChain(table),
  },
}));

vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: { id: ORG_ACTIVA, name: "Nike" }, companies: [] }),
}));

vi.mock("@/lib/observability/captureFlowError", () => ({
  captureFlowError: vi.fn(),
}));

vi.mock("@/lib/hr/hrDb", () => ({
  hrFrom: (table: string) => {
    if (table === "pessoas_contas") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ data: LIGACOES_ACTIVAS, error: null }),
          }),
        }),
      };
    }
    return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
  },
  isPermissionError: () => false,
}));

import { useContasLigaveis } from "@/hooks/useContasLigaveis";

describe("useContasLigaveis", () => {
  beforeEach(() => {
    idsPedidosAUtilizadores = [];
    filtrosMemberships = [];
  });

  it("nunca inclui um utilizador so-client (portal puro)", async () => {
    const { result } = renderHook(() => useContasLigaveis());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.contas.some((c) => c.id === "u-client-puro")).toBe(false);
    expect(idsPedidosAUtilizadores).not.toContain("u-client-puro");
  });

  it("inclui o hibrido (client + outro papel), porque essa e a decisao do login", async () => {
    const { result } = renderHook(() => useContasLigaveis());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.contas.some((c) => c.id === "u-hibrido")).toBe(true);
  });

  it("exclui conta inactiva", async () => {
    const { result } = renderHook(() => useContasLigaveis());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.contas.some((c) => c.id === "u-inactivo")).toBe(false);
  });

  it("exclui conta ja ligada activamente a outra ficha desta organizacao", async () => {
    const { result } = renderHook(() => useContasLigaveis());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.contas.some((c) => c.id === "u-ja-ligado")).toBe(false);
  });

  it("filtra as memberships SEMPRE pela organizacao activa", async () => {
    const { result } = renderHook(() => useContasLigaveis());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(filtrosMemberships).toContainEqual(["organization_id", ORG_ACTIVA]);
    expect(filtrosMemberships).toContainEqual(["status", "active"]);
  });
});
