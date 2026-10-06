/**
 * `usePessoaRetribuicao` no fluxo 2: o valor base ja nao se escreve aqui.
 *
 *  - ja nao ha INSERT directo (a base recusa-o a authenticated): so
 *    `rpc_hr_retribuicao_definir_pessoal`;
 *  - `corrigir` nao envia `valor_base` nem `periodicidade` (vem do cargo);
 *  - `alterar` deixou de existir.
 *
 * Supabase simulado. Nada toca em base nenhuma.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const estado = vi.hoisted(() => ({
  versoes: [] as unknown[],
  selects: [] as Array<{ tabela: string; colunas: string }>,
  leitura: null as null | ((pessoaId: unknown) => Promise<{ data: unknown; error: unknown }>),
  inserts: [] as unknown[],
  updates: [] as Array<Record<string, unknown>>,
  rpcs: [] as Array<{ fn: string; args: Record<string, unknown> | undefined }>,
  rpcResposta: { data: null as unknown, error: null as unknown },
}));

vi.mock("@/lib/hr/hrDb", async () => {
  const actual = await vi.importActual<typeof import("@/lib/hr/hrDb")>("@/lib/hr/hrDb");
  return {
    ...actual,
    hrFrom: (tabela: string) => {
      let pessoaId: unknown;
      const chain: Record<string, unknown> = {
        select: (colunas: string) => {
          estado.selects.push({ tabela, colunas });
          return chain;
        },
        eq: (coluna: string, valor: unknown) => {
          if (coluna === "pessoa_id") pessoaId = valor;
          return chain;
        },
        is: () => chain,
        order: () => chain,
        insert: (v: unknown) => {
          estado.inserts.push(v);
          return chain;
        },
        update: (v: Record<string, unknown>) => {
          estado.updates.push(v);
          return chain;
        },
        then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
          (estado.leitura
            ? estado.leitura(pessoaId)
            : Promise.resolve({ data: estado.versoes, error: null })
          ).then(ok, ko),
      };
      return chain;
    },
    hrRpc: (fn: string, args?: Record<string, unknown>) => {
      estado.rpcs.push({ fn, args });
      return Promise.resolve(estado.rpcResposta);
    },
  };
});

vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/lib/identity/resolveBusinessUserId", () => ({
  resolveCurrentBusinessUserId: () => Promise.resolve("autor-1"),
}));

import { usePessoaRetribuicao } from "@/hooks/usePessoaRetribuicao";
import { getLocalizedFallback } from "@/utils/friendlyError";

const ABERTA = {
  id: "r1",
  pessoa_id: "p1",
  organization_id: "org",
  vinculo_id: "v1",
  valor_base: 1000,
  moeda: "EUR",
  periodicidade: "mensal",
  subsidio_alimentacao: 6,
  subsidio_alimentacao_modo: "cartao",
  duodecimos_pct: 0,
  valido_de: "2026-01-01",
  valido_ate: null,
  motivo: null,
  origem: "pessoa",
};

beforeEach(() => {
  estado.versoes = [ABERTA];
  estado.selects = [];
  estado.leitura = null;
  estado.inserts = [];
  estado.updates = [];
  estado.rpcs = [];
  estado.rpcResposta = { data: { versoes_criadas: 1 }, error: null };
});

describe("usePessoaRetribuicao (fluxo 2)", () => {
  it("definirPessoal chama a RPC certa e nao faz INSERT nem UPDATE no cliente", async () => {
    const { result } = renderHook(() => usePessoaRetribuicao("p1", "org"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let erro: string | null = "por chamar";
    await act(async () => {
      erro = await result.current.definirPessoal("2026-11-01", 7.5, "cartao", 50, "Revisao");
    });

    expect(erro).toBeNull();
    expect(estado.rpcs).toEqual([
      {
        fn: "rpc_hr_retribuicao_definir_pessoal",
        args: {
          p_pessoa_id: "p1",
          p_desde: "2026-11-01",
          p_subsidio: 7.5,
          p_subsidio_modo: "cartao",
          p_duodecimos_pct: 50,
          p_motivo: "Revisao",
        },
      },
    ]);
    expect(estado.inserts).toEqual([]);
    expect(estado.updates).toEqual([]);
  });

  it("`aberta` e a versao em vigor HOJE, nao a futura que nao tem fim (subida agendada do cargo)", async () => {
    estado.versoes = [
      { ...ABERTA, id: "r-futura", valor_base: 1050, valido_de: "2099-01-01", valido_ate: null, origem: "subida_cargo" },
      { ...ABERTA, id: "r-actual", valido_ate: "2099-01-01" },
    ];
    const { result } = renderHook(() => usePessoaRetribuicao("p1", "org"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.aberta?.id).toBe("r-actual");
  });

  it("sem nenhuma versao em vigor (so futuras), `aberta` e null", async () => {
    estado.versoes = [{ ...ABERTA, id: "r-futura", valido_de: "2099-01-01", valido_ate: null }];
    const { result } = renderHook(() => usePessoaRetribuicao("p1", "org"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.aberta).toBeNull();
  });

  it("le pessoas_retribuicoes so com colunas explicitas, nunca *", async () => {
    const { result } = renderHook(() => usePessoaRetribuicao("p1", "org"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const colunas = estado.selects.find((s) => s.tabela === "pessoas_retribuicoes")?.colunas ?? "";
    expect(colunas).not.toContain("*");
    expect(colunas.split(",").map((c) => c.trim())).toEqual([
      "id",
      "pessoa_id",
      "organization_id",
      "vinculo_id",
      "valor_base",
      "moeda",
      "periodicidade",
      "subsidio_alimentacao",
      "subsidio_alimentacao_modo",
      "duodecimos_pct",
      "valido_de",
      "valido_ate",
      "motivo",
      "origem",
      "created_at",
      "updated_at",
    ]);
  });

  it("`aberta` usa o 'hoje' da base (UTC): as 00:30 de Lisboa no verao uma versao do dia local seguinte ainda nao esta em vigor", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-01T23:30:00Z"));
    try {
      estado.versoes = [
        { ...ABERTA, id: "r-amanha", valido_de: "2026-07-02", valido_ate: null },
        { ...ABERTA, id: "r-hoje-base", valido_de: "2026-01-01", valido_ate: "2026-07-02" },
      ];
      const { result } = renderHook(() => usePessoaRetribuicao("p1", "org"));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.aberta?.id).toBe("r-hoje-base");
    } finally {
      vi.useRealTimers();
    }
  });

  it("ao trocar de pessoa, a resposta ANTIGA que chega depois e ignorada", async () => {
    let resolverP1!: (v: { data: unknown; error: unknown }) => void;
    estado.leitura = (pessoaId) =>
      pessoaId === "p1"
        ? new Promise((r) => {
            resolverP1 = r;
          })
        : Promise.resolve({ data: [{ ...ABERTA, id: "r-p2", pessoa_id: "p2" }], error: null });

    const { result, rerender } = renderHook(({ id }) => usePessoaRetribuicao(id, "org"), {
      initialProps: { id: "p1" as string | undefined },
    });
    rerender({ id: "p2" });
    await waitFor(() => expect(result.current.versoes.map((v) => v.id)).toEqual(["r-p2"]));

    await act(async () => {
      resolverP1({ data: [{ ...ABERTA, id: "r-p1" }], error: null });
    });
    expect(result.current.versoes.map((v) => v.id)).toEqual(["r-p2"]);
    expect(result.current.loading).toBe(false);
  });

  it("o hook ja nao expoe `alterar`", async () => {
    const { result } = renderHook(() => usePessoaRetribuicao("p1", "org"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).not.toHaveProperty("alterar");
  });

  it("depois de gravar recarrega as versoes", async () => {
    const { result } = renderHook(() => usePessoaRetribuicao("p1", "org"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.versoes).toHaveLength(1);

    estado.versoes = [ABERTA, { ...ABERTA, id: "r2", valido_de: "2026-11-01" }];
    await act(async () => {
      await result.current.definirPessoal("2026-11-01", null, null, null, null);
    });
    await waitFor(() => expect(result.current.versoes).toHaveLength(2));
  });

  it("erro HRC11 (sem cargo) volta traduzido", async () => {
    estado.rpcResposta = {
      data: null,
      error: { code: "HRC11", message: "retribuicao_sem_cargo: atribua primeiro um cargo" },
    };
    const { result } = renderHook(() => usePessoaRetribuicao("p1", "org"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let erro: string | null = null;
    await act(async () => {
      erro = await result.current.definirPessoal("2026-11-01", 6, "cartao", 50, null);
    });
    expect(erro).toBe(getLocalizedFallback("hr.cargos.erro.retribuicaoSemCargo"));
  });

  it("corrigir NAO envia valor_base nem periodicidade (vem do cargo)", async () => {
    const { result } = renderHook(() => usePessoaRetribuicao("p1", "org"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.corrigir("r0", {
        moeda: "EUR",
        subsidioAlimentacao: 6,
        subsidioAlimentacaoModo: "dinheiro",
        duodecimosPct: 100,
        validoDe: "2025-01-01",
        validoAte: "2026-01-01",
        motivo: "Gralha",
      });
    });

    expect(estado.updates).toHaveLength(1);
    expect(estado.updates[0]).not.toHaveProperty("valor_base");
    expect(estado.updates[0]).not.toHaveProperty("periodicidade");
    expect(estado.updates[0]).toMatchObject({
      subsidio_alimentacao: 6,
      subsidio_alimentacao_modo: "dinheiro",
      duodecimos_pct: 100,
      valido_de: "2025-01-01",
      valido_ate: "2026-01-01",
      updated_by: "autor-1",
    });
  });
});
