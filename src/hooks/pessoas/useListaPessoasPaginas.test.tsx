import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, waitFor } from "@testing-library/react";
import { captureMock, definirFonte, falha, FILTROS, linha, montar, ok, params, real, rpcMock } from "./listaPessoasTestUtil";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));
vi.mock("@/lib/observability/captureFlowError", () => ({
  captureFlowError: (...args: unknown[]) => captureMock(...args),
}));

describe("useListaPessoas: paginação, recarga e erros", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    captureMock.mockReset();
    definirFonte(real("org-1"));
  });

  it("ha_mais verdadeiro pede a página seguinte com a chave e o id da última linha", async () => {
    rpcMock.mockReturnValueOnce(ok([linha("a"), linha("b", { ha_mais: true, chave_ordem: "K-b" })]));
    rpcMock.mockReturnValueOnce(ok([linha("c")]));
    const { result } = montar();
    await waitFor(() => expect(result.current.haMais).toBe(true));
    act(() => result.current.carregarMais());
    await waitFor(() => expect(result.current.linhas).toHaveLength(3));
    expect(params(1)).toMatchObject({ p_depois_de_chave: "K-b", p_depois_de_id: "b" });
    expect(result.current.haMais).toBe(false);
  });

  it("ha_mais falso dá haMais falso", async () => {
    rpcMock.mockReturnValue(ok([linha("a"), linha("b", { ha_mais: false })]));
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.haMais).toBe(false);
  });

  it("página vazia dá haMais falso e lista vazia", async () => {
    rpcMock.mockReturnValue(ok([]));
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.haMais).toBe(false);
    expect(result.current.linhas).toEqual([]);
  });

  it("repetidos entre páginas desaparecem", async () => {
    rpcMock.mockReturnValueOnce(ok([linha("a"), linha("b", { ha_mais: true })]));
    rpcMock.mockReturnValueOnce(ok([linha("b"), linha("c")]));
    const { result } = montar();
    await waitFor(() => expect(result.current.haMais).toBe(true));
    act(() => result.current.carregarMais());
    await waitFor(() => expect(result.current.linhas).toHaveLength(3));
    expect(result.current.linhas.map((l) => l.id)).toEqual(["a", "b", "c"]);
  });

  it("recarregar com duas páginas refaz as duas por ordem, com os cursores certos", async () => {
    rpcMock.mockImplementation((_n: string, p: Record<string, unknown>) =>
      p.p_depois_de_id === null
        ? ok([linha("a"), linha("b", { ha_mais: true, chave_ordem: "K-b" })])
        : ok([linha("c")]));
    const { result } = montar();
    await waitFor(() => expect(result.current.haMais).toBe(true));
    act(() => result.current.carregarMais());
    await waitFor(() => expect(result.current.linhas).toHaveLength(3));
    rpcMock.mockClear();
    act(() => result.current.recarregar());
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    expect(params(0)).toMatchObject({ p_depois_de_chave: null, p_depois_de_id: null });
    expect(params(1)).toMatchObject({ p_depois_de_chave: "K-b", p_depois_de_id: "b" });
  });

  it("recarga falhada com linhas retidas: isError, sem erroSemDados, linhas mantidas", async () => {
    rpcMock.mockReturnValueOnce(ok([linha("a")]));
    rpcMock.mockReturnValueOnce(falha("NG008"));
    const { result } = montar();
    await waitFor(() => expect(result.current.linhas).toHaveLength(1));
    expect(result.current.erroSemDados).toBe(false);
    act(() => result.current.recarregar());
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.erroSemDados).toBe(false);
    expect(result.current.linhas).toHaveLength(1);
    expect(result.current.erroAoCarregarMais).toBeNull();
  });

  it("falha na primeira carga: erroSemDados", async () => {
    rpcMock.mockReturnValue(falha("NG008"));
    const { result } = montar();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.erroSemDados).toBe(true);
  });

  it("erroAoCarregarMais desaparece enquanto se repete o carregar mais", async () => {
    rpcMock.mockReturnValueOnce(ok([linha("a", { ha_mais: true })]));
    rpcMock.mockReturnValueOnce(falha("NG008"));
    rpcMock.mockReturnValueOnce(new Promise(() => {}));
    const { result } = montar();
    await waitFor(() => expect(result.current.haMais).toBe(true));
    act(() => result.current.carregarMais());
    await waitFor(() => expect(result.current.erroAoCarregarMais).not.toBeNull());
    act(() => result.current.carregarMais());
    await waitFor(() => expect(result.current.isFetchingMore).toBe(true));
    expect(result.current.erroAoCarregarMais).toBeNull();
  });

  it("ordem nome: cursor com chave vazia e com maiúsculas segue tal e qual", async () => {
    rpcMock.mockReturnValueOnce(ok([linha("a", { ha_mais: true, chave_ordem: "" })]));
    rpcMock.mockReturnValueOnce(ok([linha("b", { ha_mais: true, chave_ordem: "Ana Ç" })]));
    rpcMock.mockReturnValueOnce(ok([linha("c")]));
    const { result } = montar({ ...FILTROS, ordem: "nome" });
    await waitFor(() => expect(result.current.haMais).toBe(true));
    act(() => result.current.carregarMais());
    await waitFor(() => expect(result.current.linhas).toHaveLength(2));
    expect(params(1)).toMatchObject({ p_depois_de_chave: "", p_depois_de_id: "a" });
    await waitFor(() => expect(result.current.haMais).toBe(true));
    act(() => result.current.carregarMais());
    await waitFor(() => expect(result.current.linhas).toHaveLength(3));
    expect(params(2)).toMatchObject({ p_depois_de_chave: "Ana Ç", p_depois_de_id: "b" });
  });

  it("chave_ordem null com ha_mais não gera cursor", async () => {
    rpcMock.mockReturnValue(ok([linha("a", { ha_mais: true, chave_ordem: null })]));
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.haMais).toBe(false);
    act(() => result.current.carregarMais());
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("página null não rebenta", async () => {
    rpcMock.mockReturnValue(ok(null));
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.linhas).toEqual([]);
    expect(result.current.haMais).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it("timeout da base (57014) não repete e vai uma vez para o Sentry", async () => {
    rpcMock.mockReturnValue(Promise.resolve({ data: null, error: { code: "57014", message: "statement timeout" } }));
    const { result } = montar();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(captureMock).toHaveBeenCalledTimes(1);
  });

  it("NG008 não repete e dá a chave certa", async () => {
    rpcMock.mockReturnValue(falha("NG008"));
    const { result } = montar();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(result.current.erro?.codigo).toBe("NG008");
    expect(result.current.erro?.chave).toBe("pessoasPagina.erroNeg.ng008");
  });

  it("42501 e NG009 também não repetem", async () => {
    rpcMock.mockReturnValue(falha("42501"));
    const a = montar();
    await waitFor(() => expect(a.result.current.isError).toBe(true));
    expect(rpcMock).toHaveBeenCalledTimes(1);
    rpcMock.mockReset();
    rpcMock.mockReturnValue(falha("NG009"));
    const b = montar();
    await waitFor(() => expect(b.result.current.isError).toBe(true));
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("erro desconhecido repete no máximo 2 vezes (3 pedidos)", async () => {
    rpcMock.mockReturnValue(falha("XX000"));
    const { result } = montar();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(rpcMock).toHaveBeenCalledTimes(3);
    expect(captureMock).toHaveBeenCalledTimes(3);
    expect(result.current.erro?.codigo).toBeNull();
    expect(result.current.erro?.chave).toBe("pessoasPagina.erroNeg.generico");
  });

  it("erro ao carregar a página seguinte mantém as linhas e não é erro de primeira carga", async () => {
    rpcMock.mockReturnValueOnce(ok([linha("a", { ha_mais: true })]));
    rpcMock.mockReturnValueOnce(falha("NG008"));
    const { result } = montar();
    await waitFor(() => expect(result.current.haMais).toBe(true));
    act(() => result.current.carregarMais());
    await waitFor(() => expect(result.current.erroAoCarregarMais).not.toBeNull());
    expect(result.current.linhas).toHaveLength(1);
    expect(result.current.isError).toBe(false);
    expect(result.current.erro).toBeNull();
  });

  it("carregarMais não duplica pedidos enquanto carrega", async () => {
    let resolver: (v: unknown) => void = () => {};
    rpcMock.mockReturnValueOnce(ok([linha("a", { ha_mais: true })]));
    rpcMock.mockReturnValueOnce(new Promise((r) => { resolver = r; }));
    const { result } = montar();
    await waitFor(() => expect(result.current.haMais).toBe(true));
    act(() => {
      result.current.carregarMais();
      result.current.carregarMais();
      result.current.carregarMais();
    });
    await waitFor(() => expect(result.current.isFetchingMore).toBe(true));
    expect(rpcMock).toHaveBeenCalledTimes(2);
    await act(async () => resolver({ data: [linha("b")], error: null }));
    await waitFor(() => expect(result.current.linhas).toHaveLength(2));
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });

  it("carregarMais sem página seguinte não pede nada", async () => {
    rpcMock.mockReturnValue(ok([linha("a")]));
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.carregarMais());
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("recarregar volta a pedir a primeira página", async () => {
    rpcMock.mockReturnValue(ok([linha("a")]));
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { result.current.recarregar(); });
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    expect(params(1).p_depois_de_id).toBeNull();
  });
});
