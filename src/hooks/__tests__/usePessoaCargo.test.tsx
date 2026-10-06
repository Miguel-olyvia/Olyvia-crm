/**
 * `usePessoaCargo`: o cargo de uma pessoa ao longo do tempo (`pessoas_cargos`)
 * e o unico caminho de escrita, `rpc_hr_pessoa_mudar_cargo`.
 *
 * Supabase simulado. Nada toca em base nenhuma.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

type Leitura = { data: unknown; error: unknown };

const estado = vi.hoisted(() => ({
  linhas: [] as unknown[],
  erroLeitura: null as unknown,
  filtros: [] as Array<{ coluna: string; valor: unknown }>,
  selects: [] as Array<{ tabela: string; colunas: string }>,
  leituras: 0,
  /** Substitui a leitura (por pessoa) para controlar a ordem das respostas. */
  leitura: null as null | ((pessoaId: unknown) => Promise<Leitura>),
  escritas: [] as string[],
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
        order: () => chain,
        eq: (coluna: string, valor: unknown) => {
          estado.filtros.push({ coluna, valor });
          if (coluna === "pessoa_id") pessoaId = valor;
          return chain;
        },
        insert: () => {
          estado.escritas.push(`insert ${tabela}`);
          return chain;
        },
        update: () => {
          estado.escritas.push(`update ${tabela}`);
          return chain;
        },
        then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
          estado.leituras += 1;
          const resposta = estado.leitura
            ? estado.leitura(pessoaId)
            : Promise.resolve({
                data: estado.erroLeitura ? null : estado.linhas,
                error: estado.erroLeitura,
              });
          return resposta.then(ok, ko);
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

const captureFlowError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError }));

import { usePessoaCargo } from "@/hooks/usePessoaCargo";
import { getLocalizedFallback } from "@/utils/friendlyError";

const LINHA_ABERTA = {
  id: "l2",
  pessoa_id: "p1",
  organization_id: "org",
  cargo_id: "c2",
  valido_de: "2026-03-01",
  valido_ate: null,
  motivo: null,
};
const LINHA_ANTIGA = { ...LINHA_ABERTA, id: "l1", cargo_id: "c1", valido_de: "2025-01-01", valido_ate: "2026-03-01" };

const RESULTADO_OK = {
  cargo_anterior_id: "c2",
  cargo_id: "c3",
  desde: "2026-10-06",
  salario_antes: 1000,
  periodicidade_antes: "mensal",
  salario_depois: 1500,
  periodicidade_depois: "mensal",
  versoes_criadas: 1,
};

beforeEach(() => {
  estado.linhas = [LINHA_ABERTA, LINHA_ANTIGA];
  estado.erroLeitura = null;
  estado.filtros = [];
  estado.selects = [];
  estado.leituras = 0;
  estado.leitura = null;
  estado.escritas = [];
  estado.rpcs = [];
  estado.rpcResposta = { data: RESULTADO_OK, error: null };
  captureFlowError.mockReset();
});

