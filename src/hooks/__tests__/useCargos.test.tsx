/**
 * `useCargos` no fluxo 2: o salario do cargo deixou de se escrever por UPDATE.
 *
 *  - `editar` envia SO nome, horas e autor (com salario/periodicidade a base
 *    recusa com HRC01);
 *  - `criar` continua a enviar salario e periodicidade (o trigger de criacao
 *    abre o primeiro periodo);
 *  - `definirSalario` chama a RPC com os cinco argumentos e invalida o que muda;
 *  - os periodos do cargo carregam por organizacao.
 *
 * Supabase simulado. Nada toca em base nenhuma.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const ORG = "org-activa";

const estado = vi.hoisted(() => ({
  updates: [] as Array<{ tabela: string; valores: Record<string, unknown> }>,
  inserts: [] as Array<{ tabela: string; valores: Record<string, unknown> }>,
  filtros: [] as Array<{ tabela: string; coluna: string; valor: unknown }>,
  selects: [] as Array<{ tabela: string; colunas: string }>,
  rpcs: [] as Array<{ fn: string; args: Record<string, unknown> | undefined }>,
  rpcResposta: { data: null as unknown, error: null as unknown },
  /** Os periodos que a base "tem"; o `range` fatia-os como o PostgREST. */
  periodos: null as null | unknown[],
  falharPeriodos: null as unknown,
  intervalos: [] as Array<[number, number]>,
}));

const PERIODOS = [
  { id: "p1", cargo_id: "c1", salario_base: 1000, periodicidade: "mensal", valido_de: "2025-01-01", valido_ate: "2026-12-01", motivo: null },
  { id: "p2", cargo_id: "c1", salario_base: 1100, periodicidade: "mensal", valido_de: "2026-12-01", valido_ate: null, motivo: null },
];

vi.mock("@/lib/hr/hrDb", async () => {
  const actual = await vi.importActual<typeof import("@/lib/hr/hrDb")>("@/lib/hr/hrDb");
  return {
    ...actual,
    hrFrom: (tabela: string) => {
      let operacao: "select" | "update" | "insert" = "select";
      let intervalo: [number, number] | null = null;
      const chain: Record<string, unknown> = {
        select: (colunas: string) => {
          estado.selects.push({ tabela, colunas });
          return chain;
        },
        order: () => chain,
        range: (de: number, ate: number) => {
          intervalo = [de, ate];
          if (tabela === "hr_cargos_periodos") estado.intervalos.push([de, ate]);
          return chain;
        },
        eq: (coluna: string, valor: unknown) => {
          estado.filtros.push({ tabela, coluna, valor });
          return chain;
        },
        update: (valores: Record<string, unknown>) => {
          operacao = "update";
          estado.updates.push({ tabela, valores });
          return chain;
        },
        insert: (valores: Record<string, unknown>) => {
          operacao = "insert";
          estado.inserts.push({ tabela, valores });
          return chain;
        },
        then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
          if (operacao === "select" && tabela === "hr_cargos_periodos" && estado.falharPeriodos) {
            return Promise.resolve({ data: null, error: estado.falharPeriodos }).then(ok, ko);
          }
          const todos = estado.periodos ?? PERIODOS;
          const dados =
            operacao !== "select"
              ? null
              : tabela === "hr_cargos_periodos"
                ? intervalo
                  ? todos.slice(intervalo[0], intervalo[1] + 1)
                  : todos
                : [];
          return Promise.resolve({ data: dados, error: null }).then(ok, ko);
        },
      };
      return chain;
    },
    hrRpc: (fn: string, args?: Record<string, unknown>) => {
      estado.rpcs.push({ fn, args });
      return Promise.resolve(estado.rpcResposta);
    },
  };
});

vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: { id: ORG, name: "Nike" } }),
}));
vi.mock("@/lib/identity/resolveBusinessUserId", () => ({
  resolveCurrentBusinessUserId: () => Promise.resolve("autor-1"),
}));

import { useCargos } from "@/hooks/useCargos";

