/**
 * `useAdmissoesPipeline`: a lista do pipeline de admissoes, ligada a `rpc_hr_admissao_listar` (V3a).
 *
 * O que fecha:
 *  - a chamada leva a assinatura EXATA do desenho (`p_organization_id`, `p_estados`, `p_limite`, `p_apos_criado_em`,
 *    `p_apos_id`) e a organizacao e sempre a ativa;
 *  - o filtro por estado vira `p_estados`; sem filtro vai `null`; mudar o filtro recomeca a lista;
 *  - a paginacao e por cursor: "carregar mais" envia o cursor devolvido e junta ao que ja la esta;
 *  - os terminados mascarados chegam como `terminado` e ficam assim (sem datas);
 *  - mudar de organizacao descarta a resposta da anterior (nunca se mostram pessoas de outra organizacao);
 *  - os erros chegam em CODIGO (o ecra traduz); so um defeito vai para o Sentry; nunca `error.details`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

const captureFlowError = vi.fn();
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...a: unknown[]) => captureFlowError(...a) }));

let empresa: { activeCompany: { id: string } | null };
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => empresa }));

import { useAdmissoesPipeline, LIMITE_PIPELINE } from "@/hooks/useAdmissoesPipeline";

const item = (n: number, estado = "submetida") => ({
  convite_id: `c${n}`,
  pessoa_id: `p${n}`,
  nome: `Pessoa ${n}`,
  cargo: "Operador",
  estado,
  estado_portal: "ativo",
  valid_until: "2026-12-20T10:00:00Z",
  submetido_em: null,
  devolvida_em: null,
  atualizado_em: "2026-12-14T09:00:00Z",
});

beforeEach(() => {
  rpc.mockReset();
  captureFlowError.mockReset();
  empresa = { activeCompany: { id: "org-nike" } };
});

describe("a chamada", () => {
  it("usa a assinatura exata de rpc_hr_admissao_listar e a organizacao ativa", async () => {
    rpc.mockResolvedValue({ data: { itens: [item(1)], contadores: { submetida: 1 }, seguinte: null }, error: null });
    const { result } = renderHook(() => useAdmissoesPipeline({ estados: null }));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("rpc_hr_admissao_listar", {
      p_organization_id: "org-nike",
      p_estados: null,
      p_limite: LIMITE_PIPELINE,
      p_apos_criado_em: null,
      p_apos_id: null,
    });
    expect(result.current.itens.map((i) => i.conviteId)).toEqual(["c1"]);
    expect(result.current.contadores).toEqual({ submetida: 1 });
    expect(result.current.temMais).toBe(false);
    expect(result.current.erro).toBeNull();
  });

  it("o limite pedido cabe no teto de 100 do desenho", () => {
    expect(LIMITE_PIPELINE).toBeGreaterThan(0);
    expect(LIMITE_PIPELINE).toBeLessThanOrEqual(100);
  });

  it("sem organizacao ativa nao chama a base", async () => {
    empresa = { activeCompany: null };
    const { result } = renderHook(() => useAdmissoesPipeline({ estados: null }));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(rpc).not.toHaveBeenCalled();
    expect(result.current.itens).toEqual([]);
  });
});

describe("filtros por estado", () => {
  it("o filtro vai em p_estados e mudar de filtro recomeca a lista", async () => {
    rpc.mockResolvedValueOnce({ data: { itens: [item(1), item(2, "convidada")], contadores: {}, seguinte: null }, error: null });
    const { result, rerender } = renderHook(({ estados }) => useAdmissoesPipeline({ estados }), {
      initialProps: { estados: null as string[] | null },
    });
    await waitFor(() => expect(result.current.itens).toHaveLength(2));

    rpc.mockResolvedValueOnce({ data: { itens: [item(1)], contadores: {}, seguinte: null }, error: null });
    rerender({ estados: ["submetida"] });
    await waitFor(() => expect(result.current.itens).toHaveLength(1));
    expect(rpc).toHaveBeenLastCalledWith(
      "rpc_hr_admissao_listar",
      expect.objectContaining({ p_estados: ["submetida"], p_apos_criado_em: null, p_apos_id: null }),
    );
  });

  it("uma lista de estados nova com o MESMO conteudo nao volta a chamar a base", async () => {
    rpc.mockResolvedValue({ data: { itens: [item(1)], contadores: {}, seguinte: null }, error: null });
    const { result, rerender } = renderHook(({ estados }) => useAdmissoesPipeline({ estados }), {
      initialProps: { estados: ["submetida"] as string[] | null },
    });
    await waitFor(() => expect(result.current.carregando).toBe(false));
    rerender({ estados: ["submetida"] });
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("um filtro vazio e o mesmo que nenhum: p_estados null", async () => {
    rpc.mockResolvedValue({ data: { itens: [], contadores: {}, seguinte: null }, error: null });
    const { result } = renderHook(() => useAdmissoesPipeline({ estados: [] }));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(rpc).toHaveBeenCalledWith("rpc_hr_admissao_listar", expect.objectContaining({ p_estados: null }));
  });
});

describe("paginacao por cursor", () => {
  it("carregarMais envia o cursor devolvido e junta a pagina ao que ja la esta", async () => {
    rpc.mockResolvedValueOnce({
      data: { itens: [item(1), item(2)], contadores: {}, seguinte: { apos_criado_em: "2026-12-10T08:00:00Z", apos_id: "c2" } },
      error: null,
    });
    const { result } = renderHook(() => useAdmissoesPipeline({ estados: null }));
    await waitFor(() => expect(result.current.itens).toHaveLength(2));
    expect(result.current.temMais).toBe(true);

    rpc.mockResolvedValueOnce({ data: { itens: [item(3)], contadores: {}, seguinte: null }, error: null });
    await act(async () => {
      await result.current.carregarMais();
    });
    expect(rpc).toHaveBeenLastCalledWith(
      "rpc_hr_admissao_listar",
      expect.objectContaining({ p_apos_criado_em: "2026-12-10T08:00:00Z", p_apos_id: "c2" }),
    );
    expect(result.current.itens.map((i) => i.conviteId)).toEqual(["c1", "c2", "c3"]);
    expect(result.current.temMais).toBe(false);
  });

  it("uma pagina com um convite repetido nao o duplica", async () => {
    rpc.mockResolvedValueOnce({
      data: { itens: [item(1)], contadores: {}, seguinte: { apos_criado_em: "2026-12-10T08:00:00Z", apos_id: "c1" } },
      error: null,
    });
    const { result } = renderHook(() => useAdmissoesPipeline({ estados: null }));
    await waitFor(() => expect(result.current.itens).toHaveLength(1));
    rpc.mockResolvedValueOnce({ data: { itens: [item(1), item(2)], contadores: {}, seguinte: null }, error: null });
    await act(async () => {
      await result.current.carregarMais();
    });
    expect(result.current.itens.map((i) => i.conviteId)).toEqual(["c1", "c2"]);
  });

  it("carregarMais sem cursor nao chama a base", async () => {
    rpc.mockResolvedValue({ data: { itens: [item(1)], contadores: {}, seguinte: null }, error: null });
    const { result } = renderHook(() => useAdmissoesPipeline({ estados: null }));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    await act(async () => {
      await result.current.carregarMais();
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe("a mascara dos terminados", () => {
  it("um processo cancelado/rejeitado chega como `terminado`, sem datas, e assim fica", async () => {
    rpc.mockResolvedValue({
      data: {
        itens: [{ convite_id: "c9", pessoa_id: "p9", nome: "Rui", estado: "terminado", estado_portal: "revogado" }],
        contadores: { terminado: 1 },
        seguinte: null,
      },
      error: null,
    });
    const { result } = renderHook(() => useAdmissoesPipeline({ estados: null }));
    await waitFor(() => expect(result.current.itens).toHaveLength(1));
    expect(result.current.itens[0]).toMatchObject({ estado: "terminado", validUntil: null, submetidoEm: null, devolvidaEm: null });
  });
});

describe("a organizacao ativa manda", () => {
  it("mudar de organizacao recomeca e descarta a resposta atrasada da anterior", async () => {
    let resolverA!: (v: unknown) => void;
    rpc.mockImplementationOnce(() => new Promise((r) => { resolverA = r; }));
    const { result, rerender } = renderHook(() => useAdmissoesPipeline({ estados: null }));

    rpc.mockResolvedValueOnce({ data: { itens: [item(7)], contadores: {}, seguinte: null }, error: null });
    empresa = { activeCompany: { id: "org-outra" } };
    rerender();
    await waitFor(() => expect(result.current.itens.map((i) => i.conviteId)).toEqual(["c7"]));

    await act(async () => {
      resolverA({ data: { itens: [item(1)], contadores: {}, seguinte: null }, error: null });
    });
    expect(result.current.itens.map((i) => i.conviteId)).toEqual(["c7"]);
    expect(rpc).toHaveBeenLastCalledWith("rpc_hr_admissao_listar", expect.objectContaining({ p_organization_id: "org-outra" }));
  });
});

describe("os erros", () => {
  it.each([
    [{ code: "HRA31", message: "nao_encontrado", details: "segredo" }, "nao_encontrado"],
    [{ code: "HRA33", message: "organizacao_nao_empregadora" }, "organizacao_nao_empregadora"],
    [{ code: "42501", message: "permission denied" }, "insufficient_privilege"],
  ])("%j: devolve o codigo e nao vai para o Sentry", async (erro, codigo) => {
    rpc.mockResolvedValue({ data: null, error: erro });
    const { result } = renderHook(() => useAdmissoesPipeline({ estados: null }));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.erro).toEqual({ codigo });
    expect(result.current.itens).toEqual([]);
    expect(captureFlowError).not.toHaveBeenCalled();
  });

  it("um defeito (sem codigo conhecido) vai para o Sentry como Error sintetico, sem o corpo da base", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "57014", message: "statement timeout", details: "SELECT niss FROM x" } });
    const { result } = renderHook(() => useAdmissoesPipeline({ estados: null }));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.erro).toEqual({ codigo: null });
    expect(captureFlowError).toHaveBeenCalledTimes(1);
    const [erro, fluxo] = captureFlowError.mock.calls[0];
    expect(fluxo).toBe("hr-admissao-pipeline");
    expect(erro).toBeInstanceOf(Error);
    expect(String((erro as Error).message)).not.toContain("SELECT");
    expect(String((erro as Error).message)).not.toContain("statement timeout");
  });

  it("uma excecao de rede tambem e um defeito, e `recarregar` tenta de novo", async () => {
    rpc.mockRejectedValueOnce(new Error("Failed to fetch"));
    const { result } = renderHook(() => useAdmissoesPipeline({ estados: null }));
    await waitFor(() => expect(result.current.erro).toEqual({ codigo: null }));
    expect(captureFlowError).toHaveBeenCalledTimes(1);

    rpc.mockResolvedValueOnce({ data: { itens: [item(1)], contadores: {}, seguinte: null }, error: null });
    await act(async () => {
      result.current.recarregar();
    });
    await waitFor(() => expect(result.current.itens).toHaveLength(1));
    expect(result.current.erro).toBeNull();
  });

  it("uma falha em 'carregar mais' mantem a lista e diz o erro", async () => {
    rpc.mockResolvedValueOnce({
      data: { itens: [item(1)], contadores: {}, seguinte: { apos_criado_em: "2026-12-10T08:00:00Z", apos_id: "c1" } },
      error: null,
    });
    const { result } = renderHook(() => useAdmissoesPipeline({ estados: null }));
    await waitFor(() => expect(result.current.itens).toHaveLength(1));
    rpc.mockResolvedValueOnce({ data: null, error: { code: "HRA41", message: "limite_excedido" } });
    await act(async () => {
      await result.current.carregarMais();
    });
    expect(result.current.itens).toHaveLength(1);
    expect(result.current.erro).toEqual({ codigo: "limite_excedido" });
    expect(result.current.temMais).toBe(true);
  });
});
