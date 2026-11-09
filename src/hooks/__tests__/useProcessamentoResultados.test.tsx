/**
 * `useProcessamentoResultados`: um periodo fechado le o que ficou gravado, em paginas de 500 (keyset por pessoa_id), e
 * NAO recalcula. `hrRpc` simulado: nada toca em base nenhuma.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

let chamadas: Array<{ fn: string; args: Record<string, unknown> | undefined }> = [];
let respostas: Array<{ data: unknown; error: unknown }> = [];

vi.mock("@/lib/hr/hrDb", () => ({
  hrRpc: (fn: string, args?: Record<string, unknown>) => {
    chamadas.push({ fn, args });
    return Promise.resolve(respostas.shift() ?? { data: [], error: null });
  },
  isPermissionError: (erro: unknown) =>
    !!erro && typeof erro === "object" && (erro as { code?: string }).code === "42501",
}));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

import { lerTodasAsPaginas, useProcessamentoResultados } from "@/hooks/useProcessamentoResultados";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const linha = (n: number) => ({
  pessoa_id: id(n), valor_hora: 5, total_bruto: 1000 + n, totais: {}, linhas: [], avisos: [],
  retribuicao_id: null, cargo_periodo_id: null, regra_salarial_id: null,
  fechado_em: "2026-11-01T10:00:00Z", fechado_por_nome: "Rita Gomes",
});
const pagina = (de: number, n: number) => Array.from({ length: n }, (_, i) => linha(de + i));

beforeEach(() => {
  chamadas = [];
  respostas = [];
});

describe("lerTodasAsPaginas", () => {
  it("menos de 500 linhas na primeira pagina: uma so chamada, com p_depois = null", async () => {
    const lerPagina = vi.fn().mockResolvedValue({ data: pagina(1, 3), error: null });
    const { linhas, erro } = await lerTodasAsPaginas(lerPagina);
    expect(erro).toBeNull();
    expect(linhas).toHaveLength(3);
    expect(lerPagina).toHaveBeenCalledTimes(1);
    expect(lerPagina).toHaveBeenCalledWith(null);
  });

  it("repete com o ULTIMO pessoa_id ate vir menos de 500", async () => {
    const lerPagina = vi
      .fn()
      .mockResolvedValueOnce({ data: pagina(1, 500), error: null })
      .mockResolvedValueOnce({ data: pagina(501, 500), error: null })
      .mockResolvedValueOnce({ data: pagina(1001, 7), error: null });
    const { linhas } = await lerTodasAsPaginas(lerPagina);
    expect(linhas).toHaveLength(1007);
    expect(lerPagina.mock.calls.map((c) => c[0])).toEqual([null, id(500), id(1000)]);
  });

  it("exactamente 500 na ultima pagina pede mais uma (que vem vazia) e acaba", async () => {
    const lerPagina = vi
      .fn()
      .mockResolvedValueOnce({ data: pagina(1, 500), error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    const { linhas } = await lerTodasAsPaginas(lerPagina);
    expect(linhas).toHaveLength(500);
    expect(lerPagina).toHaveBeenCalledTimes(2);
  });

  it("um erro a meio devolve o erro e NENHUMA linha (nunca uma lista a meio como se estivesse completa)", async () => {
    const lerPagina = vi
      .fn()
      .mockResolvedValueOnce({ data: pagina(1, 500), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "falhou" } });
    const { linhas, erro } = await lerTodasAsPaginas(lerPagina);
    expect(erro).toEqual({ message: "falhou" });
    expect(linhas).toEqual([]);
  });

  it("uma resposta que nao e lista conta como vazia", async () => {
    const { linhas, erro } = await lerTodasAsPaginas(() => Promise.resolve({ data: null, error: null }));
    expect(erro).toBeNull();
    expect(linhas).toEqual([]);
  });
});

describe("useProcessamentoResultados", () => {
  it("periodo aberto (activo = false): nao faz nenhum pedido", async () => {
    const { result } = renderHook(() => useProcessamentoResultados("per-1", false));
    expect(result.current.estado).toBe("inactivo");
    await Promise.resolve();
    expect(chamadas).toHaveLength(0);
  });

  it("periodo fechado: le pela RPC com p_periodo_id e p_depois, e indexa por pessoa", async () => {
    respostas = [{ data: pagina(1, 2), error: null }];
    const { result } = renderHook(() => useProcessamentoResultados("per-1", true));
    expect(result.current.estado).toBe("a_carregar");
    await waitFor(() => expect(result.current.estado).toBe("ok"));

    expect(chamadas).toEqual([{ fn: "rpc_hr_processamento_resultados_ler", args: { p_periodo_id: "per-1", p_depois: null } }]);
    expect(result.current.porPessoa.get(id(2))?.total_bruto).toBe(1002);
    expect(result.current.fechadoEm).toBe("2026-11-01T10:00:00Z");
    expect(result.current.fechadoPorNome).toBe("Rita Gomes");
    expect(result.current.antesDoRegisto).toBe(false);
  });

  it("mais de 500 pessoas: pagina pelo ultimo pessoa_id", async () => {
    respostas = [
      { data: pagina(1, 500), error: null },
      { data: pagina(501, 20), error: null },
    ];
    const { result } = renderHook(() => useProcessamentoResultados("per-1", true));
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    expect(chamadas.map((c) => c.args?.p_depois)).toEqual([null, id(500)]);
    expect(result.current.porPessoa.size).toBe(520);
  });

  it("zero linhas num periodo fechado = fechado antes do registo (sem numeros)", async () => {
    respostas = [{ data: [], error: null }];
    const { result } = renderHook(() => useProcessamentoResultados("per-1", true));
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    expect(result.current.antesDoRegisto).toBe(true);
    expect(result.current.porPessoa.size).toBe(0);
    expect(result.current.fechadoEm).toBeNull();
  });

  it("sem permissao (42501): estado recusado, sem linhas e sem se passar por «antes do registo»", async () => {
    respostas = [{ data: null, error: { code: "42501", message: "processamento_resultados_sem_permissao" } }];
    const { result } = renderHook(() => useProcessamentoResultados("per-1", true));
    await waitFor(() => expect(result.current.estado).toBe("recusado"));
    expect(result.current.antesDoRegisto).toBe(false);
    expect(result.current.porPessoa.size).toBe(0);
  });

  it("outra falha: estado erro, sem linhas e sem se passar por «antes do registo»", async () => {
    respostas = [{ data: null, error: { code: "XX000", message: "boom" } }];
    const { result } = renderHook(() => useProcessamentoResultados("per-1", true));
    await waitFor(() => expect(result.current.estado).toBe("erro"));
    expect(result.current.antesDoRegisto).toBe(false);
  });

  it("mudar de periodo nao mostra os resultados do anterior", async () => {
    respostas = [{ data: pagina(1, 1), error: null }];
    const { result, rerender } = renderHook(({ periodo }) => useProcessamentoResultados(periodo, true), {
      initialProps: { periodo: "per-1" },
    });
    await waitFor(() => expect(result.current.estado).toBe("ok"));

    respostas = [{ data: pagina(9, 1), error: null }];
    rerender({ periodo: "per-2" });
    expect(result.current.estado).toBe("a_carregar");
    expect(result.current.porPessoa.size).toBe(0);
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    expect([...result.current.porPessoa.keys()]).toEqual([id(9)]);
  });
});

describe("useProcessamentoResultados: as colunas do fecho chegam ao ecra", () => {
  it("as horas planeadas e realizadas e o nome gravados passam tal como a base os devolve (nada se inventa)", async () => {
    respostas = [{ data: [{ ...linha(1), planeado_minutos: 9600, realizado_minutos: 9000, pessoa_nome: "Ana Costa" }, linha(2)], error: null }];
    const { result } = renderHook(() => useProcessamentoResultados("per", true));
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    expect(result.current.porPessoa.get(id(1))).toMatchObject({ planeado_minutos: 9600, realizado_minutos: 9000, pessoa_nome: "Ana Costa" });
    // Uma linha de uma base sem as colunas continua legivel, sem minutos (os Custos tratam-na como «sem valores gravados»).
    expect(result.current.porPessoa.get(id(2))?.planeado_minutos).toBeUndefined();
  });
});