function montar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidar = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useCargos(), { wrapper });
  return { ...hook, invalidar };
}

const RESPOSTA_DEFINIR_SALARIO = {
  data: { periodo_id: "p3", pessoas_actualizadas: 3, pessoas_sem_retribuicao: 0 },
  error: null,
};

beforeEach(() => {
  estado.updates = [];
  estado.inserts = [];
  estado.filtros = [];
  estado.selects = [];
  estado.rpcs = [];
  estado.rpcResposta = RESPOSTA_DEFINIR_SALARIO;
  estado.periodos = null;
  estado.falharPeriodos = null;
  estado.intervalos = [];
});

describe("useCargos (fluxo 2)", () => {
  it("carrega os periodos do cargo da organizacao activa", async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.periodos).toHaveLength(2));

    expect(estado.filtros).toContainEqual({
      tabela: "hr_cargos_periodos",
      coluna: "organization_id",
      valor: ORG,
    });
  });

  it("le hr_cargos so com colunas legiveis: nunca * nem salario_base/periodicidade (authenticated nao as le)", async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.periodos).toHaveLength(2));

    const colunas = estado.selects.find((s) => s.tabela === "hr_cargos")?.colunas ?? "";
    expect(colunas).not.toContain("*");
    expect(colunas).not.toMatch(/salario_base|periodicidade/);
    expect(colunas).toContain("nome");
  });

  it("salarioDoCargoEm devolve o salario do periodo que cobre a data", async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.periodos).toHaveLength(2));

    expect(result.current.salarioDoCargoEm("c1", "2026-06-01")).toMatchObject({ salario_base: 1000 });
    expect(result.current.salarioDoCargoEm("c1", "2026-12-01")).toMatchObject({ salario_base: 1100 });
    expect(result.current.salarioDoCargoEm("inexistente", "2026-12-01")).toBeNull();
  });

  it("le hr_cargos_periodos so com colunas explicitas, nunca *", async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.periodos).toHaveLength(2));

    const colunas = estado.selects.find((s) => s.tabela === "hr_cargos_periodos")?.colunas ?? "";
    expect(colunas).not.toContain("*");
    expect(colunas.split(",").map((c) => c.trim())).toEqual([
      "id",
      "cargo_id",
      "salario_base",
      "periodicidade",
      "valido_de",
      "valido_ate",
      "motivo",
    ]);
  });

  it("periodosLoading e periodosError: a carregar, depois carregado sem erro", async () => {
    const { result } = montar();
    expect(result.current.periodosLoading).toBe(true);
    await waitFor(() => expect(result.current.periodosLoading).toBe(false));
    expect(result.current.periodosError).toBe(false);
    expect(typeof result.current.periodosLoading).toBe("boolean");
    expect(typeof result.current.periodosError).toBe("boolean");
  });

  it("falha a ler os periodos: periodosError true (e NAO um cargo 'sem salario' em silencio)", async () => {
    estado.falharPeriodos = { code: "XX000", message: "boom" };
    const { result } = montar();
    await waitFor(() => expect(result.current.periodosLoading).toBe(false));

    expect(result.current.periodosError).toBe(true);
    expect(result.current.periodos).toEqual([]);
  });

  it("carrega TODOS os periodos, sem truncar as 1000 linhas do PostgREST", async () => {
    estado.periodos = Array.from({ length: 2500 }, (_, i) => ({
      id: `p${i}`,
      cargo_id: `c${i % 50}`,
      salario_base: 1000 + i,
      periodicidade: "mensal",
      valido_de: "2025-01-01",
      valido_ate: null,
      motivo: null,
    }));
    const { result } = montar();
    await waitFor(() => expect(result.current.periodosLoading).toBe(false));

    expect(result.current.periodos).toHaveLength(2500);
    expect(estado.intervalos).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("uma pagina exactamente cheia obriga a pedir a seguinte (e pára na vazia)", async () => {
    estado.periodos = Array.from({ length: 1000 }, (_, i) => ({
      id: `p${i}`,
      cargo_id: "c1",
      salario_base: 1,
      periodicidade: "mensal",
      valido_de: "2025-01-01",
      valido_ate: null,
      motivo: null,
    }));
    const { result } = montar();
    await waitFor(() => expect(result.current.periodosLoading).toBe(false));

    expect(result.current.periodos).toHaveLength(1000);
    expect(estado.intervalos).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it.each([
    ["data null", null],
    ["objecto vazio", {}],
    ["sem periodo_id", { pessoas_actualizadas: 3, pessoas_sem_retribuicao: 0 }],
  ])("definirSalario com resposta invalida (%s) e erro, nao sucesso, e nao invalida", async (_n, data) => {
    estado.rpcResposta = { data, error: null };
    const { result, invalidar } = montar();
    await waitFor(() => expect(result.current.periodos).toHaveLength(2));
    invalidar.mockClear();

    await act(async () => {
      await expect(
        result.current.definirSalario("c1", 1200, "mensal", "2027-01-01", "Revisao"),
      ).rejects.toBeInstanceOf(Error);
    });
  });

  it("editar envia SO nome, horas_referencia e updated_by -- nunca salario nem periodicidade", async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.periodos).toHaveLength(2));

    await act(async () => {
      await result.current.editar({ id: "c1", nome: "Comercial", horas_referencia: 40 });
    });

    const update = estado.updates.find((u) => u.tabela === "hr_cargos");
    expect(update?.valores).toEqual({
      nome: "Comercial",
      horas_referencia: 40,
      updated_by: "autor-1",
    });
    expect(update?.valores).not.toHaveProperty("salario_base");
    expect(update?.valores).not.toHaveProperty("periodicidade");
  });

  it("criar continua a enviar salario e periodicidade", async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.periodos).toHaveLength(2));

    await act(async () => {
      await result.current.criar({
        nome: "Gestor",
        salario_base: 2000,
        periodicidade: "mensal",
        horas_referencia: null,
      });
    });

    const insert = estado.inserts.find((i) => i.tabela === "hr_cargos");
    expect(insert?.valores).toMatchObject({
      organization_id: ORG,
      nome: "Gestor",
      salario_base: 2000,
      periodicidade: "mensal",
    });
  });

  it("definirSalario chama a RPC com os cinco argumentos e invalida o que muda", async () => {
    const { result, invalidar } = montar();
    await waitFor(() => expect(result.current.periodos).toHaveLength(2));

    let resposta: unknown;
    await act(async () => {
      resposta = await result.current.definirSalario("c1", 1200, "mensal", "2027-01-01", "Revisao anual");
    });

    expect(estado.rpcs).toEqual([
      {
        fn: "rpc_hr_cargo_definir_salario",
        args: {
          p_cargo_id: "c1",
          p_salario_base: 1200,
          p_periodicidade: "mensal",
          p_valido_de: "2027-01-01",
          p_motivo: "Revisao anual",
        },
      },
    ]);
    expect(resposta).toEqual({ periodo_id: "p3", pessoas_actualizadas: 3, pessoas_sem_retribuicao: 0 });

    const chaves = invalidar.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0]);
    expect(chaves).toEqual(
      expect.arrayContaining(["hr-cargos", "hr-cargos-periodos", "hr-cargos-retribuicoes-divergentes"]),
    );
  });

  it("definirSalario propaga o erro da base (para o ecra o traduzir) e nao invalida nada", async () => {
    estado.rpcResposta = {
      data: null,
      error: { code: "HRC05", message: "cargo_periodo_no_passado: ..." },
    };
    const { result, invalidar } = montar();
    await waitFor(() => expect(result.current.periodos).toHaveLength(2));
    invalidar.mockClear();

    await act(async () => {
      await expect(
        result.current.definirSalario("c1", 1200, "mensal", "2020-01-01", "Teste"),
      ).rejects.toMatchObject({ code: "HRC05" });
    });
    expect(invalidar).not.toHaveBeenCalled();
  });
});
