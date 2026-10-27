/**
 * Os vinculos de toda a organizacao (tipo de contrato e horas por semana): o vinculo que cobre cada mes, a paginacao
 * (o PostgREST corta a 1000 linhas), a recusa por permissao (nao e defeito) e a falha (sobe, nunca um mapa a meio).
 * Supabase simulado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const respostas: Array<{ data: unknown[] | null; error: unknown }> = [];
const intervalos: Array<[number, number]> = [];
const filtros: Array<[string, unknown]> = [];
const captureFlowError = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-1" } }) }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError }));
vi.mock("@/utils/friendlyError", () => ({ getFriendlyErrorMessage: async () => "Falhou a leitura" }));
vi.mock("@/lib/hr/hrDb", () => ({
  isPermissionError: (e: { code?: string }) => e?.code === "42501",
  hrFrom: () => {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = (c: string, v: unknown) => { filtros.push([c, v]); return q; };
    q.is = (c: string, v: unknown) => { filtros.push([c, v]); return q; };
    q.order = () => q;
    q.range = (a: number, b: number) => { intervalos.push([a, b]); return Promise.resolve(respostas.shift() ?? { data: [], error: null }); };
    return q;
  },
}));

import { usePessoasVinculosVigentes, vinculoDoMes, vinculosPorPessoa } from "@/hooks/usePessoasVinculosVigentes";

const linha = (pessoa: string, ini: string, fim: string | null, horas: number | null, tipo = "sem_termo", estado = "activo") => ({
  pessoa_id: pessoa, tipo_contrato: tipo, estado, data_inicio: ini, data_fim: fim, horas_semanais_equivalentes: horas,
});

beforeEach(() => {
  respostas.length = 0;
  intervalos.length = 0;
  filtros.length = 0;
  captureFlowError.mockReset();
});

describe("vinculoDoMes", () => {
  const mapa = vinculosPorPessoa([
    linha("p1", "2025-01-01", "2026-03-31", 40, "termo_certo", "terminado"),
    linha("p1", "2026-04-01", null, 20),
    linha("p2", "2026-09-15", null, null),
  ]);

  it("escolhe o contrato que cobre o mes, e nao o de hoje", () => {
    expect(vinculoDoMes(mapa.get("p1"), "2026-02")).toMatchObject({ tipoContrato: "termo_certo", horasSemanais: 40 });
    expect(vinculoDoMes(mapa.get("p1"), "2026-09")).toMatchObject({ tipoContrato: "sem_termo", horasSemanais: 20 });
  });

  it("nas fronteiras do contrato: o ultimo mes do antigo e o primeiro do novo", () => {
    expect(vinculoDoMes(mapa.get("p1"), "2026-03")).toMatchObject({ horasSemanais: 40 });
    expect(vinculoDoMes(mapa.get("p1"), "2026-04")).toMatchObject({ horasSemanais: 20 });
  });

  it("antes do inicio de todos, ou sem vinculos, nao ha vinculo (nunca um inventado)", () => {
    expect(vinculoDoMes(mapa.get("p1"), "2024-12")).toBeNull();
    expect(vinculoDoMes(mapa.get("p2"), "2026-08")).toBeNull();
    expect(vinculoDoMes(undefined, "2026-09")).toBeNull();
  });

  it("um contrato sem horas fixas devolve horas nulas", () => {
    expect(vinculoDoMes(mapa.get("p2"), "2026-09")).toMatchObject({ horasSemanais: null });
  });
});

describe("usePessoasVinculosVigentes", () => {
  it("le os vinculos da organizacao activa, sem os apagados, e agrupa-os por pessoa", async () => {
    respostas.push({ data: [linha("p1", "2026-01-01", null, 40), linha("p2", "2026-02-01", null, 20, "termo_certo")], error: null });
    const { result } = renderHook(() => usePessoasVinculosVigentes());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(filtros).toContainEqual(["organization_id", "org-1"]);
    expect(filtros).toContainEqual(["deleted_at", null]);
    expect([...result.current.vinculos.keys()]).toEqual(["p1", "p2"]);
    expect(result.current.recusado).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("pagina: pede a pagina seguinte enquanto vier uma pagina cheia", async () => {
    const cheia = Array.from({ length: 1000 }, (_, i) => linha(`p${i}`, "2026-01-01", null, 40));
    respostas.push({ data: cheia, error: null }, { data: [linha("p1000", "2026-01-01", null, 40)], error: null });
    const { result } = renderHook(() => usePessoasVinculosVigentes());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(intervalos).toEqual([[0, 999], [1000, 1999]]);
    expect(result.current.vinculos.size).toBe(1001);
  });

  it("uma recusa por permissao deixa o mapa vazio e diz que foi recusado, sem reportar defeito", async () => {
    respostas.push({ data: null, error: { code: "42501" } });
    const { result } = renderHook(() => usePessoasVinculosVigentes());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.recusado).toBe(true);
    expect(result.current.vinculos.size).toBe(0);
    expect(result.current.error).toBeNull();
    expect(captureFlowError).not.toHaveBeenCalled();
  });

  it("uma falha a meio da paginacao sobe como erro e nunca deixa um mapa a meio", async () => {
    const cheia = Array.from({ length: 1000 }, (_, i) => linha(`p${i}`, "2026-01-01", null, 40));
    respostas.push({ data: cheia, error: null }, { data: null, error: { code: "XX000", message: "rede" } });
    const { result } = renderHook(() => usePessoasVinculosVigentes());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Falhou a leitura");
    expect(result.current.vinculos.size).toBe(0);
    expect(result.current.recusado).toBe(false);
    expect(captureFlowError).toHaveBeenCalledTimes(1);
  });
});
