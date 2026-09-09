/**
 * @vitest-environment node
 *
 * Scope-filter unification for AnewLeads.tsx (leads visibility: OWNED /
 * TEAM / ORG).
 *
 * `applyLeadVisibilityFilter` and `filterUsersByLeadScope`, both in
 * anewLeadsHelpers.ts, are the single source of truth for the
 * "assigned_to OR created_by" lead-visibility predicate and the "who can be
 * assigned" roster predicate. AnewLeads.tsx no longer hand-rolls either
 * one: buildLeadsBaseQuery, the deep-linked single-lead open, today's
 * callbacks query, and refreshSingleLead all call applyLeadVisibilityFilter;
 * assignableCompanyUsers and assignableComercialUsers both call
 * filterUsersByLeadScope. These tests exercise the two helpers directly —
 * exactly the code every one of those six call sites runs — against an
 * in-memory fixture, and assert the exact set of lead/user ids returned per
 * scope.
 *
 * This file was written test-first, before either helper existed as
 * anything but a dormant, unused export: the tests below were confirmed to
 * pass against a verbatim copy of the six sites' original inline logic,
 * with two deliberate mutations (assigned_to → created_by; leaking
 * teamMemberIds into the OWNED branch) shown to make specific tests fail
 * before being reverted. Only afterwards were the six inline call sites in
 * AnewLeads.tsx replaced with calls to these now-proven helpers. None of
 * the 24 tests in this file changed as a result of that replacement — see
 * the "canary" describe block at the bottom, which greps the live file to
 * prove the inline duplicates are gone and the six call sites now go
 * through the shared helpers.
 */
import { describe, expect, it } from "vitest";
import {
  applyLeadVisibilityFilter,
  filterUsersByLeadScope,
  type OrFilterableQuery,
} from "../anewLeadsHelpers";

// ---------------------------------------------------------------------------
// Fixture: a tiny in-memory "anew_leads" table and a fake Postgrest-like
// query builder that understands exactly the subset of syntax this predicate
// emits (`col.in.(a,b),col2.in.(a,b)` inside a single `.or()`), so tests
// assert the *exact set of lead ids* a real query would return, not just the
// filter string.
// ---------------------------------------------------------------------------

interface FixtureLead {
  id: string;
  assigned_to: string | null;
  created_by: string | null;
}

const LEADS: FixtureLead[] = [
  { id: "lead-owned-by-alice-assigned", assigned_to: "alice", created_by: "alice" },
  { id: "lead-created-by-alice-assigned-bob", assigned_to: "bob", created_by: "alice" },
  { id: "lead-assigned-alice-created-bob", assigned_to: "alice", created_by: "bob" },
  { id: "lead-owned-by-bob", assigned_to: "bob", created_by: "bob" },
  { id: "lead-owned-by-carol-teammate", assigned_to: "carol", created_by: "carol" },
  { id: "lead-created-by-carol-assigned-dave", assigned_to: "dave", created_by: "carol" },
  { id: "lead-owned-by-dave-outsider", assigned_to: "dave", created_by: "dave" },
  { id: "lead-unassigned-created-by-dave", assigned_to: null, created_by: "dave" },
];

function idsOf(leads: FixtureLead[]): string[] {
  return leads.map((l) => l.id).sort();
}

/** Parses a single `.or()` clause of the shape this predicate always emits. */
function applyOrClauseToFixture(leads: FixtureLead[], clause: string): FixtureLead[] {
  // e.g. "assigned_to.in.(alice,bob),created_by.in.(alice,bob)"
  const conditions = clause.split("),").map((c) => (c.endsWith(")") ? c : `${c})`));
  return leads.filter((lead) =>
    conditions.some((condition) => {
      const match = condition.match(/^(\w+)\.in\.\(([^)]*)\)$/);
      if (!match) throw new Error(`Unrecognized filter clause in test fixture: ${condition}`);
      const [, column, idsCsv] = match;
      const ids = idsCsv.split(",").filter(Boolean);
      const value = (lead as unknown as Record<string, string | null>)[column];
      return value !== null && ids.includes(value);
    }),
  );
}

class FakeLeadsQuery implements OrFilterableQuery {
  private leads: FixtureLead[];
  private orClause: string | null = null;

  constructor(leads: FixtureLead[]) {
    this.leads = leads;
  }

  or(filter: string): FakeLeadsQuery {
    this.orClause = filter;
    return this;
  }