describe("usePessoaCargo: leitura", () => {
  it("carrega as linhas da pessoa e sabe qual e a aberta", async () => {
    const { result } = renderHook(() => usePessoaCargo("p1", "org"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(estado.filtros).toContainEqual({ coluna: "pessoa_id", valor: "p1" });
    expect(result.current.linhas).toHaveLength(2);
    expect(result.current.aberta?.cargo_id).toBe("c2");
    expect(result.current.erroLeitura).toBe(false);
  });

  it("le pessoas_cargos so com colunas explicitas, nunca *", async () => {
    const { result } = renderHook(() => usePessoaCargo("p1", "org"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const colunas = estado.selects.find((s) => s.tabela === "pessoas_cargos")?.colunas ?? "";
    expect(colunas).not.toContain("*");
    expect(colunas.split(",").map((c) => c.trim())).toEqual([
      "id",
      "pessoa_id",
      "organization_id",
      "cargo_id",
      "valido_de",
      "valido_ate",
      "motivo",
    ]);
  });

  it("recusa de permissao (42501) devolve lista vazia, 'recusado' e NAO e erro de leitura nem vai ao Sentry", async () => {
    estado.erroLeitura = { code: "42501", message: "permission denied" };
    const { result } = renderHook(() => usePessoaCargo("p1", "org"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.linhas).toEqual([]);
    expect(result.current.recusado).toBe(true);
    expect(result.current.erroLeitura).toBe(false);
    expect(captureFlowError).not.toHaveBeenCalled();
  });

  it("falha que nao e de permissao: erroLeitura true, reportada, sem 'recusado'", async () => {
    estado.erroLeitura = { code: "XX000", message: "boom" };
    const { result } = renderHook(() => usePessoaCargo("p1", "org"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.erroLeitura).toBe(true);
    expect(result.current.recusado).toBe(false);
    expect(result.current.linhas).toEqual([]);
    expect(captureFlowError).toHaveBeenCalledTimes(1);
  });

  it("uma leitura que falha nao deixa as linhas da leitura anterior (nao mostra cargo desactualizado)", async () => {
    const { result } = renderHook(() => usePessoaCargo("p1", "org"));
    await waitFor(() => expect(result.current.linhas).toHaveLength(2));

    estado.erroLeitura = { code: "XX000", message: "boom" };
    await act(async () => {
      await result.current.recarregar();
    });
    expect(result.current.erroLeitura).toBe(true);
    expect(result.current.linhas).toEqual([]);
    expect(result.current.aberta).toBeNull();
  });

  it("uma leitura que corre bem limpa o erro de leitura anterior", async () => {
    estado.erroLeitura = { code: "XX000", message: "boom" };
    const { result } = renderHook(() => usePessoaCargo("p1", "org"));
    await waitFor(() => expect(result.current.erroLeitura).toBe(true));

    estado.erroLeitura = null;
    await act(async () => {
      await result.current.recarregar();
    });
    expect(result.current.erroLeitura).toBe(false);
    expect(result.current.linhas).toHaveLength(2);
  });

  it("sem pessoaId nao consulta nada e nao fica a carregar", async () => {
    const { result } = renderHook(() => usePessoaCargo(undefined, "org"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(estado.leituras).toBe(0);
    expect(result.current.linhas).toEqual([]);
    expect(result.current.aberta).toBeNull();
    expect(result.current.erroLeitura).toBe(false);
  });

  it("ao trocar de pessoa, a resposta ANTIGA que chega depois e ignorada", async () => {
    let resolverP1!: (v: Leitura) => void;
    const linhasP2 = [{ ...LINHA_ABERTA, id: "x", pessoa_id: "p2", cargo_id: "c9" }];
    estado.leitura = (pessoaId) =>
      pessoaId === "p1"
        ? new Promise<Leitura>((r) => {
            resolverP1 = r;
          })
        : Promise.resolve({ data: linhasP2, error: null });

    const { result, rerender } = renderHook(({ id }) => usePessoaCargo(id, "org"), {
      initialProps: { id: "p1" as string | undefined },
    });
    rerender({ id: "p2" });
    await waitFor(() => expect(result.current.aberta?.cargo_id).toBe("c9"));

    // A resposta de p1 chega tarde e NAO pode sobrepor a de p2.
    await act(async () => {
      resolverP1({ data: [LINHA_ABERTA], error: null });
    });
    expect(result.current.aberta?.cargo_id).toBe("c9");
    expect(result.current.linhas.map((l) => l.pessoa_id)).toEqual(["p2"]);
    expect(result.current.loading).toBe(false);
  });

  it("um ERRO antigo que chega depois tambem e ignorado (nao marca erro na pessoa nova)", async () => {
    let falharP1!: (v: Leitura) => void;
    estado.leitura = (pessoaId) =>
      pessoaId === "p1"
        ? new Promise<Leitura>((r) => {
            falharP1 = r;
          })
        : Promise.resolve({ data: [LINHA_ABERTA], error: null });

    const { result, rerender } = renderHook(({ id }) => usePessoaCargo(id, "org"), {
      initialProps: { id: "p1" as string | undefined },
    });
    rerender({ id: "p2" });
    await waitFor(() => expect(result.current.aberta).not.toBeNull());

    await act(async () => {
      falharP1({ data: null, error: { code: "42501", message: "permission denied" } });
    });
    expect(result.current.recusado).toBe(false);
    expect(result.current.erroLeitura).toBe(false);
    expect(result.current.aberta).not.toBeNull();
  });
});

describe("usePessoaCargo: mudarCargo", () => {
  it("chama rpc_hr_pessoa_mudar_cargo e devolve o resultado", async () => {
    const { result } = renderHook(() => usePessoaCargo("p1", "org"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let saida!: Awaited<ReturnType<typeof result.current.mudarCargo>>;
    await act(async () => {
      saida = await result.current.mudarCargo("c3", "2026-10-06", "Promocao");
    });

    expect(estado.rpcs).toEqual([
      {
        fn: "rpc_hr_pessoa_mudar_cargo",
        args: { p_pessoa_id: "p1", p_cargo_id: "c3", p_desde: "2026-10-06", p_motivo: "Promocao" },
      },
    ]);
    expect(saida.erro).toBeNull();
    expect(saida.resultado).toMatchObject({ cargo_id: "c3", versoes_criadas: 1 });
    // O hook nunca escreve por si: so a RPC.
    expect(estado.escritas).toEqual([]);
  });

  it("depois de um sucesso recarrega as linhas (e ve as novas)", async () => {
    const { result } = renderHook(() => usePessoaCargo("p1", "org"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(estado.leituras).toBe(1);

    estado.linhas = [{ ...LINHA_ABERTA, id: "l3", cargo_id: "c3", valido_de: "2026-10-06" }];
    await act(async () => {
      await result.current.mudarCargo("c3", "2026-10-06", null);
    });

    expect(estado.leituras).toBe(2);
    expect(result.current.aberta?.cargo_id).toBe("c3");
  });

  it("salario_antes NULL (primeira atribuicao, sem retribuicao anterior) e um sucesso, com o NULL preservado", async () => {
    estado.rpcResposta = {
      data: {
        ...RESULTADO_OK,
        cargo_anterior_id: null,
        salario_antes: null,
        periodicidade_antes: null,
        versoes_criadas: 0,
      },
      error: null,
    };
    const { result } = renderHook(() => usePessoaCargo("p1", "org"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let saida!: Awaited<ReturnType<typeof result.current.mudarCargo>>;
    await act(async () => {
      saida = await result.current.mudarCargo("c3", "2026-10-06", null);
    });

    expect(saida.erro).toBeNull();
    expect(saida.resultado?.salario_antes).toBeNull();
    expect(saida.resultado?.periodicidade_antes).toBeNull();
    expect(saida.resultado?.versoes_criadas).toBe(0);
  });

  it("sem motivo envia null", async () => {
    const { result } = renderHook(() => usePessoaCargo("p1", "org"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.mudarCargo("c3", "2026-10-06", "   ");
    });
    expect(estado.rpcs[0].args?.p_motivo).toBeNull();
  });

  it("pessoaId indefinido: nao chama a RPC, devolve erro e reporta (erro de programacao)", async () => {
    const { result } = renderHook(() => usePessoaCargo(undefined, "org"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let saida!: Awaited<ReturnType<typeof result.current.mudarCargo>>;
    await act(async () => {
      saida = await result.current.mudarCargo("c3", "2026-10-06", null);
    });

    expect(estado.rpcs).toEqual([]);
    expect(saida.resultado).toBeNull();
    expect(typeof saida.erro).toBe("string");
    expect(saida.erro).not.toBe("");
    expect(captureFlowError).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["data null", null],
    ["objecto vazio", {}],
    ["sem as chaves do resultado", { cargo_id: "c3" }],
    ["texto", "ok"],
  ])("resposta invalida da RPC (%s) com error nulo NAO e sucesso", async (_nome, data) => {
    estado.rpcResposta = { data, error: null };
    const { result } = renderHook(() => usePessoaCargo("p1", "org"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let saida!: Awaited<ReturnType<typeof result.current.mudarCargo>>;
    await act(async () => {
      saida = await result.current.mudarCargo("c3", "2026-10-06", null);
    });

    expect(saida.resultado).toBeNull();
    expect(typeof saida.erro).toBe("string");
    expect(saida.erro).not.toBe("");
    // E um defeito (resposta que nao devia existir): reporta-se.
    expect(captureFlowError).toHaveBeenCalled();
  });

  it("erro da base volta traduzido (HRC06) e as regras de negocio nao vao para o Sentry", async () => {
    estado.rpcResposta = {
      data: null,
      error: { code: "HRC06", message: "alteracao_posterior_existe: ha uma versao desde 2026-10-01" },
    };
    const { result } = renderHook(() => usePessoaCargo("p1", "org"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let saida!: Awaited<ReturnType<typeof result.current.mudarCargo>>;
    await act(async () => {
      saida = await result.current.mudarCargo("c3", "2026-09-01", null);
    });

    expect(saida.resultado).toBeNull();
    expect(saida.erro).toBe(getLocalizedFallback("hr.cargos.erro.alteracaoPosterior"));
    expect(captureFlowError).not.toHaveBeenCalled();
  });

  it("recusa de permissao (42501) na RPC volta como erro mas NAO vai para o Sentry", async () => {
    estado.rpcResposta = {
      data: null,
      error: { code: "42501", message: "insufficient_privilege: sem permissao" },
    };
    const { result } = renderHook(() => usePessoaCargo("p1", "org"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let saida!: Awaited<ReturnType<typeof result.current.mudarCargo>>;
    await act(async () => {
      saida = await result.current.mudarCargo("c3", "2026-10-06", null);
    });

    expect(saida.resultado).toBeNull();
    expect(typeof saida.erro).toBe("string");
    expect(saida.erro).not.toBe("");
    expect(captureFlowError).not.toHaveBeenCalled();
  });

  it("sobreposicao de periodos (23P01) volta traduzida e nao e reportada", async () => {
    estado.rpcResposta = {
      data: null,
      error: { code: "23P01", message: "pessoa_cargo_sobreposto: o periodo de 2026-01-01 a 2026-02-01 cruza-se" },
    };
    const { result } = renderHook(() => usePessoaCargo("p1", "org"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let saida!: Awaited<ReturnType<typeof result.current.mudarCargo>>;
    await act(async () => {
      saida = await result.current.mudarCargo("c3", "2026-10-06", null);
    });
    expect(saida.erro).toBe(getLocalizedFallback("hr.cargos.erro.sobreposto"));
    expect(captureFlowError).not.toHaveBeenCalled();
  });

  it("falha desconhecida e reportada e volta como texto amigavel", async () => {
    estado.rpcResposta = { data: null, error: { code: "XX000", message: "boom" } };
    const { result } = renderHook(() => usePessoaCargo("p1", "org"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let saida!: Awaited<ReturnType<typeof result.current.mudarCargo>>;
    await act(async () => {
      saida = await result.current.mudarCargo("c3", "2026-10-06", null);
    });

    expect(typeof saida.erro).toBe("string");
    expect(saida.erro).not.toBe("");
    expect(captureFlowError).toHaveBeenCalled();
  });
});
