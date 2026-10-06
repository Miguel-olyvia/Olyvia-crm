/**
 * `carregarRetribuicaoActual` (usePessoa.ts): a retribuicao que a ficha mostra
 * como "actual" e a versao em vigor HOJE (da base). So se NENHUMA tiver
 * comecado (admissao futura) se cai na mais recente.
 *
 * O que estes testes fecham: se a primeira consulta FALHAR, a mais recente
 * (que pode ser FUTURA, uma subida agendada) NAO pode passar por actual -- o
 * ecra mostraria o salario de amanha como o de hoje.
 *
 * Supabase simulado. Nada toca em base nenhuma.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Resposta = { data: unknown; error: unknown };

const estado = vi.hoisted(() => ({
  respostas: [] as Array<{ data: unknown; error: unknown }>,
  consultas: [] as Array<{ tabela: string; lte: Array<[string, unknown]>; selectColunas: string }>,
}));

vi.mock("@/lib/hr/hrDb", async () => {
  const actual = await vi.importActual<typeof import("@/lib/hr/hrDb")>("@/lib/hr/hrDb");
  return {
    ...actual,
    hrFrom: (tabela: string) => {
      const consulta = { tabela, lte: [] as Array<[string, unknown]>, selectColunas: "" };
      estado.consultas.push(consulta);
      const chain: Record<string, unknown> = {
        select: (colunas: string) => {
          consulta.selectColunas = colunas;
          return chain;
        },
        eq: () => chain,
        is: () => chain,
        order: () => chain,
        lte: (coluna: string, valor: unknown) => {
          consulta.lte.push([coluna, valor]);
          return chain;
        },
        limit: () => chain,
        maybeSingle: () => Promise.resolve(estado.respostas.shift() ?? { data: null, error: null }),
      };
      return chain;
    },
  };
});

const captureFlowError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError }));

import { carregarRetribuicaoActual } from "@/hooks/usePessoa";

const EM_VIGOR = { id: "r-vigor", valido_de: "2026-01-01", valido_ate: null };
const FUTURA = { id: "r-futura", valido_de: "2099-01-01", valido_ate: null };

function responder(...respostas: Resposta[]) {
  estado.respostas = [...respostas];
}

beforeEach(() => {
  estado.respostas = [];
  estado.consultas = [];
  captureFlowError.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("carregarRetribuicaoActual", () => {
  it("devolve a versao em vigor e nao faz mais nenhuma consulta", async () => {
    responder({ data: EM_VIGOR, error: null });
    await expect(carregarRetribuicaoActual("p1")).resolves.toEqual(EM_VIGOR);
    expect(estado.consultas).toHaveLength(1);
  });

  it("filtra por 'valido_de <= hoje' com o dia da BASE (UTC), nao o local", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 00:30 de 2 de Julho em Lisboa = 23:30 de 1 de Julho em UTC.
    vi.setSystemTime(new Date("2026-07-01T23:30:00Z"));
    responder({ data: EM_VIGOR, error: null });

    await carregarRetribuicaoActual("p1");
    expect(estado.consultas[0].lte).toEqual([["valido_de", "2026-07-01"]]);
  });

  it("nenhuma versao comecou (admissao futura): cai na mais recente", async () => {
    responder({ data: null, error: null }, { data: FUTURA, error: null });
    await expect(carregarRetribuicaoActual("p1")).resolves.toEqual(FUTURA);
    expect(estado.consultas).toHaveLength(2);
    expect(estado.consultas[1].lte).toEqual([]);
  });

  it("primeira consulta FALHA: devolve null e NAO vai buscar a mais recente (podia ser futura)", async () => {
    responder({ data: null, error: { code: "XX000", message: "boom" } }, { data: FUTURA, error: null });
    await expect(carregarRetribuicaoActual("p1")).resolves.toBeNull();
    expect(estado.consultas).toHaveLength(1);
    expect(captureFlowError).toHaveBeenCalledTimes(1);
  });

  it("primeira consulta recusada por permissao: null, sem fallback e sem Sentry", async () => {
    responder({ data: null, error: { code: "42501", message: "permission denied" } }, { data: FUTURA, error: null });
    await expect(carregarRetribuicaoActual("p1")).resolves.toBeNull();
    expect(estado.consultas).toHaveLength(1);
    expect(captureFlowError).not.toHaveBeenCalled();
  });

  it("a consulta de fallback tambem pode falhar: null", async () => {
    responder({ data: null, error: null }, { data: null, error: { code: "XX000", message: "boom" } });
    await expect(carregarRetribuicaoActual("p1")).resolves.toBeNull();
    expect(captureFlowError).toHaveBeenCalledTimes(1);
  });
});
