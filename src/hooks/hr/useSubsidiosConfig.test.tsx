// A configuracao dos subsidios de ferias e de Natal, lida e escrita so pelas RPCs `rpc_hr_subsidios_config_ler` e `_guardar`.
// A RPC por aplicar e «indisponivel» (nao parte), uma recusa de permissao e «recusado» e um defeito e «erro»: o fecho le o estado.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const m = vi.hoisted(() => ({ rpc: vi.fn(), captura: vi.fn(), semOrganizacao: false }));
vi.mock("@/lib/hr/hrDb", () => ({ hrRpc: (...a: unknown[]) => m.rpc(...a) }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: m.semOrganizacao ? null : { id: "org-1" } }) }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...a: unknown[]) => m.captura(...a) }));
vi.mock("@/utils/friendlyError", () => ({ getLocalizedFallback: (k: string) => `T:${k}` }));

import { useSubsidiosConfig } from "./useSubsidiosConfig";

const envolver = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

const LIDA = { tem_config: true, ativo_desde: "2026-01-01", ferias_mes: 7, natal_mes: 12, folhas_fechadas_desde: "2026-03-01", ultima_folha_fechada_ate: "2026-09-30" };

beforeEach(() => {
  m.rpc.mockReset();
  m.captura.mockReset();
  m.semOrganizacao = false;
});

