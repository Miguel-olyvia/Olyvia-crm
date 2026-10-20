// O utilizador da sessão só se conhece depois de uma leitura: quando chega, a lista não pode recarregar sem ninguém ter pedido nada.
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { listaPessoasQueryKey } from "@/hooks/pessoas/useListaPessoas";
import { useFiltrosLista } from "./useFiltrosLista";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

describe("useFiltrosLista: o utilizador chega depois", () => {
  it("sem «Só as minhas» pedido, o utilizador a chegar não muda os filtros nem a chave da lista", () => {
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => useFiltrosLista(id), { initialProps: { id: null as string | null } });
    const antes = result.current.filtros;
    const chaveAntes = listaPessoasQueryKey("org-1", antes);
    rerender({ id: "u-rui" });
    expect(result.current.filtros).toBe(antes);
    expect(listaPessoasQueryKey("org-1", result.current.filtros)).toEqual(chaveAntes);
  });

  it("«Só as minhas» pedido antes de o utilizador se conhecer liga quando ele chega (e não antes)", () => {
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => useFiltrosLista(id), { initialProps: { id: null as string | null } });
    act(() => result.current.mudarSoMinhas(true));
    expect(result.current.soMinhas).toBe(false);
    expect(result.current.filtros.atribuidoA).toBeNull();
    rerender({ id: "u-rui" });
    expect(result.current.soMinhas).toBe(true);
    expect(result.current.filtros.atribuidoA).toBe("u-rui");
  });

  it("duplo clique rápido em «Só as minhas» volta ao estado de partida", () => {
    const { result } = renderHook(() => useFiltrosLista("u-rui"));
    act(() => { result.current.mudarSoMinhas(true); result.current.mudarSoMinhas(false); });
    expect(result.current.soMinhas).toBe(false);
    expect(result.current.filtros.atribuidoA).toBeNull();
  });
});
