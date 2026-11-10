// A assinatura da configuracao dos subsidios de ferias e de Natal de UM periodo (`rpc_hr_subsidios_assinatura`). O fecho exige que cada
// resultado leve a assinatura da configuracao com que o calculo foi feito. RPC por aplicar = «indisponivel» (desligado); permissao
// recusada = «recusado»; um defeito = «erro»; a carregar = «a_carregar». Os tres ultimos bloqueiam o fecho.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const m = vi.hoisted(() => ({ rpc: vi.fn(), captura: vi.fn(), semOrganizacao: false, empresaACarregar: false }));
vi.mock("@/lib/hr/hrDb", () => ({ hrRpc: (...a: unknown[]) => m.rpc(...a) }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: m.semOrganizacao ? null : { id: "org-1" }, isLoading: m.empresaACarregar }) }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...a: unknown[]) => m.captura(...a) }));

import { useSubsidiosAssinatura } from "./useSubsidiosAssinatura";

const envolver = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

const MD5_A = "a".repeat(32);
const MD5_B = "b".repeat(32);
const LIGADA = { aplica: true, ano: 2026, mes: 6, ativo_desde: "2026-01-01", ferias_mes: 6, natal_mes: 11, paga_ferias: true, paga_natal: false, assinatura: MD5_A };
const DESLIGADA = { aplica: false, ano: 2026, mes: 6, ativo_desde: null, ferias_mes: 6, natal_mes: 11, paga_ferias: false, paga_natal: false, assinatura: null };

beforeEach(() => {
  m.rpc.mockReset();
  m.captura.mockReset();
  m.semOrganizacao = false;
  m.empresaACarregar = false;
});

