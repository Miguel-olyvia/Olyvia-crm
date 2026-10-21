// O lixo de negócios de uma pessoa: só se lê com o filtro «Lixo» aberto, preso à pessoa e à organização, com os eventos apagado e restaurado.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { PESSOA_ID } from "./fichaFabrica";
import { captureMock, fonteReal, montarHook, ORG } from "./fichaTestUtil";
import { negociosLixoQueryKey, useNegociosNoLixo } from "./useNegociosNoLixo";

const { fromMock, chamadas } = vi.hoisted(() => ({ fromMock: vi.fn(), chamadas: [] as { tabela: string; metodo: string; args: unknown[] }[] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (...args: unknown[]) => fromMock(...args) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));

type Resposta = { data: unknown; error: unknown };
let porTabela: Record<string, Resposta>;

/** Uma consulta que regista cada passo e, ao ser esperada, devolve a resposta da tabela. */
function consulta(tabela: string) {
  const c: Record<string, unknown> = {};
  for (const metodo of ["select", "eq", "not", "in", "order", "limit"]) c[metodo] = (...args: unknown[]) => { chamadas.push({ tabela, metodo, args }); return c; };
  c.then = (resolve: (r: Resposta) => unknown, rejeitar?: (e: unknown) => unknown) => Promise.resolve(porTabela[tabela]).then(resolve, rejeitar);
  return c;
}

const NEGOCIO = { id: "n1", titulo: "Cozinha", estado: "aberto", deleted_at: "2026-10-18T10:00:00Z", assigned_to: "u1" };
const EVENTO = { id: "e1", negocio_id: "n1", tipo: "apagado", created_at: "2026-10-18T10:00:00Z" };
const chamada = (tabela: string, metodo: string) => chamadas.filter((c) => c.tabela === tabela && c.metodo === metodo).map((c) => c.args);

beforeEach(() => {
  chamadas.length = 0;
  captureMock.mockReset();
  fromMock.mockReset();
  fromMock.mockImplementation((tabela: string) => consulta(tabela));
  porTabela = { negocios: { data: [NEGOCIO], error: null }, negocio_eventos: { data: [EVENTO], error: null } };
});

describe("useNegociosNoLixo", () => {
  it("lê só os negócios no lixo da pessoa e da organização, e os eventos deles", async () => {
    const { result } = montarHook(() => useNegociosNoLixo(PESSOA_ID, true), undefined);
    await waitFor(() => expect(result.current.itens).toHaveLength(1));
    expect(chamada("negocios", "eq")).toEqual([["entity_id", PESSOA_ID], ["organization_id", ORG]]);
    expect(chamada("negocios", "not")).toEqual([["deleted_at", "is", null]]);
    expect(chamada("negocio_eventos", "in")).toContainEqual(["negocio_id", ["n1"]]);
    expect(result.current.itens[0]).toEqual({
      id: "n1", titulo: "Cozinha", estado: "aberto", apagadoEm: "2026-10-18T10:00:00Z",
      eventos: [{ id: "e1", tipo: "apagado", em: "2026-10-18T10:00:00Z" }],
    });
  });

  it("não lê nada com o filtro fechado", async () => {
    const { result } = montarHook(() => useNegociosNoLixo(PESSOA_ID, false), undefined);
    await new Promise((r) => setTimeout(r, 20));
    expect(fromMock).not.toHaveBeenCalled();
    expect(result.current.itens).toEqual([]);
  });

  it("não lê nada fora do modo real", async () => {
    montarHook(() => useNegociosNoLixo(PESSOA_ID, true), undefined, { fonte: { modo: "exemplo" } });
    await new Promise((r) => setTimeout(r, 20));
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("sem negócios no lixo não pede eventos", async () => {
    porTabela.negocios = { data: [], error: null };
    const { result } = montarHook(() => useNegociosNoLixo(PESSOA_ID, true), undefined);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.itens).toEqual([]);
    expect(fromMock).not.toHaveBeenCalledWith("negocio_eventos");
  });

  it("só aceita os eventos apagado e restaurado, e ignora linhas com forma inesperada (nada rebenta)", async () => {
    porTabela.negocio_eventos = { data: [
      EVENTO, { id: "e2", negocio_id: "n1", tipo: "restaurado", created_at: "2026-10-19T10:00:00Z" },
      { id: "e3", negocio_id: "n1", tipo: "perdeu", created_at: "2026-10-17T10:00:00Z" }, null, { id: 7 },
    ], error: null };
    const { result } = montarHook(() => useNegociosNoLixo(PESSOA_ID, true), undefined);
    await waitFor(() => expect(result.current.itens).toHaveLength(1));
    expect(result.current.itens[0].eventos.map((e) => e.tipo)).toEqual(["apagado", "restaurado"]);
  });

  it("uma falha na leitura diz que falhou (não finge que o lixo está vazio) e vai para a observabilidade", async () => {
    porTabela.negocios = { data: null, error: { code: "XX000", message: "x" } };
    const { result } = montarHook(() => useNegociosNoLixo(PESSOA_ID, true), undefined, { fonte: fonteReal() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.itens).toEqual([]);
    expect(captureMock).toHaveBeenCalled();
  });

  it("a chave leva a organização e a pessoa", () => {
    expect(negociosLixoQueryKey(ORG, PESSOA_ID)).toEqual(["negocios-lixo", ORG, PESSOA_ID]);
  });
});
