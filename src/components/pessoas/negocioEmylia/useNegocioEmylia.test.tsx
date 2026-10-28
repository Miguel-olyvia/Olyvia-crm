import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
const m = vi.hoisted(() => {
  const ouvintes = new Set<() => void>();
  const aposGravar = new Set<() => void>();
  const estado = {
    versao: 0, leitura: { k: "a-ler" } as { k: string; t?: string }, deal: undefined as { id: number } | undefined,
    S: { deal: null as number | null, view: "negocios" }, abrir: vi.fn(), atualizar: vi.fn(), utilizador: "" as string,
  };
  estado.abrir.mockImplementation((d: { id: number }) => { estado.S.deal = d.id; estado.S.view = "negocio"; });
  return { ouvintes, aposGravar, estado };
});
vi.mock("./armazemNegocioEmylia", () => {
  const armazem = {
    S: m.estado.S, A: {}, run: vi.fn(), go: vi.fn(), abrir: m.estado.abrir, reler: vi.fn(), atualizar: m.estado.atualizar, regravar: vi.fn(), docsCrm: (id: string) => id === "uuid-crm",
    versao: () => m.estado.versao, leitura: () => m.estado.leitura, gravacao: () => ({ k: "parado" }), avisos: () => [],
    negocioDaBase: (id: string) => (id === "uuid-1" || id === "uuid-crm" ? m.estado.deal : undefined),
    subscrever: (f: () => void) => { m.ouvintes.add(f); return () => { m.ouvintes.delete(f); }; },
    aoGravar: (f: () => void) => { m.aposGravar.add(f); return () => { m.aposGravar.delete(f); }; },
  };
  return { obterArmazem: (_sb: unknown, _org: string, utilizador?: string) => { m.estado.utilizador = utilizador ?? ""; return armazem; } };
});

import { useNegocioEmylia } from "./useNegocioEmylia";

const sb = {} as SupabaseClient;
afterEach(() => {
  cleanup(); m.ouvintes.clear(); m.aposGravar.clear();
  m.estado.versao = 0; m.estado.leitura = { k: "a-ler" }; m.estado.deal = undefined; m.estado.S.deal = null; m.estado.S.view = "negocios"; m.estado.abrir.mockClear();
});

describe("useNegocioEmylia", () => {
  it("sem organização não lê nada", () => {
    const { result } = renderHook(() => useNegocioEmylia(null, "uuid-1", undefined, sb));
    expect(result.current.d).toBeUndefined();
    expect(result.current.ctx).toBeNull();
  });

  it("enquanto lê não há negócio; depois da leitura devolve-o e abre-o no motor", () => {
    const { result, rerender } = renderHook(() => useNegocioEmylia("org-1", "uuid-1", undefined, sb));
    expect(result.current.leitura.k).toBe("a-ler");
    expect(result.current.d).toBeUndefined();
    m.estado.leitura = { k: "pronto" }; m.estado.deal = { id: 1001 }; m.estado.versao++;
    act(() => { for (const f of m.ouvintes) f(); });
    rerender();
    expect(result.current.d?.id).toBe(1001);
    expect(result.current.ctx?.S.deal).toBe(1001);
    expect(m.estado.abrir).toHaveBeenCalledTimes(1);
  });

  it("um id que a base não devolveu fica sem negócio", () => {
    m.estado.leitura = { k: "pronto" }; m.estado.deal = { id: 1001 };
    const { result } = renderHook(() => useNegocioEmylia("org-1", "uuid-outro", undefined, sb));
    expect(result.current.d).toBeUndefined();
  });

  it("ao abrir a ficha pede ao armazém para atualizar, e passa-lhe o utilizador", () => {
    renderHook(() => useNegocioEmylia("org-1", "uuid-1", undefined, sb, "u1"));
    expect(m.estado.atualizar).toHaveBeenCalled();
    expect(m.estado.utilizador).toBe("u1");
  });

  it("o negócio só se abre no motor depois do render (efeito), uma vez por negócio", () => {
    m.estado.leitura = { k: "pronto" }; m.estado.deal = { id: 1001 };
    const { rerender } = renderHook(() => useNegocioEmylia("org-1", "uuid-1", undefined, sb));
    rerender(); rerender();
    expect(m.estado.abrir).toHaveBeenCalledTimes(1);
  });

  it("diz se o negócio tem documentos do CRM (só se lê)", () => {
    m.estado.leitura = { k: "pronto" }; m.estado.deal = { id: 1001 };
    expect(renderHook(() => useNegocioEmylia("org-1", "uuid-crm", undefined, sb)).result.current.docsCrm).toBe(true);
    expect(renderHook(() => useNegocioEmylia("org-1", "uuid-1", undefined, sb)).result.current.docsCrm).toBe(false);
    expect(renderHook(() => useNegocioEmylia(null, "uuid-crm", undefined, sb)).result.current.docsCrm).toBe(false);
  });

  it("regista o aviso de gravação e retira-o ao desmontar", () => {
    const aoGravar = vi.fn();
    const { unmount } = renderHook(() => useNegocioEmylia("org-1", "uuid-1", aoGravar, sb));
    expect(m.aposGravar.size).toBe(1);
    unmount();
    expect(m.aposGravar.size).toBe(0);
  });
});