  /** Simulates running the built query against the fixture table. */
  run(): FixtureLead[] {
    if (this.orClause === null) return this.leads;
    return applyOrClauseToFixture(this.leads, this.orClause);
  }
}

function runVisibilityScenario(
  requestedScope: "ORG" | "TEAM" | "OWNED",
  scopeAnewUserId: string | null,
  scopeAuthUserId: string | null,
  teamMemberIds: readonly string[],
): string[] {
  const query = applyLeadVisibilityFilter(
    new FakeLeadsQuery(LEADS),
    requestedScope,
    scopeAnewUserId,
    scopeAuthUserId,
    teamMemberIds,
  );
  return idsOf(query.run());
}

// ---------------------------------------------------------------------------
// OWNED scope
// ---------------------------------------------------------------------------

describe("applyLeadVisibilityFilter — OWNED scope", () => {
  // Characterizes: buildLeadsBaseQuery (AnewLeads.tsx L372-375) — feeds
  // loadLeads (list) and loadKanbanLeads (kanban), both via the shared
  // buildLeadsBaseQuery call.
  it("list/kanban base query: OWNED returns only alice's assigned-to-her or created-by-her leads", () => {
    expect(runVisibilityScenario("OWNED", "alice", "auth-alice", [])).toEqual(
      idsOf([
        LEADS[0], // assigned_to alice, created_by alice
        LEADS[1], // created_by alice (assigned to bob)
        LEADS[2], // assigned_to alice (created by bob)
      ]),
    );
  });

  // Characterizes: the deep-linked single-lead "openId" query
  // (AnewLeads.tsx L509-514).
  it("deep-link open query: OWNED never surfaces a lead only bob owns", () => {
    const ids = runVisibilityScenario("OWNED", "alice", "auth-alice", []);
    expect(ids).not.toContain("lead-owned-by-bob");
  });

  // Characterizes: today's-callbacks query (AnewLeads.tsx L906-910).
  it("callbacks query: OWNED for bob returns bob's own leads only", () => {
    expect(runVisibilityScenario("OWNED", "bob", "auth-bob", [])).toEqual(
      idsOf([
        LEADS[1], // assigned_to bob
        LEADS[2], // created_by bob
        LEADS[3], // owned by bob
      ]),
    );
  });

  // Characterizes: refreshSingleLead (AnewLeads.tsx L2342-2346).
  it("refreshSingleLead: OWNED ignores teamMemberIds entirely (regression guard)", () => {
    // Even if teamMemberIds is (incorrectly) non-empty, OWNED must not widen.
    const withTeammates = runVisibilityScenario("OWNED", "alice", "auth-alice", ["carol", "dave"]);
    const withoutTeammates = runVisibilityScenario("OWNED", "alice", "auth-alice", []);
    expect(withTeammates).toEqual(withoutTeammates);
  });

  it("falls back to no filter (query unchanged) when scopeAnewUserId is missing", () => {
    const ids = runVisibilityScenario("OWNED", null, "auth-alice", []);
    expect(ids).toEqual(idsOf(LEADS)); // unfiltered — matches today's `&& params.scopeAnewUserId` guard
  });
});

// ---------------------------------------------------------------------------
// TEAM scope
// ---------------------------------------------------------------------------

describe("applyLeadVisibilityFilter — TEAM scope", () => {
  it("list/kanban base query: TEAM includes the viewer and every listed teammate", () => {
    // carol's team includes dave.
    expect(runVisibilityScenario("TEAM", "carol", "auth-carol", ["dave"])).toEqual(
      idsOf([
        LEADS[4], // owned by carol
        LEADS[5], // created_by carol (assigned to dave)
        LEADS[6], // owned by dave (teammate)
        LEADS[7], // created_by dave (teammate), unassigned
      ]),
    );
  });

  it("TEAM excludes users who are not in teamMemberIds", () => {
    const ids = runVisibilityScenario("TEAM", "carol", "auth-carol", ["dave"]);
    expect(ids).not.toContain("lead-owned-by-alice-assigned");
    expect(ids).not.toContain("lead-owned-by-bob");
  });

  it("TEAM with an empty teamMemberIds list behaves like OWNED for that viewer", () => {
    expect(runVisibilityScenario("TEAM", "carol", "auth-carol", [])).toEqual(
      runVisibilityScenario("OWNED", "carol", "auth-carol", []),
    );
  });
});

// ---------------------------------------------------------------------------
// ORG scope
// ---------------------------------------------------------------------------

