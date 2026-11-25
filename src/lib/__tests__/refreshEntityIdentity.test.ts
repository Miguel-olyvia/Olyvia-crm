import { describe, expect, it, vi } from "vitest";
import { refreshEntityIdentity } from "@/lib/refreshEntityIdentity";

describe("refreshEntityIdentity", () => {
  it("larga a entrada antiga ANTES de ler de novo, e so devolve depois de ler", async () => {
    const calls: string[] = [];
    let resolved = false;
    const cache = {
      invalidateEntities: vi.fn(() => { calls.push("invalidate"); }),
      resolveEntities: vi.fn(async () => {
        calls.push("resolve");
        await Promise.resolve();
        resolved = true;
      }),
    };
    await refreshEntityIdentity(cache, "ent-1");
    expect(calls).toEqual(["invalidate", "resolve"]);
    expect(cache.invalidateEntities).toHaveBeenCalledWith(["ent-1"]);
    expect(cache.resolveEntities).toHaveBeenCalledWith(["ent-1"]);
    expect(resolved).toBe(true);
  });

  it.each([null, undefined, ""])("sem ficha (%s) nao faz nada", async (id) => {
    const cache = { invalidateEntities: vi.fn(), resolveEntities: vi.fn() };
    await refreshEntityIdentity(cache, id);
    expect(cache.invalidateEntities).not.toHaveBeenCalled();
    expect(cache.resolveEntities).not.toHaveBeenCalled();
  });
});
