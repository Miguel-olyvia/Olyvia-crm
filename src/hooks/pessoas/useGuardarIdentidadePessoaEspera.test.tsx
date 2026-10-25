// Guardar a identidade só termina quando a ficha e as listas foram refeitas: senão o formulário fecha e o ecrã mostra o nome antigo.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { montarHook } from "./fichaTestUtil";
import { PESSOA_ID } from "./fichaFabrica";
import { useGuardarIdentidadePessoa } from "./useGuardarIdentidadePessoa";

const invalidarMock = vi.hoisted(() => vi.fn());
vi.mock("./invalidarPessoas", () => ({ invalidarPessoas: (...args: unknown[]) => invalidarMock(...args) }));
const selectMock = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => { const c: Record<string, unknown> = {}; c.update = () => c; c.eq = () => c; c.select = (...a: unknown[]) => selectMock(...a); return c; } },
}));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

beforeEach(() => {
  selectMock.mockReset();
  invalidarMock.mockReset();
  selectMock.mockReturnValue(Promise.resolve({ data: [{ id: PESSOA_ID, type: "person", display_name: "Ana Novo" }], error: null }));
});

describe("useGuardarIdentidadePessoa: espera pela releitura", () => {
  it("não resolve enquanto a ficha não foi refeita", async () => {
    let refeita: () => void = () => undefined;
    invalidarMock.mockReturnValue(new Promise<void>((r) => { refeita = r; }));
    const { result } = montarHook((id: string) => useGuardarIdentidadePessoa(id), PESSOA_ID);
    let terminou = false;
    let promessa: Promise<unknown> = Promise.resolve();
    act(() => {
      promessa = result.current.guardar({ tipo: "person", nomeProprio: "Ana", apelido: "Novo" }).then(() => { terminou = true; });
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(invalidarMock).toHaveBeenCalledTimes(1);
    expect(terminou).toBe(false);
    await act(async () => { refeita(); await promessa; });
    expect(terminou).toBe(true);
  });

  it("devolve o que a base devolveu depois de refazer", async () => {
    invalidarMock.mockResolvedValue(undefined);
    const { result } = montarHook((id: string) => useGuardarIdentidadePessoa(id), PESSOA_ID);
    let r;
    await act(async () => { r = await result.current.guardar({ tipo: "person", nomeProprio: "Ana", apelido: "Novo" }); });
    expect(r).toEqual({ tipo: "person", nome: "Ana Novo", empresaNome: null, mudou: true });
  });

  it("se a releitura falhar, o guardar continua a valer (a base já gravou): não lança", async () => {
    invalidarMock.mockRejectedValue(new Error("rede"));
    const { result } = montarHook((id: string) => useGuardarIdentidadePessoa(id), PESSOA_ID);
    let r: { mudou: boolean } | undefined;
    await act(async () => { r = await result.current.guardar({ tipo: "person", nomeProprio: "Ana", apelido: "Novo" }); });
    expect(r?.mudou).toBe(true);
  });

  it("se a base falhar, não refaz nada", async () => {
    selectMock.mockReturnValue(Promise.resolve({ data: null, error: { code: "NG003", message: "x" } }));
    const { result } = montarHook((id: string) => useGuardarIdentidadePessoa(id), PESSOA_ID);
    await act(async () => { await result.current.guardar({ tipo: "person", nomeProprio: "Ana", apelido: "Novo" }).catch(() => undefined); });
    expect(invalidarMock).not.toHaveBeenCalled();
  });
});
