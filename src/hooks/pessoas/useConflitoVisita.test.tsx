import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpcMock(...args) } }));

import { ESPERA_CONFLITO_MS, useConflitoVisita } from "./useConflitoVisita";

const INICIO = "2026-10-24T09:00:00.000Z";
const FIM = "2026-10-24T10:00:00.000Z";
const ok = (data: boolean) => Promise.resolve({ data, error: null });

// Deixa correr o temporizador e as promessas pendentes.
async function passar(ms: number): Promise<void> {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

beforeEach(() => {
  rpcMock.mockReset();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("useConflitoVisita (pré-aviso de leitura)", () => {
  it("espera 400 ms antes de perguntar, e pergunta por cada recurso, com o horário e sem excluir nada", async () => {
    expect(ESPERA_CONFLITO_MS).toBe(400);
    rpcMock.mockImplementation((_nome: string, p: { p_resource_id: string }) => ok(p.p_resource_id === "r2"));
    const { result } = renderHook(() => useConflitoVisita(["r1", "r2"], INICIO, FIM));
    expect(result.current).toEqual({ emConflito: [], aVerificar: true, falhou: false });
    await passar(399);
    expect(rpcMock).not.toHaveBeenCalled();
    await passar(1);
    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(rpcMock).toHaveBeenCalledWith("check_schedule_conflict", { p_resource_id: "r1", p_start: INICIO, p_end: FIM, p_exclude_item_id: null });
    expect(result.current).toEqual({ emConflito: ["r2"], aVerificar: false, falhou: false });
  });

  it("ao alterar, exclui a própria visita", async () => {
    rpcMock.mockReturnValue(ok(false));
    renderHook(() => useConflitoVisita(["r1"], INICIO, FIM, "visita-9"));
    await passar(400);
    expect(rpcMock).toHaveBeenCalledWith("check_schedule_conflict", expect.objectContaining({ p_exclude_item_id: "visita-9" }));
  });

  it("debounce: mudar o horário dentro dos 400 ms só pergunta pelo último", async () => {
    rpcMock.mockReturnValue(ok(false));
    const { rerender } = renderHook((p: { fim: string }) => useConflitoVisita(["r1"], INICIO, p.fim), { initialProps: { fim: FIM } });
    await passar(300);
    rerender({ fim: "2026-10-24T11:00:00.000Z" });
    await passar(300);
    expect(rpcMock).not.toHaveBeenCalled();
    await passar(100);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock.mock.calls[0][1]).toMatchObject({ p_end: "2026-10-24T11:00:00.000Z" });
  });

  it("uma resposta atrasada de um pedido antigo não substitui a do pedido novo", async () => {
    let resolverAntiga: (v: { data: boolean; error: null }) => void = () => {};
    rpcMock.mockReturnValueOnce(new Promise((r) => { resolverAntiga = r; })).mockReturnValueOnce(ok(false));
    const { result, rerender } = renderHook((p: { rec: string[] }) => useConflitoVisita(p.rec, INICIO, FIM), { initialProps: { rec: ["r1"] } });
    await passar(400);
    rerender({ rec: ["r2"] });
    await passar(400);
    expect(result.current.emConflito).toEqual([]);
    await act(async () => { resolverAntiga({ data: true, error: null }); });
    expect(result.current.emConflito).toEqual([]);
  });

  it("falha aberto e nunca diz que está livre: o erro (da base ou de rede) dá falhou=true e nenhum conflito inventado", async () => {
    rpcMock.mockReturnValueOnce(Promise.resolve({ data: null, error: { message: "x" } }));
    const a = renderHook(() => useConflitoVisita(["r1"], INICIO, FIM));
    await passar(400);
    expect(a.result.current).toEqual({ emConflito: [], aVerificar: false, falhou: true });
    expect(Object.keys(a.result.current)).not.toContain("livre");

    rpcMock.mockImplementationOnce(() => Promise.reject(new Error("rede")));
    const b = renderHook(() => useConflitoVisita(["r1"], INICIO, FIM));
    await passar(400);
    expect(b.result.current).toEqual({ emConflito: [], aVerificar: false, falhou: true });
  });

  it("se só um dos recursos falha, o conflito que se leu mantém-se e avisa que falhou", async () => {
    rpcMock.mockImplementation((_n: string, p: { p_resource_id: string }) => (p.p_resource_id === "r1" ? ok(true) : Promise.reject(new Error("rede"))));
    const { result } = renderHook(() => useConflitoVisita(["r1", "r2"], INICIO, FIM));
    await passar(400);
    expect(result.current).toEqual({ emConflito: ["r1"], aVerificar: false, falhou: true });
  });

  it("sem recursos, sem horário ou com o fim antes do início, não pergunta nada", async () => {
    for (const [rec, i, f] of [[[], INICIO, FIM], [["r1"], null, FIM], [["r1"], INICIO, null], [["r1"], FIM, INICIO], [["r1"], INICIO, INICIO]] as const) {
      const { result } = renderHook(() => useConflitoVisita([...rec], i, f));
      expect(result.current).toEqual({ emConflito: [], aVerificar: false, falhou: false });
    }
    await passar(1000);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("limpa o temporizador ao desmontar", async () => {
    rpcMock.mockReturnValue(ok(false));
    const { unmount } = renderHook(() => useConflitoVisita(["r1"], INICIO, FIM));
    unmount();
    await passar(1000);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("recursos repetidos ou vazios perguntam uma só vez por recurso", async () => {
    rpcMock.mockReturnValue(ok(false));
    renderHook(() => useConflitoVisita(["r1", "r1", ""], INICIO, FIM));
    await passar(400);
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});