describe("useSubsidiosConfig: ler", () => {
  it("le a configuracao no formato da RPC", async () => {
    m.rpc.mockResolvedValue({ data: LIDA, error: null });
    const { result } = renderHook(() => useSubsidiosConfig(), { wrapper: envolver });
    expect(result.current.estado).toBe("a_carregar");
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    expect(result.current.config).toEqual({
      temConfig: true, ativoDesde: "2026-01-01", feriasMes: 7, natalMes: 12, folhasFechadasDesde: "2026-03-01", ultimaFolhaFechadaAte: "2026-09-30",
    });
    expect(m.rpc).toHaveBeenCalledWith("rpc_hr_subsidios_config_ler", { p_organization_id: "org-1" });
  });

  it("sem configuracao guardada: desligada, com as omissoes junho e novembro", async () => {
    m.rpc.mockResolvedValue({ data: { tem_config: false, ativo_desde: null, ferias_mes: null, natal_mes: null, folhas_fechadas_desde: null, ultima_folha_fechada_ate: null }, error: null });
    const { result } = renderHook(() => useSubsidiosConfig(), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    expect(result.current.config).toMatchObject({ temConfig: false, ativoDesde: null, feriasMes: 6, natalMes: 11 });
  });

  it("meses invalidos na resposta voltam as omissoes (nunca um mes fora de 1 a 12)", async () => {
    m.rpc.mockResolvedValue({ data: { ...LIDA, ferias_mes: 13, natal_mes: "x" }, error: null });
    const { result } = renderHook(() => useSubsidiosConfig(), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    expect(result.current.config).toMatchObject({ feriasMes: 6, natalMes: 11 });
  });

  it.each([
    [{ code: "PGRST202", message: "Could not find the function public.rpc_hr_subsidios_config_ler" }],
    [{ code: "42883", message: "function does not exist" }],
  ])("a RPC por aplicar (%j) e «indisponivel» e nao vai para o registo de erros", async (erro) => {
    m.rpc.mockResolvedValue({ data: null, error: erro });
    const { result } = renderHook(() => useSubsidiosConfig(), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("indisponivel"));
    expect(result.current.config).toBeNull();
    expect(m.captura).not.toHaveBeenCalled();
  });

  it.each([[{ code: "42501", message: "permission denied" }], [{ code: "403", message: "forbidden" }]])("uma recusa de permissao (%j) e «recusado»", async (erro) => {
    m.rpc.mockResolvedValue({ data: null, error: erro });
    const { result } = renderHook(() => useSubsidiosConfig(), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("recusado"));
    expect(result.current.config).toBeNull();
    expect(m.captura).not.toHaveBeenCalled();
  });

  it("um defeito e «erro» e vai para o registo", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { result } = renderHook(() => useSubsidiosConfig(), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("erro"));
    expect(m.captura).toHaveBeenCalledTimes(1);
  });

  it("uma excepcao na chamada (rede) tambem e «erro»", async () => {
    m.rpc.mockRejectedValue(new Error("rede"));
    const { result } = renderHook(() => useSubsidiosConfig(), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("erro"));
  });

  it("desligado (enabled false) nao chama a base", () => {
    renderHook(() => useSubsidiosConfig(false), { wrapper: envolver });
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("sem organizacao activa nao chama a base e fica por ler (nunca «ok»)", () => {
    m.semOrganizacao = true;
    const { result } = renderHook(() => useSubsidiosConfig(), { wrapper: envolver });
    expect(result.current.estado).toBe("a_carregar");
    expect(m.rpc).not.toHaveBeenCalled();
  });
});

describe("useSubsidiosConfig: guardar", () => {
  it("manda a organizacao, a data e os dois meses, e volta a ler", async () => {
    m.rpc.mockImplementation(async (fn: string) =>
      fn === "rpc_hr_subsidios_config_ler"
        ? { data: LIDA, error: null }
        : { data: { alterada: true, ativo_desde: "2026-02-01", ferias_mes: 6, natal_mes: 11 }, error: null },
    );
    const { result } = renderHook(() => useSubsidiosConfig(), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    let r: unknown;
    await act(async () => {
      r = await result.current.guardar({ ativoDesde: "2026-02-01", feriasMes: 6, natalMes: 11 });
    });
    expect(r).toEqual({ ok: true });
    expect(m.rpc).toHaveBeenCalledWith("rpc_hr_subsidios_config_guardar", { p_organization_id: "org-1", p_ativo_desde: "2026-02-01", p_ferias_mes: 6, p_natal_mes: 11 });
    // Releu depois de guardar.
    await waitFor(() => expect(m.rpc.mock.calls.filter(([fn]) => fn === "rpc_hr_subsidios_config_ler").length).toBeGreaterThanOrEqual(2));
  });

  it("null desliga", async () => {
    m.rpc.mockResolvedValue({ data: LIDA, error: null });
    const { result } = renderHook(() => useSubsidiosConfig(), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    await act(async () => {
      await result.current.guardar({ ativoDesde: null, feriasMes: 6, natalMes: 11 });
    });
    expect(m.rpc).toHaveBeenCalledWith("rpc_hr_subsidios_config_guardar", expect.objectContaining({ p_ativo_desde: null }));
  });

  it("meses fora de 1 a 12 nem chegam a base", async () => {
    m.rpc.mockResolvedValue({ data: LIDA, error: null });
    const { result } = renderHook(() => useSubsidiosConfig(), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    let r: { ok: boolean } | undefined;
    await act(async () => {
      r = await result.current.guardar({ ativoDesde: null, feriasMes: 0, natalMes: 11 });
    });
    expect(r?.ok).toBe(false);
    expect(m.rpc.mock.calls.some(([fn]) => fn === "rpc_hr_subsidios_config_guardar")).toBe(false);
  });

  it("uma recusa de permissao devolve o texto traduzido, sem ir para o registo", async () => {
    m.rpc.mockImplementation(async (fn: string) => (fn === "rpc_hr_subsidios_config_ler" ? { data: LIDA, error: null } : { data: null, error: { code: "42501", message: "permission denied" } }));
    const { result } = renderHook(() => useSubsidiosConfig(), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    let r: { ok: boolean; erro?: string } | undefined;
    await act(async () => {
      r = await result.current.guardar({ ativoDesde: null, feriasMes: 6, natalMes: 11 });
    });
    expect(r).toEqual({ ok: false, erro: "T:rhSubs.erro.semPermissao" });
    expect(m.captura).not.toHaveBeenCalled();
  });

  it.each([
    ["HRA88", "T:rhSubs.erro.folhaFechada"],
    ["HRA89", "T:rhSubs.erro.meses"],
    ["HRA81", "T:rhSubs.erro.configInvalida"],
  ])("o codigo %s da base tem texto proprio e nao vai para o registo", async (code, texto) => {
    m.rpc.mockImplementation(async (fn: string) => (fn === "rpc_hr_subsidios_config_ler" ? { data: LIDA, error: null } : { data: null, error: { code, message: "x" } }));
    const { result } = renderHook(() => useSubsidiosConfig(), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    let r: { ok: boolean; erro?: string } | undefined;
    await act(async () => {
      r = await result.current.guardar({ ativoDesde: null, feriasMes: 6, natalMes: 11 });
    });
    expect(r).toEqual({ ok: false, erro: texto });
    expect(m.captura).not.toHaveBeenCalled();
  });

  it("um defeito devolve o texto generico e vai para o registo", async () => {
    m.rpc.mockImplementation(async (fn: string) => (fn === "rpc_hr_subsidios_config_ler" ? { data: LIDA, error: null } : { data: null, error: { message: "boom" } }));
    const { result } = renderHook(() => useSubsidiosConfig(), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    let r: { ok: boolean; erro?: string } | undefined;
    await act(async () => {
      r = await result.current.guardar({ ativoDesde: null, feriasMes: 6, natalMes: 11 });
    });
    expect(r).toEqual({ ok: false, erro: "T:rhSubs.erro.guardar" });
    expect(m.captura).toHaveBeenCalledTimes(1);
  });
});
