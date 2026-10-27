/**
 * Os feriados da organizacao (schedule_holidays) para os mapas de ausencias: le so da organizacao activa, indexa os fixos por
 * data e os recorrentes por MM-DD, e diz quando a leitura falha ou e recusada em vez de passar por «nao ha feriados».
 *
 * Supabase simulado. Nada toca em base nenhuma.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG_ACTIVA = "org-activa";

const base = vi.hoisted(() => ({
  filtros: [] as Array<[string, unknown]>,
  tabelas: [] as string[],
  colunas: [] as string[],
  resposta: { data: [] as unknown[], error: null as unknown },
  empresa: { id: "org-activa" } as { id: string } | null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabela: string) => {
      base.tabelas.push(tabela);
      const cadeia: Record<string, unknown> = {
        select: (colunas: string) => {
          base.colunas.push(colunas);
          return cadeia;
        },
        eq: (coluna: string, valor: unknown) => {
          base.filtros.push([coluna, valor]);
          return cadeia;
        },
        then: (ok: (r: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(base.resposta).then(ok, ko),
      };
      return cadeia;
    },
  },
}));

vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: base.empresa, companies: [] }),
}));

const captureFlowError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError }));

import { eFeriado } from "@/lib/hr/ausencias";
import { useFeriadosDaOrganizacao } from "@/hooks/useFeriadosDaOrganizacao";

beforeEach(() => {
  base.filtros.length = 0;
  base.tabelas.length = 0;
  base.colunas.length = 0;
  base.resposta = { data: [], error: null };
  base.empresa = { id: ORG_ACTIVA };
  captureFlowError.mockClear();
});

describe("useFeriadosDaOrganizacao", () => {
  it("le schedule_holidays so da organizacao activa e indexa fixos e recorrentes", async () => {
    base.resposta = {
      data: [
        { holiday_date: "2026-12-08", is_recurring: false },
        { holiday_date: "2020-12-25", is_recurring: true },
      ],
      error: null,
    };
    const { result } = renderHook(() => useFeriadosDaOrganizacao());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(base.tabelas).toEqual(["schedule_holidays"]);
    expect(base.colunas).toEqual(["holiday_date, is_recurring"]);
    expect(base.filtros).toEqual([["organization_id", ORG_ACTIVA]]);
    expect(eFeriado("2026-12-08", result.current.feriados)).toBe(true);
    expect(eFeriado("2027-12-08", result.current.feriados)).toBe(false);
    // O recorrente vale em todos os anos.
    expect(eFeriado("2031-12-25", result.current.feriados)).toBe(true);
    expect(result.current).toMatchObject({ erro: false, recusado: false });
  });

  it("sem organizacao activa nao le nada e nao fica a carregar", async () => {
    base.empresa = null;
    const { result } = renderHook(() => useFeriadosDaOrganizacao());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(base.tabelas).toEqual([]);
  });

  it("uma leitura que falha diz-se e e reportada; nao passa por «nao ha feriados»", async () => {
    base.resposta = { data: [], error: { message: "timeout", code: "57014" } };
    const { result } = renderHook(() => useFeriadosDaOrganizacao());
    await waitFor(() => expect(result.current.erro).toBe(true));
    expect(result.current.recusado).toBe(false);
    expect(captureFlowError).toHaveBeenCalledTimes(1);
  });

  it("uma leitura recusada por permissao diz-se, sem reportar como defeito", async () => {
    base.resposta = { data: [], error: { message: "permission denied for table schedule_holidays", code: "42501" } };
    const { result } = renderHook(() => useFeriadosDaOrganizacao());
    await waitFor(() => expect(result.current.recusado).toBe(true));
    expect(result.current.erro).toBe(false);
    expect(captureFlowError).not.toHaveBeenCalled();
  });
});
