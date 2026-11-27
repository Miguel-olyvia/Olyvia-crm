// A lista «por devolver» (`rpc_ativos_por_devolver`). Cliente tolerante: RPC por aplicar = «indisponivel», sem permissão (42501) = «recusado»
// (nunca um defeito), um defeito = «erro» (e só esse vai para o registo de erros). Os nomes dos argumentos estão fixados aqui.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const m = vi.hoisted(() => ({ rpc: vi.fn(), captura: vi.fn() }));
vi.mock("@/lib/hr/hrDb", () => ({ hrRpc: (...a: unknown[]) => m.rpc(...a) }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...a: unknown[]) => m.captura(...a) }));
vi.mock("@/utils/friendlyError", () => ({ getLocalizedFallback: (k: string) => `T:${k}` }));

import { useAtivosPorDevolver } from "./useAtivosPorDevolver";

const cliente = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const envolver = ({ children }: { children: ReactNode }) => <QueryClientProvider client={cliente()}>{children}</QueryClientProvider>;

const RESPOSTA = {
  hoje: "2026-11-27", dias: 30, detalhe: true, total_pessoas: 1, total_itens: 1,
  pessoas: [{ pessoa_id: "p1", nome: "Ana", saida_prevista: "2026-12-09", origem: "fim_contrato", dias_restantes: 12, vinculo_id: "v1", chefia_pessoa_id: null, n_itens: 1,
    itens: [{ origem: "ativo", item_id: "i1", ref_id: "a1", codigo: "NIKE-IT-LAP-26-0001", nome: "Portátil", desde: "2026-06-01" }] }],
};

beforeEach(() => { m.rpc.mockReset(); m.captura.mockReset(); });

describe("useAtivosPorDevolver", () => {
  it("chama a RPC com a organização, a pessoa (nula por omissão) e os dias, e lê a resposta", async () => {
    m.rpc.mockResolvedValue({ data: RESPOSTA, error: null });
    const { result } = renderHook(() => useAtivosPorDevolver({ organizationId: "org-1", dias: 30 }), { wrapper: envolver });
    expect(result.current.estado).toBe("a_carregar");
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    expect(m.rpc).toHaveBeenCalledWith("rpc_ativos_por_devolver", { p_organization_id: "org-1", p_pessoa_id: null, p_dias: 30 });
    expect(result.current.dados?.totalPessoas).toBe(1);
    expect(result.current.dados?.pessoas[0].itens[0].codigo).toBe("NIKE-IT-LAP-26-0001");
    expect(result.current.mensagem).toBeNull();
  });

  it("com uma pessoa pede só essa pessoa", async () => {
    m.rpc.mockResolvedValue({ data: RESPOSTA, error: null });
    const { result } = renderHook(() => useAtivosPorDevolver({ organizationId: "org-1", pessoaId: "p1", dias: 30 }), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    expect(m.rpc).toHaveBeenCalledWith("rpc_ativos_por_devolver", { p_organization_id: "org-1", p_pessoa_id: "p1", p_dias: 30 });
  });

  it("só contagens (detalhe false) é um estado «ok» normal, sem pessoas", async () => {
    m.rpc.mockResolvedValue({ data: { hoje: "2026-11-27", dias: 30, detalhe: false, total_pessoas: 2, total_itens: 3, pessoas: [] }, error: null });
    const { result } = renderHook(() => useAtivosPorDevolver({ organizationId: "org-1", dias: 30 }), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    expect(result.current.dados).toMatchObject({ detalhe: false, totalPessoas: 2, totalItens: 3, pessoas: [] });
  });

  it("42501 é «recusado»: nada de erro, nada no registo de defeitos", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "insufficient_privilege" } });
    const { result } = renderHook(() => useAtivosPorDevolver({ organizationId: "org-1", dias: 30 }), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("recusado"));
    expect(result.current.dados).toBeNull();
    expect(m.captura).not.toHaveBeenCalled();
  });

  it("a RPC por aplicar (PGRST202) é «indisponivel», sem registo de defeito", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    const { result } = renderHook(() => useAtivosPorDevolver({ organizationId: "org-1", dias: 30 }), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("indisponivel"));
    expect(m.captura).not.toHaveBeenCalled();
  });

  it("um defeito é «erro», com texto traduzido, e vai para o registo", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
    const { result } = renderHook(() => useAtivosPorDevolver({ organizationId: "org-1", dias: 30 }), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("erro"));
    expect(result.current.mensagem).toBe("T:ativos.saidas.erroLer");
    expect(m.captura).toHaveBeenCalledWith(expect.anything(), "ativos-listar");
  });

  it("sem permissão para ver (enabled falso) ou sem organização não pede nada", async () => {
    const { result } = renderHook(() => useAtivosPorDevolver({ organizationId: "org-1", dias: 30, enabled: false }), { wrapper: envolver });
    renderHook(() => useAtivosPorDevolver({ organizationId: null, dias: 30 }), { wrapper: envolver });
    expect(m.rpc).not.toHaveBeenCalled();
    expect(result.current.dados).toBeNull();
  });
});
