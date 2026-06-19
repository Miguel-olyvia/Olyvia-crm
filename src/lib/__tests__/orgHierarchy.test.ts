import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveRootOrgIdLogic } from "@/lib/orgHierarchy";

describe("resolveRootOrgIdLogic", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the same id when org has no parent", async () => {
    const fetchParent = vi.fn().mockResolvedValue(null);
    const result = await resolveRootOrgIdLogic("org-1", fetchParent);
    expect(result).toBe("org-1");
    expect(fetchParent).toHaveBeenCalledTimes(1);
    expect(fetchParent).toHaveBeenCalledWith("org-1");
  });

  it("walks up a normal 3-level hierarchy and returns the root", async () => {
    const parents: Record<string, string | null> = {
      child: "mid",
      mid: "root",
      root: null,
    };
    const fetchParent = vi.fn(async (id: string) => parents[id] ?? null);
    const result = await resolveRootOrgIdLogic("child", fetchParent);
    expect(result).toBe("root");
    expect(fetchParent).toHaveBeenCalledTimes(3);
  });

  it("detects a cycle (A -> B -> A), warns, and returns last valid org", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const parents: Record<string, string | null> = {
      A: "B",
      B: "A",
    };
    const fetchParent = vi.fn(async (id: string) => parents[id] ?? null);
    const result = await resolveRootOrgIdLogic("A", fetchParent);
    // We visited A, then jumped to B, then parent of B is A which is already visited.
    // Last valid org reached is B.
    expect(result).toBe("B");
    expect(warn).toHaveBeenCalled();
    // Important: it did not hang or hit the 10-hop cap
    expect(fetchParent.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("respects the 10-hop cap if the chain is longer than expected", async () => {
    let counter = 0;
    const fetchParent = vi.fn(async () => `org-${++counter}`);
    const result = await resolveRootOrgIdLogic("org-0", fetchParent);
    // Each call returns a unique parent so no cycle is detected; cap kicks in.
    expect(fetchParent).toHaveBeenCalledTimes(10);
    expect(result).toBe(`org-10`);
  });
});