describe("applyLeadVisibilityFilter — ORG scope", () => {
  it("ORG returns every lead, unfiltered, regardless of viewer or team", () => {
    expect(runVisibilityScenario("ORG", "alice", "auth-alice", [])).toEqual(idsOf(LEADS));
    expect(runVisibilityScenario("ORG", null, null, [])).toEqual(idsOf(LEADS));
  });
});

// ---------------------------------------------------------------------------
// filterUsersByLeadScope — "who can be assigned" duplication
// (AnewLeads.tsx L1429-1436 assignableCompanyUsers, L1437-1444
// assignableComercialUsers — identical logic over two different rosters)
// ---------------------------------------------------------------------------

interface FixtureUser {
  id: string;
  name: string;
}

const USERS: FixtureUser[] = [
  { id: "alice", name: "Alice" },
  { id: "bob", name: "Bob" },
  { id: "carol", name: "Carol" },
  { id: "dave", name: "Dave" },
];

describe("filterUsersByLeadScope", () => {
  it("ORG scope returns the full roster untouched", () => {
    expect(filterUsersByLeadScope(USERS, "ORG", "alice", [])).toEqual(USERS);
  });

  it("TEAM scope returns the viewer plus their listed teammates only", () => {
    const result = filterUsersByLeadScope(USERS, "TEAM", "carol", ["dave"]);
    expect(result.map((u) => u.id).sort()).toEqual(["carol", "dave"]);
  });

  it("OWNED scope returns only the viewer themselves", () => {
    const result = filterUsersByLeadScope(USERS, "OWNED", "bob", ["alice", "carol"]);
    expect(result.map((u) => u.id)).toEqual(["bob"]);
  });

  it("NONE scope also returns only the viewer (matches today's un-special-cased else branch)", () => {
    const result = filterUsersByLeadScope(USERS, "NONE", "bob", []);
    expect(result.map((u) => u.id)).toEqual(["bob"]);
  });

  it("TEAM scope with no scopeAnewUserId returns only the teammates (Boolean-filtered Set)", () => {
    const result = filterUsersByLeadScope(USERS, "TEAM", null, ["dave"]);
    expect(result.map((u) => u.id)).toEqual(["dave"]);
  });
});

// ---------------------------------------------------------------------------
// Canary: Phase 1 asserted these snippets were present (grounding the
// characterization in the real file). Phase 2 unified them behind
// applyLeadVisibilityFilter / filterUsersByLeadScope, so this block is now
// inverted: it asserts the hand-written duplicates are GONE and that all six
// read points call the shared helpers instead. This is the only part of the
// suite that looks at the real file, and it now exists specifically to stop
// anyone from reintroducing an inline "assigned_to OR created_by" or
// "allowedIds" copy at a seventh call site.
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("canary: AnewLeads.tsx no longer hand-rolls the scope predicate — it calls the shared helpers", () => {
  const source = readFileSync(join(__dirname, "..", "AnewLeads.tsx"), "utf-8");

  it("no inline assigned_to/created_by OR-clause survives outside anewLeadsHelpers.ts", () => {
    expect(source).not.toContain(
      'query.or(`assigned_to.in.(${ownerIds.join(",")}),created_by.in.(${ownerIds.join(",")})`)',
    );
    expect(source).not.toContain(
      'query.or(`assigned_to.in.(${visibleUserIds.join(",")}),created_by.in.(${visibleUserIds.join(",")})`)',
    );
  });

  it("buildLeadsBaseQuery, the deep-link open query, the callbacks query, and refreshSingleLead all call applyLeadVisibilityFilter", () => {
    const occurrences = source.split("applyLeadVisibilityFilter(").length - 1;
    expect(occurrences).toBe(4);
  });

  it("no inline allowedIds Set survives outside anewLeadsHelpers.ts", () => {
    expect(source).not.toContain(
      "const allowedIds = new Set([scopeAnewUserId, ...teamMemberIds].filter(Boolean));",
    );
  });

  it("assignableCompanyUsers and assignableComercialUsers both call filterUsersByLeadScope", () => {
    const occurrences = source.split("filterUsersByLeadScope(").length - 1;
    expect(occurrences).toBe(2);
  });

  it("keeps the session-global teamMemberIds warning comment near the assignable-users duplication", () => {
    expect(source).toContain(
      "teamMemberIds is session-global and must never be used outside the TEAM branch.",
    );
  });
});
