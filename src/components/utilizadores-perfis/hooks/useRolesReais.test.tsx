import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

type Resposta = { data: unknown; error: unknown };
const respostas: Record<string, Resposta> = {};
const pedidos: { tabela: string; filtros: unknown[][] }[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const construtor = (tabela: string) => {
    const registo = { tabela, filtros: [] as unknown[][] };
    pedidos.push(registo);
    const resposta = () => Promise.resolve(respostas[tabela] ?? { data: [], error: null });
    const b: Record<string, unknown> = {};
    ["select", "eq", "order", "is", "not", "in", "limit"].forEach((m) => {
      b[m] = (...args: unknown[]) => { registo.filtros.push([m, ...args]); return b; };
    });
    b.maybeSingle = resposta;
    b.then = (ok: (v: Resposta) => unknown, ko: (e: unknown) => unknown) => resposta().then(ok, ko);
    return b;
  };
  return { supabase: { from: (t: string) => construtor(t) } };
});

let empresa: { activeCompany: { id: string } | null; isLoading: boolean } = { activeCompany: { id: "org-a" }, isLoading: false };
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => empresa }));
vi.mock("@/hooks/usePermissionScope", () => ({ usePermissionScope: () => ({ anewRoleCode: "org_admin" }) }));

import { useRolesReais } from "./useRolesReais";
import { lerContagemPorRole } from "./useContagemUtilizadoresPorRole";

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

const linha = (id: string, code: string, org: string | null, extra: Record<string, unknown> = {}) => ({
  id, code, name: code.toUpperCase(), description: null, organization_id: org, is_system: org === null, can_sign_contracts: false, created_by: null, deleted_at: null, ...extra,
});

beforeEach(() => {
  Object.keys(respostas).forEach((k) => delete respostas[k]);
  pedidos.length = 0;
  empresa = { activeCompany: { id: "org-a" }, isLoading: false };
});

describe("useRolesReais", () => {
  it("lê as roles da organização e das ascendentes com as permissões de cada uma, e esconde as de outras", async () => {
    respostas.anew_hierarchy = { data: { parent_org_id: null }, error: null };
    respostas.anew_roles = { data: [linha("1", "comercial", "org-a"), linha("2", "alheia", "org-b"), linha("3", "org_viewer", null)], error: null };
    respostas.anew_role_permissions = { data: [{ role_id: "1", permission_code: "leads.view" }], error: null };
    const { result } = renderHook(() => useRolesReais(false), { wrapper });
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.erro).toBeNull();
    expect(result.current.roles.map((r) => r.codigo)).toEqual(["comercial", "org_viewer"]);
    expect(result.current.roles[0].permissoes).toEqual(["leads.view"]);
    expect(result.current.roles[1].sistema).toBe(true);
  });

  it("pede só as não eliminadas, ou só as eliminadas", async () => {
    respostas.anew_hierarchy = { data: null, error: null };
    const a = renderHook(() => useRolesReais(false), { wrapper });
    await waitFor(() => expect(a.result.current.carregando).toBe(false));
    expect(pedidos.filter((p) => p.tabela === "anew_roles").flatMap((p) => p.filtros)).toContainEqual(["is", "deleted_at", null]);
    pedidos.length = 0;
    const b = renderHook(() => useRolesReais(true), { wrapper });
    await waitFor(() => expect(b.result.current.carregando).toBe(false));
    expect(pedidos.filter((p) => p.tabela === "anew_roles").flatMap((p) => p.filtros)).toContainEqual(["not", "deleted_at", "is", null]);
  });

  it("uma falha ao ler as roles sobe como erro, sem lista vazia a fingir", async () => {
    respostas.anew_hierarchy = { data: null, error: null };
    respostas.anew_roles = { data: null, error: { message: "permission denied for table anew_roles" } };
    const { result } = renderHook(() => useRolesReais(false), { wrapper });
    await waitFor(() => expect(result.current.erro).toContain("permission denied"));
    expect(result.current.roles).toEqual([]);
  });

  it("uma falha na hierarquia também sobe (não se ignora)", async () => {
    respostas.anew_hierarchy = { data: null, error: { message: "falha na hierarquia" } };
    const { result } = renderHook(() => useRolesReais(false), { wrapper });
    await waitFor(() => expect(result.current.erro).toContain("falha na hierarquia"));
  });

  it("uma falha ao ler as permissões das roles sobe como erro", async () => {
    respostas.anew_hierarchy = { data: null, error: null };
    respostas.anew_roles = { data: [linha("1", "comercial", "org-a")], error: null };
    respostas.anew_role_permissions = { data: null, error: { message: "falha nas permissões" } };
    const { result } = renderHook(() => useRolesReais(false), { wrapper });
    await waitFor(() => expect(result.current.erro).toContain("falha nas permissões"));
  });

  it("sem organização ativa não lê nada e diz que não há organização", async () => {
    empresa = { activeCompany: null, isLoading: false };
    const { result } = renderHook(() => useRolesReais(false), { wrapper });
    expect(result.current.semOrganizacao).toBe(true);
    expect(result.current.carregando).toBe(false);
    expect(pedidos).toHaveLength(0);
  });

  it("desligado não lê nada", () => {
    const { result } = renderHook(() => useRolesReais(true, false), { wrapper });
    expect(result.current.carregando).toBe(false);
    expect(pedidos).toHaveLength(0);
  });
});

describe("lerContagemPorRole", () => {
  it("conta utilizadores distintos por role, só vínculos ativos, e põe zero nas outras", async () => {
    respostas.anew_memberships = { data: [{ role_id: "a", user_id: "u1" }, { role_id: "a", user_id: "u1" }, { role_id: "a", user_id: "u2" }], error: null };
    await expect(lerContagemPorRole(["a", "b"])).resolves.toEqual({ a: 2, b: 0 });
    expect(pedidos[0].filtros).toContainEqual(["eq", "status", "active"]);
  });

  it("propaga o erro de leitura em vez de devolver zeros", async () => {
    respostas.anew_memberships = { data: null, error: { message: "sem acesso" } };
    await expect(lerContagemPorRole(["a"])).rejects.toMatchObject({ message: "sem acesso" });
  });
});
