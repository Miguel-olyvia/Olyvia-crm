/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  getLeadScopeUserIds,
  identityContactIsPrimary,
  mapWithConcurrency,
  normalizeLeadScope,
  reconcileRefreshedLead,
} from "../anewLeadsHelpers";

describe("anewLeadsHelpers", () => {
  it("keeps the open lead synchronized with a refreshed row", () => {
    const oldLead = { id: "lead-1", status: "new" };
    const refreshed = { id: "lead-1", status: "contacted" };

    const result = reconcileRefreshedLead([oldLead], oldLead, oldLead.id, refreshed);

    expect(result.leads).toEqual([refreshed]);
    expect(result.selectedLead).toBe(refreshed);
    expect(result.closeDetails).toBe(false);
  });

  it("closes the detail state when the open lead is no longer visible", () => {
    const selected = { id: "lead-1", status: "new" };

    const result = reconcileRefreshedLead([selected], selected, selected.id, null);

    expect(result.leads).toEqual([]);
    expect(result.selectedLead).toBeNull();
    expect(result.closeDetails).toBe(true);
  });

  it("normalizes permission scope without widening TEAM to ORG", () => {
    expect(normalizeLeadScope("TEAM", false)).toBe("TEAM");
    expect(normalizeLeadScope("ALL", false)).toBe("ORG");
    expect(normalizeLeadScope("ORG", true)).toBe("OWNED");
  });

  it("keeps internal and legacy auth ids in owned/team scope", () => {
    expect(getLeadScopeUserIds("anew-user", "auth-user", ["team-user", "anew-user"])).toEqual([
      "anew-user",
      "auth-user",
      "team-user",
    ]);
  });

  it("does not replace a reused entity's primary contact", () => {
    expect(identityContactIsPrimary(false)).toBe(false);
    expect(identityContactIsPrimary(true)).toBe(true);
  });

  it("limits concurrent workflow executions and preserves result order", async () => {
    let active = 0;
    let maxActive = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return value * 2;
    });

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(results).toEqual([
      { status: "fulfilled", value: 2 },
      { status: "fulfilled", value: 4 },
      { status: "fulfilled", value: 6 },
      { status: "fulfilled", value: 8 },
      { status: "fulfilled", value: 10 },
    ]);
  });
});
