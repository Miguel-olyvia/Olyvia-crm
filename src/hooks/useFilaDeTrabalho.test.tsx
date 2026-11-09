// O hook real da fila de trabalho, com as tres leituras simuladas: a janela dos desvios, o periodo (nunca inventado), e uma
// fonte que falha numa releitura (os itens da ultima leitura boa ficam, marcados como lidos com falha).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  lerHorasExtra: vi.fn(),
  lerJustificacoesDoDia: vi.fn(),
  lerDesvios: vi.fn(),
  captureFlowError: vi.fn(),
  regras: { regras: [] as unknown[], estado: "ok" as string, isLoading: false },
}));

vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-1" } }) }));
vi.mock("@/hooks/hr/useHorasExtra", () => ({ CHAVE_HORAS_EXTRA: "hr-horas-extra", lerHorasExtra: h.lerHorasExtra }));
vi.mock("@/hooks/useAssiduidadeDaOrganizacao", () => ({ lerDesvios: h.lerDesvios }));
vi.mock("@/hooks/useJustificacoesDoDia", () => ({
  lerJustificacoesDoDia: h.lerJustificacoesDoDia,
  avisarMudancaDeJustificacoes: vi.fn(),
  subscreverMudancaDeJustificacoes: () => () => undefined,
}));
vi.mock("@/hooks/usePeriodoFolhaRegras", () => ({ usePeriodoFolhaRegras: () => h.regras }));
vi.mock("@/hooks/usePermissoesAssiduidade", () => ({ usePermissoesAssiduidade: () => ({ permissoes: { view: true }, loading: false }) }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: h.captureFlowError }));
vi.mock("@/components/rh-exemplo/lib/alertasFimDia", () => ({
  accoesDoDesvio: () => ["marcar_falta"],
  chaveDoDesvio: (d: { pessoa_id: string; data: string }, i: number) => `${d.pessoa_id}|${d.data}|${i}`,
}));

import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useFilaDeTrabalho } from "@/hooks/useFilaDeTrabalho";

const DESVIO = { organization_id: "org-1", pessoa_id: "p-ana", data: "2026-10-12", tipo: "planeado_sem_realizado", hora_inicio: "09:00", hora_fim: "13:00", minutos: 240 };
const desviosOk = (linhas: unknown[]) => ({ linhas, recusado: false, erro: false });

const montar = () => {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
  return renderHook(() => useFilaDeTrabalho(), { wrapper });
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-05T12:00:00Z"));
  h.regras.regras = [];
  h.regras.estado = "ok";
  h.regras.isLoading = false;
  h.lerHorasExtra.mockReset().mockResolvedValue({ horas: [], total: 0 });
  h.lerJustificacoesDoDia.mockReset().mockResolvedValue({ leitura: "ok", linhas: [] });
  h.lerDesvios.mockReset().mockResolvedValue(desviosOk([DESVIO]));
  h.captureFlowError.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useFilaDeTrabalho (real, com as leituras simuladas)", () => {
  it("a janela dos desvios começa no período anterior ao em curso e acaba hoje", async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.aCarregar).toBe(false));
    // Sem regras vale o mês de calendário: em curso 01/11 a 30/11, anterior 01/10 a 31/10.
    expect(h.lerDesvios).toHaveBeenCalledWith("org-1", "2026-10-01", "2026-11-05");
    expect(result.current.periodo).toEqual({ de: "2026-11-01", ate: "2026-11-30" });
    expect(result.current.itens).toHaveLength(1);
    expect(result.current.fontes).toEqual({ horas_extra: "ok", justificacoes: "ok", desvios: "ok" });
  });

  it("com as regras do período em erro não há período (nada de selo inventado) e a janela cai para o mês anterior", async () => {
    h.regras.estado = "erro";
    const { result } = montar();
    await waitFor(() => expect(result.current.aCarregar).toBe(false));
    expect(result.current.periodo).toBeNull();
    expect(h.lerDesvios).toHaveBeenCalledWith("org-1", "2026-10-01", "2026-11-05");
  });

  it("uma fonte que falha numa releitura mantém os itens da última leitura boa e fica marcada com erro", async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.itens).toHaveLength(1));
    h.lerDesvios.mockResolvedValue({ linhas: [], recusado: false, erro: true });
    await act(async () => {
      await result.current.recarregar();
    });
    await waitFor(() => expect(result.current.fontes.desvios).toBe("erro"));
    // O alerta por resolver não desaparece só porque a releitura falhou.
    expect(result.current.itens).toHaveLength(1);
    expect(result.current.itens[0].tipo).toBe("alerta");
    expect(h.lerHorasExtra).toHaveBeenCalledTimes(2);
    expect(h.lerDesvios).toHaveBeenCalledTimes(2);
  });

  it("uma leitura que rejeita fica como erro e vai para o registo, sem deitar a fila abaixo", async () => {
    h.lerJustificacoesDoDia.mockRejectedValue(new Error("rede"));
    const { result } = montar();
    await waitFor(() => expect(result.current.aCarregar).toBe(false));
    expect(result.current.fontes.justificacoes).toBe("erro");
    expect(result.current.itens).toHaveLength(1);
    expect(h.captureFlowError).toHaveBeenCalledTimes(1);
  });
});
