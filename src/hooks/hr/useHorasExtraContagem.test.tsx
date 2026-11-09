// O hook real do interruptor da contagem: a RPC que ainda não existe vira «indisponível» (não parte), HRA87 e HRA tem texto
// próprio, e gravar manda a data (ou null) e o organization_id da organização activa.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const m = vi.hoisted(() => ({ rpc: vi.fn(), captura: vi.fn(), semOrganizacao: false }));
vi.mock("@/lib/hr/hrDb", () => ({ hrRpc: (...a: unknown[]) => m.rpc(...a) }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: m.semOrganizacao ? null : { id: "org-1" } }) }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...a: unknown[]) => m.captura(...a) }));
vi.mock("@/utils/friendlyError", () => ({ getLocalizedFallback: (k: string) => `T:${k}` }));

import { useHorasExtraContagem } from "./useHorasExtraContagem";

const envolver = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

beforeEach(() => {
  m.rpc.mockReset();
  m.captura.mockReset();
  m.semOrganizacao = false;
});

describe("sem organização activa", () => {
  it("diz «sem-organizacao» em vez de ficar a carregar para sempre, sem chamar a base", () => {
    m.semOrganizacao = true;
    const { result } = renderHook(() => useHorasExtraContagem(true), { wrapper: envolver });
    expect(result.current.estado).toBe("sem-organizacao");
    expect(m.rpc).not.toHaveBeenCalled();
  });
});

describe("useHorasExtraContagem", () => {
  it("lê o interruptor no formato da RPC", async () => {
    m.rpc.mockResolvedValue({ data: { aprovacao_desde: "2026-11-01", folhas_fechadas_desde: "2026-10-01", tem_config: true }, error: null });
    const { result } = renderHook(() => useHorasExtraContagem(true), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    expect(result.current.contagem).toEqual({ aprovacaoDesde: "2026-11-01", folhasFechadasDesde: "2026-10-01", ultimaFolhaFechadaAte: null, temConfig: true });
    expect(m.rpc).toHaveBeenCalledWith("rpc_hr_horas_extra_contagem_ler", { p_organization_id: "org-1" });
  });

  it.each([
    [{ code: "PGRST202", message: "Could not find the function public.rpc_hr_horas_extra_contagem_ler" }],
    [{ code: "42883", message: "function does not exist" }],
  ])("a RPC por aplicar (%j) é «indisponível» e não vai para o registo de erros", async (erro) => {
    m.rpc.mockResolvedValue({ data: null, error: erro });
    const { result } = renderHook(() => useHorasExtraContagem(true), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("indisponivel"));
    expect(result.current.contagem).toBeNull();
    expect(m.captura).not.toHaveBeenCalled();
  });

  it("um defeito na leitura é «erro» e vai para o registo", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { result } = renderHook(() => useHorasExtraContagem(true), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("erro"));
    expect(m.captura).toHaveBeenCalledTimes(1);
  });

  it("gravar envia a data e null desliga; HRA87 devolve o texto da folha fechada", async () => {
    m.rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "rpc_hr_horas_extra_contagem_ler") return { data: { aprovacao_desde: null, folhas_fechadas_desde: null, tem_config: false }, error: null };
      return args.p_desde === "2026-01-01" ? { data: null, error: { code: "HRA87", message: "folha_fechada" } } : { data: { aprovacao_desde: args.p_desde, alterada: true }, error: null };
    });
    const { result } = renderHook(() => useHorasExtraContagem(true), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    let r: { ok: boolean; erro: string | null } = { ok: false, erro: null };
    await act(async () => { r = await result.current.guardar("2026-12-01"); });
    expect(r.ok).toBe(true);
    expect(m.rpc).toHaveBeenCalledWith("rpc_hr_horas_extra_contagem_guardar", { p_organization_id: "org-1", p_desde: "2026-12-01" });
    await act(async () => { r = await result.current.guardar(null); });
    expect(m.rpc).toHaveBeenCalledWith("rpc_hr_horas_extra_contagem_guardar", { p_organization_id: "org-1", p_desde: null });
    await act(async () => { r = await result.current.guardar("2026-01-01"); });
    expect(r).toEqual({ ok: false, erro: "T:rhHeReal.contagem.erro.folhaFechadaLigar" });
    expect(m.captura).not.toHaveBeenCalled();
  });

  it("HRA87 tem dois textos conforme a acção: ligar/antecipar (com a data da última folha) e desligar/adiar", async () => {
    m.rpc.mockImplementation(async (fn: string) => fn === "rpc_hr_horas_extra_contagem_ler"
      ? { data: { aprovacao_desde: "2026-11-01", folhas_fechadas_desde: "2026-10-01", ultima_folha_fechada_ate: "2026-10-31", tem_config: true }, error: null }
      : { data: null, error: { code: "HRA87", message: "folha_fechada" } });
    const { result } = renderHook(() => useHorasExtraContagem(true), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    expect(result.current.contagem?.ultimaFolhaFechadaAte).toBe("2026-10-31");
    let r: { ok: boolean; erro: string | null } = { ok: true, erro: null };
    await act(async () => { r = await result.current.guardar(null); });
    expect(r.erro).toBe("T:rhHeReal.contagem.erro.folhaFechadaDesligar");
    await act(async () => { r = await result.current.guardar("2026-12-01"); });
    expect(r.erro).toBe("T:rhHeReal.contagem.erro.folhaFechadaDesligar");
    await act(async () => { r = await result.current.guardar("2026-10-15"); });
    expect(r.erro).toBe("T:rhHeReal.contagem.erro.folhaFechadaLigarData");
  });

  it("a chave ultima_folha_fechada_ate ausente (base ainda sem ela) lê-se como null", async () => {
    m.rpc.mockResolvedValue({ data: { aprovacao_desde: null, folhas_fechadas_desde: null, tem_config: false }, error: null });
    const { result } = renderHook(() => useHorasExtraContagem(true), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    expect(result.current.contagem?.ultimaFolhaFechadaAte).toBeNull();
  });
});