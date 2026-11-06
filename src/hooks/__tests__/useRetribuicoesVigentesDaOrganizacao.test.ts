/**
 * As retribuicoes da organizacao alimentam o FECHO da folha, que grava para sempre: a leitura tem de ser paginada
 * (o PostgREST corta nas 1000 linhas), dizer o erro, e nunca deixar o mapa de um periodo anterior a meio de uma leitura.
 * Supabase simulado.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

let linhasNaBase: Array<Record<string, unknown>> = [];
let erroNaPagina: { pagina: number; erro: unknown } | null = null;
let intervalosPedidos: Array<[number, number]> = [];

vi.mock("@/lib/hr/hrDb", async () => {
  const real = await vi.importActual<typeof import("@/lib/hr/hrDb")>("@/lib/hr/hrDb");
  return {
    ...real,
    hrFrom: () => {
      let intervalo: [number, number] = [0, 999];
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        lte: () => chain,
        or: () => chain,
        order: () => chain,
        range: (de: number, ate: number) => {
          intervalo = [de, ate];
          intervalosPedidos.push(intervalo);
          return chain;
        },
        then: (ok: any, ko: any) => {
          const pagina = intervalo[0] / 1000;
          if (erroNaPagina && erroNaPagina.pagina === pagina) {
            return Promise.resolve({ data: null, error: erroNaPagina.erro }).then(ok, ko);
          }
          return Promise.resolve({ data: linhasNaBase.slice(intervalo[0], intervalo[1] + 1), error: null }).then(ok, ko);
        },
      };
      return chain;
    },
  };
});

vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

import { useRetribuicoesVigentesDaOrganizacao } from "@/hooks/useRetribuicoesVigentesDaOrganizacao";

const linha = (i: number, pessoa = `p${i}`) => ({
  id: `r${i}`, pessoa_id: pessoa, valor_base: 1000, periodicidade: "mensal", duodecimos_pct: 50,
  valido_de: "2026-01-01", valido_ate: null,
});

describe("useRetribuicoesVigentesDaOrganizacao", () => {
  beforeEach(() => {
    linhasNaBase = [];
    erroNaPagina = null;
    intervalosPedidos = [];
  });

  it("le todas as paginas, e nao so as primeiras mil", async () => {
    linhasNaBase = Array.from({ length: 1001 }, (_, i) => linha(i));
    const { result } = renderHook(() => useRetribuicoesVigentesDaOrganizacao("org", 2026, 10));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.porPessoa.size).toBe(1001);
    expect(result.current.porPessoa.has("p1000"), "a retribuicao da segunda pagina nao foi lida").toBe(true);
    expect(intervalosPedidos).toEqual([[0, 999], [1000, 1999]]);
    expect(result.current.estado).toBe("ok");
  });

  it("uma falha a meio da paginacao da erro e NAO deixa um mapa parcial", async () => {
    linhasNaBase = Array.from({ length: 1500 }, (_, i) => linha(i));
    erroNaPagina = { pagina: 1, erro: { code: "XX000", message: "falha" } };
    const { result } = renderHook(() => useRetribuicoesVigentesDaOrganizacao("org", 2026, 10));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.erro).toBe(true);
    expect(result.current.estado).toBe("erro");
    expect(result.current.porPessoa.size).toBe(0);
  });

  it("uma recusa por permissao e dita como recusado, nao como erro", async () => {
    erroNaPagina = { pagina: 0, erro: { code: "42501", message: "permission denied" } };
    const { result } = renderHook(() => useRetribuicoesVigentesDaOrganizacao("org", 2026, 10));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.recusado).toBe(true);
    expect(result.current.erro).toBe(false);
    expect(result.current.estado).toBe("recusado");
  });

  it("ao mudar de mes, o mapa do mes anterior limpa-se logo (nunca fica rotulado com o mes novo)", async () => {
    linhasNaBase = [linha(1)];
    const { result, rerender } = renderHook(({ mes }) => useRetribuicoesVigentesDaOrganizacao("org", 2026, mes), {
      initialProps: { mes: 10 },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.porPessoa.size).toBe(1);

    linhasNaBase = [];
    rerender({ mes: 11 });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.porPessoa.size).toBe(0);
    expect(result.current.estado).toBe("ok");
  });

  it("enquanto le, o estado e a_carregar", async () => {
    const { result } = renderHook(() => useRetribuicoesVigentesDaOrganizacao("org", 2026, 10));
    expect(result.current.estado).toBe("a_carregar");
    await waitFor(() => expect(result.current.loading).toBe(false));
  });
});
