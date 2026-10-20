import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { captureMock, definirFonte, esvaziar, FILTROS, linha, montar, ok, params, real, rpcMock } from "./listaPessoasTestUtil";
import { listaPessoasQueryKey, pesquisaEfetiva, useListaPessoas } from "./useListaPessoas";
import { FontePessoasContext } from "./useFontePessoas";
import type { FiltrosLista } from "./listaPessoasTipos";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));
vi.mock("@/lib/observability/captureFlowError", () => ({
  captureFlowError: (...args: unknown[]) => captureMock(...args),
}));

describe("pesquisaEfetiva", () => {
  it("menos de 2 caracteres dá null", () => {
    expect(pesquisaEfetiva("")).toBeNull();
    expect(pesquisaEfetiva("a")).toBeNull();
    expect(pesquisaEfetiva("  a  ")).toBeNull();
  });
  it("2 ou mais caracteres, aparados", () => {
    expect(pesquisaEfetiva("ab")).toBe("ab");
    expect(pesquisaEfetiva("  Ana ")).toBe("Ana");
  });
  it("corta aos 200 caracteres", () => {
    expect(pesquisaEfetiva("x".repeat(300))).toHaveLength(200);
  });
});

describe("listaPessoasQueryKey", () => {
  it("sem filtros devolve o prefixo; com filtros acrescenta-os", () => {
    expect(listaPessoasQueryKey("org-1")).toEqual(["neg-resumo-pessoas", "org-1"]);
    expect(listaPessoasQueryKey(null)).toEqual(["neg-resumo-pessoas", null]);
    expect(listaPessoasQueryKey("org-1", FILTROS)).toEqual([
      "neg-resumo-pessoas", "org-1", {
        papel: null, etapa: null, ordem: "recentes", pesquisa: null,
        atribuidoA: null, formularioId: null, ultimoResultado: null, voltou: false, atrasada: false,
      },
    ]);
  });

  it("cada filtro novo muda a chave (não partilham cache)", () => {
    const k = (sobre: Partial<FiltrosLista>) => JSON.stringify(listaPessoasQueryKey("o", { ...FILTROS, ...sobre }));
    const base = k({});
    const variantes = [
      k({ atribuidoA: "u1" }), k({ formularioId: "f1" }), k({ ultimoResultado: "naoAtendeu" }), k({ voltou: true }), k({ atrasada: true }),
    ];
    for (const v of variantes) expect(v).not.toBe(base);
    expect(new Set(variantes).size).toBe(variantes.length);
  });

  it("normaliza a pesquisa: vazia, 1 caracter e só espaços dão a mesma chave; aparar não muda a chave", () => {
    const k = (pesquisa: string) => listaPessoasQueryKey("o", { ...FILTROS, pesquisa });
    expect(k("a")).toEqual(k(""));
    expect(k("  ")).toEqual(k(""));
    expect(k(" Ana ")).toEqual(k("Ana"));
    expect(k("Ana")).not.toEqual(k("An"));
  });

  it("ignora campos desconhecidos nos filtros", () => {
    const extra = { ...FILTROS, lixo: 1 } as FiltrosLista;
    expect(listaPessoasQueryKey("o", extra)).toEqual(listaPessoasQueryKey("o", FILTROS));
  });
});

