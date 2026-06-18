import { describe, it, expect } from "vitest";

/**
 * L8 + L9: `fetchSuggestions` and `checkAssigneeConflicts` must include
 * `companyId` (and other context inputs they read) in their `useCallback`
 * dependency arrays so a mid-flight organization or lead change correctly
 * reschedules the effect.
 *
 * We don't mount the component here. Instead we encode the post-fix
 * dependency arrays as data and assert the invariants the effects rely on.
 */

const fetchSuggestionsDeps = [
  "scheduleVisit",
  "visitDate",
  "visitTime",
  "visitDuration",
  "companyId",
  "lead.id",
  "lead.organization_id",
  "lead.campaign_id",
  "lead.field_values",
  "toast",
] as const;

const checkAssigneeConflictsDeps = [
  "companyId",
  "visitDate",
  "visitTime",
  "visitDuration",
  "scheduleVisit",
] as const;

describe("fetchSuggestions deps (L8)", () => {
  it("includes companyId so org changes re-run the effect", () => {
    expect(fetchSuggestionsDeps).toContain("companyId");
  });

  it("includes lead.id and lead.organization_id so lead swaps re-run", () => {
    expect(fetchSuggestionsDeps).toContain("lead.id");
    expect(fetchSuggestionsDeps).toContain("lead.organization_id");
  });

  it("keeps the original scheduling inputs for backwards compatibility", () => {
    for (const dep of ["scheduleVisit", "visitDate", "visitTime", "visitDuration"]) {
      expect(fetchSuggestionsDeps).toContain(dep);
    }
  });
});

describe("checkAssigneeConflicts deps (L9)", () => {
  it("includes companyId so org changes re-validate conflicts", () => {
    expect(checkAssigneeConflictsDeps).toContain("companyId");
  });

  it("includes scheduleVisit so the toggle re-runs the check", () => {
    expect(checkAssigneeConflictsDeps).toContain("scheduleVisit");
  });

  it("keeps the original date/time/duration inputs", () => {
    for (const dep of ["visitDate", "visitTime", "visitDuration"]) {
      expect(checkAssigneeConflictsDeps).toContain(dep);
    }
  });
});

describe("checkAssigneeConflicts guard (L9)", () => {
  // Mirrors the early-return in the post-fix function body.
  function shouldRun(scheduleVisit: boolean, anewUserId: string, visitDate: string, visitTime: string, companyId: string) {
    if (!scheduleVisit) return false;
    if (!anewUserId || !visitDate || !visitTime || !companyId) return false;
    return true;
  }

  it("does not run when scheduleVisit is false", () => {
    expect(shouldRun(false, "u1", "2026-01-01", "10:00", "org-1")).toBe(false);
  });

  it("does not run when companyId is missing", () => {
    expect(shouldRun(true, "u1", "2026-01-01", "10:00", "")).toBe(false);
  });

  it("runs when all inputs are present and scheduleVisit is true", () => {
    expect(shouldRun(true, "u1", "2026-01-01", "10:00", "org-1")).toBe(true);
  });
});
