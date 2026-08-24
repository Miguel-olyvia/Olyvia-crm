/**
 * Regression tests for the identity cache in `useEntityIdentity`.
 *
 * `resolveEntities()` skips any entity id already in the cache — that is what
 * keeps lists from refetching the same names on every render. The cost is that
 * a write to the entity (name, email, phone, VAT) left the screen showing the
 * pre-edit values: reloading the owning list refetches its rows, but the
 * identity fields still came from this cache, so only a full page reload
 * showed the change.
 *
 * `invalidateEntities()` is the missing half. These tests lock down that:
 *
 *  1. the cache does its job — a second resolve for the same id fetches nothing;
 *  2. after invalidating, the next resolve fetches that id again;
 *  3. invalidating one id does not evict the others;
 *  4. a resolve issued in the SAME tick as the invalidation still refetches —
 *     `resolveEntities` reads a ref, not state, so an invalidation that only
 *     called setState would be invisible to it and the stale value would
 *     survive.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

/** Tables the mocked query chain was asked for, in order. */
let tablesQueried: string[] = [];

/** Rows `anew_entities` answers with, keyed by id. */
const ENTITY_ROWS: Record<string, { id: string; display_name: string; type: string }> = {
  "entity-1": { id: "entity-1", display_name: "Cliente Um", type: "person" },
  "entity-2": { id: "entity-2", display_name: "Cliente Dois", type: "person" },
};

function buildChain(table: string) {
  tablesQueried.push(table);
  const chain: any = {
    select: () => chain,
    in: (_col: string, ids: string[]) => {
      chain._ids = ids;
      return chain;
    },
    eq: () => chain,
    is: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve({ data: null }),
    then: (onFulfilled: any, onRejected: any) => {
      const data =
        table === "anew_entities"
          ? (chain._ids ?? []).map((id: string) => ENTITY_ROWS[id]).filter(Boolean)
          : [];
      return Promise.resolve({ data }).then(onFulfilled, onRejected);
    },
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => buildChain(table) },
}));

// The hook imports these; no test here exercises a NIF, so they stay inert.
vi.mock("@/lib/identity/resolveBusinessUserId", () => ({
  resolveCurrentBusinessUserId: () => Promise.resolve("user-1"),
}));
vi.mock("@/lib/nif/callFiscalEntityResolve", () => ({
  callFiscalEntityResolve: () => Promise.resolve({ data: null, error: null }),
}));
vi.mock("@/lib/nif/callNifReveal", () => ({
  callNifReveal: () => Promise.resolve({ data: null }),
  callNifRevealSingle: () => Promise.resolve(null),
}));

import { useEntityIdentity } from "@/hooks/useEntityIdentity";

/** How many times `anew_entities` was hit since the last reset. */
const entityFetches = () => tablesQueried.filter(t => t === "anew_entities").length;

beforeEach(() => {
  tablesQueried = [];
});

describe("useEntityIdentity — cache de identidades", () => {
  it("não volta a ir buscar uma entidade que já está em cache", async () => {
    const { result } = renderHook(() => useEntityIdentity());

    await act(async () => {
      await result.current.resolveEntities(["entity-1"]);
    });
    expect(entityFetches()).toBe(1);
    expect(result.current.getIdentity("entity-1")?.display_name).toBe("Cliente Um");

    await act(async () => {
      await result.current.resolveEntities(["entity-1"]);
    });
    // Continua em 1: é esta poupança que o invalidateEntities tem de conseguir
    // desfazer, senão uma edição nunca aparece no ecrã.
    expect(entityFetches()).toBe(1);
  });

  it("volta a ir buscar depois de invalidar", async () => {
    const { result } = renderHook(() => useEntityIdentity());

    await act(async () => {
      await result.current.resolveEntities(["entity-1"]);
    });
    expect(entityFetches()).toBe(1);

    act(() => {
      result.current.invalidateEntities(["entity-1"]);
    });
    expect(result.current.getIdentity("entity-1")).toBeNull();

    await act(async () => {
      await result.current.resolveEntities(["entity-1"]);
    });
    expect(entityFetches()).toBe(2);
  });

  it("invalidar uma entidade não despeja as outras", async () => {
    const { result } = renderHook(() => useEntityIdentity());

    await act(async () => {
      await result.current.resolveEntities(["entity-1", "entity-2"]);
    });
    expect(entityFetches()).toBe(1);

    act(() => {
      result.current.invalidateEntities(["entity-1"]);
    });
    expect(result.current.getIdentity("entity-1")).toBeNull();
    expect(result.current.getIdentity("entity-2")?.display_name).toBe("Cliente Dois");

    await act(async () => {
      await result.current.resolveEntities(["entity-2"]);
    });
    // A entity-2 continua em cache, portanto nenhuma ida nova.
    expect(entityFetches()).toBe(1);
  });

  it("um resolve no MESMO tick da invalidação já vê o despejo", async () => {
    const { result } = renderHook(() => useEntityIdentity());

    await act(async () => {
      await result.current.resolveEntities(["entity-1"]);
    });
    expect(entityFetches()).toBe(1);

    // Sem re-render pelo meio — é o caso real: o onClientUpdated invalida e
    // chama logo o recarregamento da lista. Se invalidateEntities só chamasse
    // setState, o resolveEntities leria o ref antigo e saltava a entidade.
    await act(async () => {
      result.current.invalidateEntities(["entity-1"]);
      await result.current.resolveEntities(["entity-1"]);
    });
    expect(entityFetches()).toBe(2);
  });

  it("ignora ids nulos e não faz nada quando nada estava em cache", async () => {
    const { result } = renderHook(() => useEntityIdentity());

    await act(async () => {
      await result.current.resolveEntities(["entity-1"]);
    });

    act(() => {
      result.current.invalidateEntities([null, undefined, "nunca-esteve-em-cache"]);
    });
    expect(result.current.getIdentity("entity-1")?.display_name).toBe("Cliente Um");

    await act(async () => {
      await result.current.resolveEntities(["entity-1"]);
    });
    expect(entityFetches()).toBe(1);
  });
});
