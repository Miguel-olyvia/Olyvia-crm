/**
 * `useRegrasSalariais` e `usePessoaDireitosSalariais`: ler, historico, vigencia no dia, guardar, e a base ainda sem as RPCs
 * (estado "indisponivel", sem erro). Supabase simulado.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const estado = vi.hoisted(() => ({
  rpcs: [] as Array<{ fn: string; args: Record<string, unknown> | undefined }>,
  respostas: {} as Record<string, { data: unknown; error: unknown }>,
}));

vi.mock("@/lib/hr/hrDb", async () => {
  const actual = await vi.importActual<typeof import("@/lib/hr/hrDb")>("@/lib/hr/hrDb");
  return {
    ...actual,
    hrRpc: (fn: string, args?: Record<string, unknown>) => {
      estado.rpcs.push({ fn, args });
      return Promise.resolve(estado.respostas[fn] ?? { data: null, error: null });
    },
  };
});
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-1" } }) }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/lib/hr/periodoFolha", async () => {
  const actual = await vi.importActual<typeof import("@/lib/hr/periodoFolha")>("@/lib/hr/periodoFolha");
  return { ...actual, hojeEmLisboa: () => "2027-02-10" };
});

import { regraEmVigorNoDia, regraMaisRecente, useRegrasSalariais } from "@/hooks/useRegrasSalariais";
import { usePessoaDireitosSalariais } from "@/hooks/usePessoaDireitosSalariais";
import type { RegraSalarial } from "@/types/hr";

const versao = (id: string, de: string, ate: string | null): RegraSalarial => ({
  id,
  valido_de: de,
  valido_ate: ate,
  subsidio_limite_min: 300,
  subsidio_valor_hora: 0.76,
  subsidio_valor_dia: 6.15,
  he_pct_dia_util: 50,
  he_pct_feriado: 75,
  he_pct_descanso: 100,
  he_limite_anual_min: 6000,
  iht_pct: 25,
  km_valor: 0.4,
  ajudas_custo_dia: 65.89,
  criada_em: "x",
  criada_por_nome: null,
  substituida_em: null,
  noturnas: [],
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

beforeEach(() => {
  estado.rpcs = [];
  estado.respostas = {};
});

describe("regraEmVigorNoDia", () => {
  const v = [versao("b", "2027-03-01", null), versao("a", "2026-01-01", "2027-02-28")];
  it("escolhe a versao de cada lado da mudanca (inclusivo no ultimo dia)", () => {
    expect(regraEmVigorNoDia(v, "2027-02-28")?.id).toBe("a");
    expect(regraEmVigorNoDia(v, "2027-03-01")?.id).toBe("b");
  });
  it("antes da primeira versao nao ha regra", () => {
    expect(regraEmVigorNoDia(v, "2025-12-31")).toBeNull();
  });
  it("duas versoes com o mesmo inicio: a substituida nunca e a em vigor, mesmo que seja a mais recente na lista", () => {
    const velha = { ...versao("velha", "2027-03-01", null), criada_em: "2027-02-01T00:00:00Z", substituida_em: "2027-02-02T00:00:00Z", subsidio_valor_dia: 1 };
    const nova = { ...versao("nova", "2027-03-01", null), criada_em: "2027-02-02T00:00:00Z" };
    expect(regraEmVigorNoDia([velha, nova], "2027-03-05")?.id).toBe("nova");
    expect(regraEmVigorNoDia([nova, velha], "2027-03-05")?.id).toBe("nova");
    expect(regraMaisRecente([velha, nova])?.id).toBe("nova");
    expect(regraEmVigorNoDia([velha], "2027-03-05")).toBeNull();
  });
  it("sem substituida, o desempate e pela criacao", () => {
    const a = { ...versao("a", "2027-03-01", null), criada_em: "2027-02-01T00:00:00Z" };
    const b = { ...versao("b", "2027-03-01", null), criada_em: "2027-02-05T00:00:00Z" };
    expect(regraEmVigorNoDia([a, b], "2027-03-05")?.id).toBe("b");
  });
});

describe("useRegrasSalariais", () => {
  it("le o historico da organizacao e marca a que vale hoje", async () => {
    estado.respostas.rpc_hr_regras_salariais_historico = {
      data: [versao("b", "2027-03-01", null), versao("a", "2026-01-01", "2027-02-28")],
      error: null,
    };
    const { result } = renderHook(() => useRegrasSalariais(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(estado.rpcs[0]).toEqual({ fn: "rpc_hr_regras_salariais_historico", args: { _organization_id: "org-1" } });
    expect(result.current.versoes).toHaveLength(2);
    expect(result.current.emVigor?.id).toBe("a"); // hoje (simulado) = 2027-02-10
    expect(result.current.estado).toBe("ok");
  });

  it("sem as RPCs (PGRST202) diz indisponivel, sem erro", async () => {
    estado.respostas.rpc_hr_regras_salariais_historico = { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
    const { result } = renderHook(() => useRegrasSalariais(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.estado).toBe("indisponivel");
    expect(result.current.versoes).toEqual([]);
  });

  it("sem permissao (42501) fica recusado", async () => {
    estado.respostas.rpc_hr_regras_salariais_historico = { data: null, error: { code: "42501", message: "regras_salariais_sem_permissao: x" } };
    const { result } = renderHook(() => useRegrasSalariais(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.estado).toBe("recusado");
  });

  it("guardar envia a organizacao, o dia e a regra, e devolve a chave do erro da base", async () => {
    estado.respostas.rpc_hr_regras_salariais_historico = { data: [], error: null };
    const { result } = renderHook(() => useRegrasSalariais(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const regra = { subsidio_limite_min: 300 } as never;

    estado.respostas.rpc_hr_regras_salariais_guardar = { data: "id", error: null };
    let r: { erro: string | null } = { erro: "x" };
    await act(async () => {
      r = await result.current.guardar("2027-03-01", regra);
    });
    expect(r.erro).toBeNull();
    expect(estado.rpcs.find((c) => c.fn === "rpc_hr_regras_salariais_guardar")?.args).toEqual({
      _organization_id: "org-1",
      _valido_de: "2027-03-01",
      _regra: regra,
    });

    estado.respostas.rpc_hr_regras_salariais_guardar = {
      data: null,
      error: { code: "23514", message: "regras_salariais_periodo_fechado: ha uma folha fechada" },
    };
    await act(async () => {
      r = await result.current.guardar("2027-01-01", regra);
    });
    expect(r.erro).toBe("hr.regrasSalariais.erro.periodoFechado");
  });
});

describe("usePessoaDireitosSalariais", () => {
  it("sem linha = sem direito", async () => {
    estado.respostas.rpc_hr_pessoa_direitos_ler = { data: [], error: null };
    const { result } = renderHook(() => usePessoaDireitosSalariais("p1", "org-1"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.direitos).toEqual({ iht: false, km: false, ajudas: false });
    expect(estado.rpcs[0].args).toEqual({ _organization_id: "org-1", _pessoa_id: "p1" });
  });

  it("le a linha da pessoa e guarda os tres direitos de uma vez", async () => {
    estado.respostas.rpc_hr_pessoa_direitos_ler = { data: [{ pessoa_id: "p1", iht: true, km: false, ajudas: true }], error: null };
    const { result } = renderHook(() => usePessoaDireitosSalariais("p1", "org-1"), { wrapper });
    await waitFor(() => expect(result.current.direitos.iht).toBe(true));
    estado.respostas.rpc_hr_pessoa_direitos_guardar = { data: {}, error: null };
    await act(async () => {
      await result.current.guardar({ iht: true, km: true, ajudas: true });
    });
    expect(estado.rpcs.find((c) => c.fn === "rpc_hr_pessoa_direitos_guardar")?.args).toEqual({
      _organization_id: "org-1",
      _pessoa_id: "p1",
      _iht: true,
      _km: true,
      _ajudas: true,
    });
  });

  it("a base sem as RPCs diz indisponivel; a recusa de permissao volta traduzida", async () => {
    estado.respostas.rpc_hr_pessoa_direitos_ler = { data: null, error: { code: "42883", message: "function does not exist" } };
    const { result } = renderHook(() => usePessoaDireitosSalariais("p1", "org-1"), { wrapper });
    await waitFor(() => expect(result.current.estado).toBe("indisponivel"));
    estado.respostas.rpc_hr_pessoa_direitos_guardar = {
      data: null,
      error: { code: "42501", message: "direitos_salariais_sem_permissao: a pessoa nao existe, ou sem permissao" },
    };
    let r: { erro: string | null } = { erro: null };
    await act(async () => {
      r = await result.current.guardar({ iht: true, km: false, ajudas: false });
    });
    expect(r.erro).toBe("hr.direitosSalariais.erro.semPermissao");
  });
});
