// 17/11: os ofícios (perfis) leem-se de cat_ler_catalogo_servicos (o mesmo `perfis`, sem os 29 785 produtos); sem a função na base, de cat_ler_catalogo.
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-1" } }) }));
vi.mock("@/lib/hr/hrDb", () => ({
  hrFrom: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }),
  hrRpc: (...a: unknown[]) => rpc(...a),
}));

import { useOficiosObra } from "./useOficiosObra";

const quadro = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
const PERFIS = { perfis: [{ id: "p1", nome: "Canalizador", ativo: true }, { id: "p0", nome: "Azulejador", ativo: true }] };

describe("useOficiosObra: os perfis vêm da leitura leve do Catálogo", () => {
  beforeEach(() => { rpc.mockReset(); });
  it("lê cat_ler_catalogo_servicos e não cat_ler_catalogo", async () => {
    rpc.mockResolvedValue({ data: PERFIS, error: null });
    const { result } = renderHook(() => useOficiosObra(), { wrapper: quadro });
    await waitFor(() => expect(result.current.oficios).toHaveLength(2));
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["cat_ler_catalogo_servicos"]);
    expect(result.current.oficios.map((o) => o.nome)).toEqual(["Azulejador", "Canalizador"]);
  });
  it("sem a função na base (PGRST202), volta a cat_ler_catalogo", async () => {
    rpc.mockImplementation(async (fn: string) => (fn === "cat_ler_catalogo_servicos" ? { data: null, error: { code: "PGRST202", message: "Could not find the function public.cat_ler_catalogo_servicos(p_org) in the schema cache" } } : { data: PERFIS, error: null }));
    const { result } = renderHook(() => useOficiosObra(), { wrapper: quadro });
    await waitFor(() => expect(result.current.oficios).toHaveLength(2));
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["cat_ler_catalogo_servicos", "cat_ler_catalogo"]);
  });
  it("outro erro (permissão): sem acesso, sem voltar à leitura pesada", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "CT001", message: "sem permissão" } });
    const { result } = renderHook(() => useOficiosObra(), { wrapper: quadro });
    await waitFor(() => expect(result.current.semAcesso).toBe(true));
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["cat_ler_catalogo_servicos"]);
  });
  it("um erro de DENTRO da função leve (outra função em falta) não cai na leitura pesada", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42883", message: "function public.fn_outra(uuid) does not exist" } });
    const { result } = renderHook(() => useOficiosObra(), { wrapper: quadro });
    await waitFor(() => expect(result.current.semAcesso).toBe(true));
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["cat_ler_catalogo_servicos"]);
  });
});