describe("useListaPessoas: filtros, fonte e estado", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    captureMock.mockReset();
    definirFonte(real("org-1"));
  });

  it("primeira página: envia sempre os 13 parâmetros, com null explícito", async () => {
    rpcMock.mockReturnValue(ok([linha("a")]));
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock.mock.calls[0][0]).toBe("neg_resumo_pessoas");
    expect(params(0)).toEqual({
      p_organization_id: "org-1", p_papel: null, p_etapa: null, p_pesquisa: null,
      p_ordem: "recentes", p_depois_de_chave: null, p_depois_de_id: null, p_limite: 100,
      p_atribuido_a: null, p_formulario_id: null, p_ultimo_resultado: null, p_voltou: null, p_atrasada: null,
    });
  });

  it("envia os filtros ligados: só as minhas, formulário, resultado, voltou e atrasada", async () => {
    rpcMock.mockReturnValue(ok([]));
    const { result } = montar({
      ...FILTROS, atribuidoA: "u-rui", formularioId: "f-1", ultimoResultado: "semContacto", voltou: true, atrasada: true,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(params(0)).toMatchObject({
      p_atribuido_a: "u-rui", p_formulario_id: "f-1", p_ultimo_resultado: "semContacto", p_voltou: true, p_atrasada: true,
    });
  });

  it("voltou e atrasada desligados vão como null (não como false: a função filtraria quem NÃO voltou)", async () => {
    rpcMock.mockReturnValue(ok([]));
    const { result } = montar({ ...FILTROS, voltou: false, atrasada: false });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(params(0).p_voltou).toBeNull();
    expect(params(0).p_atrasada).toBeNull();
  });

  it("a segunda página repete os filtros novos", async () => {
    rpcMock.mockReturnValueOnce(ok([linha("a", { ha_mais: true })]));
    rpcMock.mockReturnValueOnce(ok([linha("b")]));
    const { result } = montar({ ...FILTROS, atribuidoA: "u-rui", voltou: true });
    await waitFor(() => expect(result.current.haMais).toBe(true));
    act(() => result.current.carregarMais());
    await waitFor(() => expect(result.current.linhas).toHaveLength(2));
    expect(params(1)).toMatchObject({ p_atribuido_a: "u-rui", p_voltou: true, p_depois_de_chave: "chave-a", p_depois_de_id: "a" });
  });

  it("envia papel, etapa, ordem e pesquisa dos filtros", async () => {
    rpcMock.mockReturnValue(ok([]));
    const { result } = montar({ papel: "cliente", etapa: "emContacto", pesquisa: " Ana ", ordem: "nome" });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(params(0)).toMatchObject({ p_papel: "cliente", p_etapa: "emContacto", p_pesquisa: "Ana", p_ordem: "nome" });
  });

  it("pesquisa de 1 caracter não é enviada; de 2 é", async () => {
    rpcMock.mockReturnValue(ok([]));
    const um = montar({ ...FILTROS, pesquisa: "a" });
    await waitFor(() => expect(um.result.current.isLoading).toBe(false));
    expect(params(0).p_pesquisa).toBeNull();
    rpcMock.mockClear();
    const dois = montar({ ...FILTROS, pesquisa: "an" });
    await waitFor(() => expect(dois.result.current.isLoading).toBe(false));
    expect(params(0).p_pesquisa).toBe("an");
  });

  it("devolve as linhas já adaptadas", async () => {
    rpcMock.mockReturnValue(ok([linha("a", { nome: null, valor_em_jogo: "10.5", etapa: "xx" })]));
    const { result } = montar();
    await waitFor(() => expect(result.current.linhas).toHaveLength(1));
    expect(result.current.linhas[0]).toMatchObject({ id: "a", nome: "", valorEmJogo: 10.5, etapa: "nova" });
  });

  it("mudar de filtro reinicia a paginação", async () => {
    rpcMock.mockReturnValueOnce(ok([linha("a", { ha_mais: true })]));
    rpcMock.mockReturnValueOnce(ok([linha("z")]));
    const { result, rerender } = montar();
    await waitFor(() => expect(result.current.haMais).toBe(true));
    rerender({ ...FILTROS, ordem: "nome" });
    await waitFor(() => expect(result.current.linhas.map((l) => l.id)).toEqual(["z"]));
    expect(params(1)).toMatchObject({ p_ordem: "nome", p_depois_de_chave: null, p_depois_de_id: null });
  });

  it("mudar de organização não reaproveita os dados da anterior", async () => {
    rpcMock.mockReturnValueOnce(ok([linha("a")]));
    rpcMock.mockReturnValueOnce(new Promise(() => {}));
    const { result, rerender } = montar();
    await waitFor(() => expect(result.current.linhas).toHaveLength(1));
    definirFonte(real("org-2"));
    rerender(FILTROS);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    expect(params(1).p_organization_id).toBe("org-2");
    expect(result.current.linhas).toEqual([]);
  });

  it("em modo exemplo (omissão) não consulta nem recarrega", async () => {
    definirFonte({ modo: "exemplo" });
    const { result } = montar();
    await esvaziar();
    act(() => result.current.recarregar());
    await esvaziar();
    expect(rpcMock).not.toHaveBeenCalled();
    expect(result.current.linhas).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it("sem provider (valor por omissão) também não consulta", async () => {
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    renderHook(() => useListaPessoas(FILTROS), { wrapper });
    await esvaziar();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("envia o organizationId do contexto da fonte", async () => {
    definirFonte(real("org-ctx"));
    rpcMock.mockReturnValue(ok([]));
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(params(0).p_organization_id).toBe("org-ctx");
  });

  it("passar de real a exemplo deixa de consultar", async () => {
    rpcMock.mockReturnValue(ok([linha("a")]));
    const { result, rerender } = montar();
    await waitFor(() => expect(result.current.linhas).toHaveLength(1));
    definirFonte({ modo: "exemplo" });
    rerender(FILTROS);
    await esvaziar();
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(result.current.linhas).toEqual([]);
  });

  it("mudar de filtro com o pedido pendente: mantém as linhas antigas e marca aMostrarAnterior", async () => {
    rpcMock.mockReturnValueOnce(ok([linha("a")]));
    rpcMock.mockReturnValueOnce(new Promise(() => {}));
    const { result, rerender } = montar();
    await waitFor(() => expect(result.current.linhas).toHaveLength(1));
    expect(result.current.aMostrarAnterior).toBe(false);
    rerender({ ...FILTROS, ordem: "nome" });
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    expect(result.current.linhas.map((l) => l.id)).toEqual(["a"]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(true);
    expect(result.current.aMostrarAnterior).toBe(true);
  });

  it("pesquisa de 1 caracter depois de vazia não gera pedido novo", async () => {
    rpcMock.mockReturnValue(ok([linha("a")]));
    const { result, rerender } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    rerender({ ...FILTROS, pesquisa: "a" });
    await esvaziar();
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(result.current.aMostrarAnterior).toBe(false);
  });
});