describe("useSubsidiosAssinatura: ler", () => {
  it("le a assinatura do periodo e a decisao do mes no formato da RPC", async () => {
    m.rpc.mockResolvedValue({ data: LIGADA, error: null });
    const { result } = renderHook(() => useSubsidiosAssinatura("per-1"), { wrapper: envolver });
    expect(result.current.estado).toBe("a_carregar");
    expect(result.current.leitura).toBeNull();
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    expect(result.current.leitura).toEqual({
      aplica: true, ano: 2026, mes: 6, ativoDesde: "2026-01-01", feriasMes: 6, natalMes: 11, pagaFerias: true, pagaNatal: false, assinatura: MD5_A,
    });
    expect(m.rpc).toHaveBeenCalledWith("rpc_hr_subsidios_assinatura", { p_periodo_id: "per-1" });
  });

  it("pagamento desligado para a folha: aplica falso e nenhuma assinatura (nunca uma inventada)", async () => {
    // Mesmo que a resposta trouxesse uma assinatura, com aplica falso nao vale.
    m.rpc.mockResolvedValue({ data: { ...DESLIGADA, assinatura: MD5_A, paga_ferias: true }, error: null });
    const { result } = renderHook(() => useSubsidiosAssinatura("per-1"), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    expect(result.current.leitura).toMatchObject({ aplica: false, assinatura: null, pagaFerias: false, pagaNatal: false });
  });

  it("aplica verdadeiro sem assinatura legivel e uma resposta invalida: erro, nunca «ok» sem assinatura", async () => {
    m.rpc.mockResolvedValue({ data: { ...LIGADA, assinatura: null }, error: null });
    const { result } = renderHook(() => useSubsidiosAssinatura("per-1"), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("erro"));
    expect(result.current.leitura).toBeNull();
    expect(m.captura).toHaveBeenCalledTimes(1);
  });

  it("uma resposta sem objecto e erro", async () => {
    m.rpc.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useSubsidiosAssinatura("per-1"), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("erro"));
  });

  it("meses invalidos na resposta voltam as omissoes", async () => {
    m.rpc.mockResolvedValue({ data: { ...LIGADA, ferias_mes: 13, natal_mes: "x" }, error: null });
    const { result } = renderHook(() => useSubsidiosAssinatura("per-1"), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    expect(result.current.leitura).toMatchObject({ feriasMes: 6, natalMes: 11 });
  });

  it.each([
    [{ code: "PGRST202", message: "Could not find the function public.rpc_hr_subsidios_assinatura" }],
    [{ code: "42883", message: "function does not exist" }],
  ])("a RPC por aplicar (%j) e «indisponivel» (desligado) e nao vai para o registo", async (erro) => {
    m.rpc.mockResolvedValue({ data: null, error: erro });
    const { result } = renderHook(() => useSubsidiosAssinatura("per-1"), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("indisponivel"));
    expect(result.current.leitura).toBeNull();
    expect(m.captura).not.toHaveBeenCalled();
  });

  it.each([[{ code: "42501", message: "permission denied" }], [{ code: "403", message: "forbidden" }]])("uma recusa de permissao (%j) e «recusado»", async (erro) => {
    m.rpc.mockResolvedValue({ data: null, error: erro });
    const { result } = renderHook(() => useSubsidiosAssinatura("per-1"), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("recusado"));
    expect(result.current.leitura).toBeNull();
    expect(m.captura).not.toHaveBeenCalled();
  });

  it("um defeito e «erro» e vai para o registo; uma excepcao (rede) tambem", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const a = renderHook(() => useSubsidiosAssinatura("per-1"), { wrapper: envolver });
    await waitFor(() => expect(a.result.current.estado).toBe("erro"));
    expect(m.captura).toHaveBeenCalledTimes(1);
    m.rpc.mockRejectedValue(new Error("rede"));
    const b = renderHook(() => useSubsidiosAssinatura("per-2"), { wrapper: envolver });
    await waitFor(() => expect(b.result.current.estado).toBe("erro"));
  });

  it("sem periodo (ainda nao aberto) nao chama a base e fica por ler (nunca «ok»)", () => {
    for (const id of [undefined, null, ""]) {
      const { result } = renderHook(() => useSubsidiosAssinatura(id), { wrapper: envolver });
      expect(result.current.estado).toBe("a_carregar");
      expect(result.current.leitura).toBeNull();
    }
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("organizacao ainda a carregar: nao chama a base e fica a carregar", () => {
    m.semOrganizacao = true;
    m.empresaACarregar = true;
    const { result } = renderHook(() => useSubsidiosAssinatura("per-1"), { wrapper: envolver });
    expect(result.current.estado).toBe("a_carregar");
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("periodo mas SEM organizacao (ja carregada): nao chama a base e fica em erro, nunca a carregar para sempre", () => {
    m.semOrganizacao = true;
    const { result } = renderHook(() => useSubsidiosAssinatura("per-1"), { wrapper: envolver });
    expect(result.current.estado).toBe("erro");
    expect(result.current.leitura).toBeNull();
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("sem periodo e sem organizacao continua por ler (nada a ler)", () => {
    m.semOrganizacao = true;
    const { result } = renderHook(() => useSubsidiosAssinatura(null), { wrapper: envolver });
    expect(result.current.estado).toBe("a_carregar");
  });
});

describe("useSubsidiosAssinatura: a configuracao muda depois do calculo", () => {
  it("a assinatura e a decisao vem do MESMO objecto: nunca uma assinatura nova com a decisao antiga", async () => {
    m.rpc.mockResolvedValueOnce({ data: LIGADA, error: null });
    const { result } = renderHook(() => useSubsidiosAssinatura("per-1"), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    const antes = result.current.leitura;
    expect(antes).toMatchObject({ pagaFerias: true, pagaNatal: false, assinatura: MD5_A });

    // A configuracao mudou na base (o mes de ferias passou a julho: este periodo ja nao paga) e a assinatura mudou com ela.
    m.rpc.mockResolvedValueOnce({ data: { ...LIGADA, ferias_mes: 7, paga_ferias: false, assinatura: MD5_B }, error: null });
    await act(async () => {
      await result.current.reler();
    });
    await waitFor(() => expect(result.current.leitura?.assinatura).toBe(MD5_B));
    expect(result.current.leitura).toMatchObject({ feriasMes: 7, pagaFerias: false, assinatura: MD5_B });
    // O que se tinha lido antes nao foi alterado a posteriori (e o que o calculo usou).
    expect(antes).toMatchObject({ pagaFerias: true, assinatura: MD5_A });
  });

  it("aReler: verdadeiro enquanto a releitura decorre (os dados antigos continuam «ok») e falso quando acaba", async () => {
    m.rpc.mockResolvedValueOnce({ data: LIGADA, error: null });
    const { result } = renderHook(() => useSubsidiosAssinatura("per-1"), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    expect(result.current.aReler).toBe(false);

    let acabar: (v: unknown) => void = () => undefined;
    m.rpc.mockReturnValueOnce(new Promise((resolve) => { acabar = resolve; }));
    act(() => { void result.current.reler(); });
    await waitFor(() => expect(result.current.aReler).toBe(true));
    // Durante a releitura o estado continua «ok» com a assinatura ANTIGA: por isso o fecho tem de esperar por aReler.
    expect(result.current.estado).toBe("ok");
    expect(result.current.leitura?.assinatura).toBe(MD5_A);

    await act(async () => { acabar({ data: { ...LIGADA, assinatura: MD5_B }, error: null }); });
    await waitFor(() => expect(result.current.aReler).toBe(false));
    expect(result.current.leitura?.assinatura).toBe(MD5_B);
  });

  it("uma releitura que falha nao deixa a assinatura antiga a valer como lida de novo: o estado e erro", async () => {
    m.rpc.mockResolvedValueOnce({ data: LIGADA, error: null });
    const { result } = renderHook(() => useSubsidiosAssinatura("per-1"), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    m.rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await act(async () => {
      await result.current.reler();
    });
    await waitFor(() => expect(result.current.estado).toBe("erro"));
  });
});
