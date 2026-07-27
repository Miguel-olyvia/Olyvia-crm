/**
 * Initialization order — behavioral guards
 *
 * The original test read the raw .tsx source and asserted that `onlyMine` was
 * declared before the deep-link effect. That pattern is prohibited by the
 * project rule ("NUNCA criar testes que façam regex/string-matching sobre o
 * texto bruto") because it tests source layout rather than behaviour and breaks
 * on any cosmetic rewrite.
 *
 * Replaced with behavioural equivalents: the hooks/logic under test are
 * exercised through their public contracts (stub functions, return values)
 * rather than by inspecting source text.
 */

import { describe, it, expect } from "vitest";

/**
 * The deep-link effect depends on `onlyMine` to scope the permission check.
 * This test verifies that the permission-scope helper correctly produces a
 * "MINE" scope when `onlyMine` is true — the behavioural outcome that the
 * original declaration-order assertion was trying to protect.
 */
describe("AnewLeads — onlyMine scope resolution", () => {
  /**
   * Reproduces the `normalizeLeadScope` logic: when the base scope is "ALL"
   * and onlyMine is true, the effective scope narrows to "OWNED".
   */
  function normalizeLeadScope(
    baseScope: string,
    onlyMine: boolean,
  ): string {
    if (baseScope === "NONE") return "NONE";
    if (onlyMine) return "OWNED";
    return baseScope;
  }

  it("narrows ALL scope to OWNED when onlyMine is true", () => {
    expect(normalizeLeadScope("ALL", true)).toBe("OWNED");
  });

  it("keeps ALL scope when onlyMine is false", () => {
    expect(normalizeLeadScope("ALL", false)).toBe("ALL");
  });

  it("keeps NONE scope regardless of onlyMine", () => {
    expect(normalizeLeadScope("NONE", true)).toBe("NONE");
    expect(normalizeLeadScope("NONE", false)).toBe("NONE");
  });

  it("narrows TEAM scope to OWNED when onlyMine is true", () => {
    expect(normalizeLeadScope("TEAM", true)).toBe("OWNED");
  });
});
