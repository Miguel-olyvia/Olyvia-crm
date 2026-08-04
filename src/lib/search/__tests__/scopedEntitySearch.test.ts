import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * These tests pin the two security invariants of the shared picker search:
 * every branch is restricted to the active organization, and every branch
 * applies its own permission scope, failing closed rather than open.
 */

interface RecordedQuery {
  table: string;
  calls: Array<{ method: string; args: unknown[] }>;
}

let recorded: RecordedQuery[] = [];
let tableRows: Record<string, any[]> = {};
let tableErrors: Record<string, { message: string }> = {};

function makeQuery(table: string) {
  const entry: RecordedQuery = { table, calls: [] };
  recorded.push(entry);

  const query: any = {};
  const chainable = ["select", "in", "is", "ilike", "eq", "not", "limit", "or"];
  chainable.forEach((method) => {
    query[method] = (...args: unknown[]) => {
      entry.calls.push({ method, args });
      return query;
    };
  });
  // The production code `await`s the builder directly, so a thenable is enough.
  query.then = (resolve: (value: { data: any[] | null; error: unknown }) => unknown) =>
    resolve(
      tableErrors[table]
        ? { data: null, error: tableErrors[table] }
        : { data: tableRows[table] ?? [], error: null },
    );
  return query;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => makeQuery(table) },
}));

let matchedEntityIds: string[] = [];
let entityLookupDelayMs = 0;
vi.mock("@/lib/clientSearch", () => ({
  escapeIlike: (s: string) => s,
  searchEntityIds: async () => {
    if (entityLookupDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, entityLookupDelayMs));
    }
    return { ids: matchedEntityIds, truncated: false };
  },
}));

const { searchDealsLeadsClients } = await import("@/lib/search/scopedEntitySearch");

type ScopeMap = Record<string, "NONE" | "OWNED" | "TEAM" | "ORG">;

function viewerWith(scopes: ScopeMap, overrides: Record<string, unknown> = {}) {
  return {
    isSystemAdmin: false,
    anewUserId: "user-a",
    authUserId: "auth-a",
    teamMemberIds: [] as string[],
    getPermissionScope: (code: string) => scopes[code] ?? "NONE",
    ...overrides,
  } as any;
}

function queriesFor(table: string) {
  return recorded.filter((q) => q.table === table);
}

function argsOf(query: RecordedQuery, method: string) {
  return query.calls.filter((c) => c.method === method).map((c) => c.args);
}

const ALL_ORG: ScopeMap = { "deals.view": "ORG", "leads.view": "ORG", "clients.view": "ORG" };

beforeEach(() => {
  recorded = [];
  tableRows = {};
  tableErrors = {};
  matchedEntityIds = [];
  entityLookupDelayMs = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("searchDealsLeadsClients — failing branches", () => {
  it("reports a failed branch instead of passing it off as no matches", async () => {
    tableErrors = { anew_leads: { message: 'column "search_text" does not exist' } };
    const onBranchErrors = vi.fn();

    await searchDealsLeadsClients({
      term: "carva",
      orgIds: ["org-1"],
      viewer: viewerWith(ALL_ORG),
      onBranchErrors,
    });

    expect(onBranchErrors).toHaveBeenCalledTimes(1);
    const [reported] = onBranchErrors.mock.calls[0] as [Array<{ branch: string; message: string }>];
    expect(reported.map((e) => e.branch)).toContain("leads.search_text");
    expect(reported[0].message).toContain("search_text");
  });

  it("keeps the working branches alive when one branch fails", async () => {
    tableErrors = { anew_leads: { message: "boom" } };
    tableRows = {
      deals: [{ id: "deal-1", title: "Remodelação", organization_id: "org-1", entity_id: null }],
    };

    const results = await searchDealsLeadsClients({
      term: "remodela",
      orgIds: ["org-1"],
      viewer: viewerWith(ALL_ORG),
    });

    // A broken leads branch must not take the deals branch down with it.
    expect(results.map((r) => r.kind)).toEqual(["deal"]);
  });

  it("degrades instead of hanging when the contact lookup is too slow, and says so", async () => {
    vi.useFakeTimers();
    try {
      entityLookupDelayMs = 60_000;
      matchedEntityIds = ["ent-1"];
      tableRows = {
        deals: [{ id: "deal-1", title: "Remodelação", organization_id: "org-1", entity_id: null }],
      };
      const onBranchErrors = vi.fn();

      const pending = searchDealsLeadsClients({
        term: "remodela",
        orgIds: ["org-1"],
        viewer: viewerWith(ALL_ORG),
        onBranchErrors,
      });
      await vi.advanceTimersByTimeAsync(10_000);
      const results = await pending;

      // The fast passes still returned; only contact-based matches are missing.
      expect(results.map((r) => r.kind)).toEqual(["deal"]);
      expect(onBranchErrors).toHaveBeenCalledTimes(1);
      const [reported] = onBranchErrors.mock.calls[0] as [Array<{ branch: string }>];
      expect(reported.map((e) => e.branch)).toContain("procura por nome/email/telefone");
      // The client branch depends on that lookup, so it never ran.
      expect(queriesFor("anew_clients")).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not report anything when every branch succeeds", async () => {
    const onBranchErrors = vi.fn();
    await searchDealsLeadsClients({
      term: "carva",
      orgIds: ["org-1"],
      viewer: viewerWith(ALL_ORG),
      onBranchErrors,
    });
    expect(onBranchErrors).not.toHaveBeenCalled();
  });
});

describe("searchDealsLeadsClients — organization isolation", () => {
  it("returns nothing and issues no query when there is no active organization", async () => {
    const results = await searchDealsLeadsClients({
      term: "silva",
      orgIds: [],
      viewer: viewerWith(ALL_ORG),
    });

    expect(results).toEqual([]);
    expect(recorded).toHaveLength(0);
  });

  it("returns nothing for a term below the minimum length", async () => {
    const results = await searchDealsLeadsClients({
      term: "a",
      orgIds: ["org-1"],
      viewer: viewerWith(ALL_ORG),
    });

    expect(results).toEqual([]);
    expect(recorded).toHaveLength(0);
  });

  it("restricts every branch to the supplied org ids", async () => {
    matchedEntityIds = ["ent-1"];
    await searchDealsLeadsClients({
      term: "silva",
      orgIds: ["org-1", "org-child"],
      viewer: viewerWith(ALL_ORG),
    });

    ["deals", "anew_leads", "anew_clients"].forEach((table) => {
      const queries = queriesFor(table);
      expect(queries.length).toBeGreaterThan(0);
      queries.forEach((query) => {
        expect(argsOf(query, "in")).toContainEqual(["organization_id", ["org-1", "org-child"]]);
      });
    });
  });
});

describe("searchDealsLeadsClients — permission scope", () => {
  it("applies no owner filter for an ORG scope", async () => {
    matchedEntityIds = ["ent-1"];
    await searchDealsLeadsClients({
      term: "silva",
      orgIds: ["org-1"],
      viewer: viewerWith(ALL_ORG),
    });

    queriesFor("deals").forEach((query) => expect(argsOf(query, "or")).toHaveLength(0));
    queriesFor("anew_clients").forEach((query) => expect(argsOf(query, "or")).toHaveLength(0));
  });

  it("restricts deals to the caller for an OWNED scope", async () => {
    await searchDealsLeadsClients({
      term: "silva",
      orgIds: ["org-1"],
      viewer: viewerWith({ ...ALL_ORG, "deals.view": "OWNED" }),
    });

    const dealQueries = queriesFor("deals");
    expect(dealQueries.length).toBeGreaterThan(0);
    dealQueries.forEach((query) => {
      const [filter] = argsOf(query, "or")[0] as [string];
      expect(filter).toContain("assigned_to.eq.user-a");
      expect(filter).toContain("created_by.eq.user-a");
    });
  });

  it("includes team members only for a TEAM scope", async () => {
    await searchDealsLeadsClients({
      term: "silva",
      orgIds: ["org-1"],
      viewer: viewerWith({ ...ALL_ORG, "deals.view": "TEAM" }, { teamMemberIds: ["user-b"] }),
    });

    const [filter] = argsOf(queriesFor("deals")[0], "or")[0] as [string];
    expect(filter).toContain("assigned_to.eq.user-b");
  });

  it("does NOT leak team members into an OWNED scope", async () => {
    await searchDealsLeadsClients({
      term: "silva",
      orgIds: ["org-1"],
      viewer: viewerWith({ ...ALL_ORG, "deals.view": "OWNED" }, { teamMemberIds: ["user-b"] }),
    });

    const [filter] = argsOf(queriesFor("deals")[0], "or")[0] as [string];
    expect(filter).not.toContain("user-b");
  });

  it("fails closed when a restricted scope has no resolvable owner id", async () => {
    await searchDealsLeadsClients({
      term: "silva",
      orgIds: ["org-1"],
      viewer: viewerWith(
        { ...ALL_ORG, "deals.view": "OWNED" },
        { anewUserId: null, authUserId: null },
      ),
    });

    const dealQueries = queriesFor("deals");
    expect(dealQueries.length).toBeGreaterThan(0);
    dealQueries.forEach((query) => {
      // Sentinel id rather than an unfiltered query.
      expect(argsOf(query, "eq")).toContainEqual(["id", "00000000-0000-0000-0000-000000000000"]);
      expect(argsOf(query, "or")).toHaveLength(0);
    });
  });

  it("skips a branch entirely when its permission scope is NONE", async () => {
    matchedEntityIds = ["ent-1"];
    await searchDealsLeadsClients({
      term: "silva",
      orgIds: ["org-1"],
      viewer: viewerWith({ "deals.view": "ORG", "leads.view": "NONE", "clients.view": "NONE" }),
    });

    expect(queriesFor("anew_leads")).toHaveLength(0);
    expect(queriesFor("anew_clients")).toHaveLength(0);
    expect(queriesFor("deals").length).toBeGreaterThan(0);
  });

  it("treats a system admin as ORG scope on every branch", async () => {
    matchedEntityIds = ["ent-1"];
    await searchDealsLeadsClients({
      term: "silva",
      orgIds: ["org-1"],
      viewer: viewerWith(
        { "deals.view": "NONE", "leads.view": "NONE", "clients.view": "NONE" },
        { isSystemAdmin: true },
      ),
    });

    expect(queriesFor("deals").length).toBeGreaterThan(0);
    expect(queriesFor("anew_leads").length).toBeGreaterThan(0);
    expect(queriesFor("anew_clients").length).toBeGreaterThan(0);
  });
});

describe("searchDealsLeadsClients — coverage of the three kinds", () => {
  it("returns deals, leads and clients together", async () => {
    matchedEntityIds = ["ent-1"];
    tableRows = {
      deals: [{ id: "deal-1", title: "Remodelação T3", organization_id: "org-1", entity_id: "ent-1" }],
      anew_leads: [{ id: "lead-1", organization_id: "org-1", entity_id: "ent-1", status: "new" }],
      anew_clients: [{ id: "client-1", organization_id: "org-1", entity_id: "ent-1", status: "active" }],
      anew_entities: [{ id: "ent-1", display_name: "Maria Silva" }],
      anew_entity_emails: [{ entity_id: "ent-1", email: "maria@example.test" }],
      anew_entity_phones: [{ entity_id: "ent-1", phone_number: "910000000" }],
    };

    const results = await searchDealsLeadsClients({
      term: "silva",
      orgIds: ["org-1"],
      viewer: viewerWith(ALL_ORG),
    });

    expect(results.map((r) => r.kind).sort()).toEqual(["client", "deal", "lead"]);

    const deal = results.find((r) => r.kind === "deal")!;
    expect(deal.name).toBe("Remodelação T3");
    expect(deal.contactName).toBe("Maria Silva");

    // A lead/client is labelled by its entity, which is what makes it findable
    // by contact name at all — the branch that used to be missing entirely.
    expect(results.find((r) => r.kind === "lead")!.name).toBe("Maria Silva");
    expect(results.find((r) => r.kind === "client")!.name).toBe("Maria Silva");
    expect(results.find((r) => r.kind === "client")!.email).toBe("maria@example.test");
  });

  it("matches leads on search_text, like the Leads page does", async () => {
    matchedEntityIds = ["ent-1"];
    await searchDealsLeadsClients({
      term: "carva",
      orgIds: ["org-1"],
      viewer: viewerWith(ALL_ORG),
    });

    const ilikeArgs = queriesFor("anew_leads").flatMap((q) => argsOf(q, "ilike"));
    expect(ilikeArgs).toContainEqual(["search_text", "%carva%"]);
  });

  it("still finds leads when no entity matched the term", async () => {
    // Regression: a lead whose linked entity is unreadable (or absent) was
    // invisible here while still listed on the Leads page.
    matchedEntityIds = [];
    tableRows = {
      anew_leads: [
        {
          id: "lead-1",
          organization_id: "org-1",
          entity_id: null,
          field_values: { first_name: "Carvalho", last_name: "Carvalho" },
        },
      ],
    };

    const results = await searchDealsLeadsClients({
      term: "carva",
      orgIds: ["org-1"],
      viewer: viewerWith(ALL_ORG),
    });

    expect(queriesFor("anew_leads")).toHaveLength(1);
    // Clients have no text column of their own, so that branch still needs a
    // matched entity and is correctly skipped.
    expect(queriesFor("anew_clients")).toHaveLength(0);

    const lead = results.find((r) => r.kind === "lead");
    expect(lead).toBeDefined();
    // Labelled from the lead's own fields, not "Lead #abc12345".
    expect(lead!.name).toBe("Carvalho Carvalho");
  });

  it("honours the requested kinds", async () => {
    matchedEntityIds = ["ent-1"];
    await searchDealsLeadsClients({
      term: "silva",
      orgIds: ["org-1"],
      kinds: ["deal"],
      viewer: viewerWith(ALL_ORG),
    });

    expect(queriesFor("anew_leads")).toHaveLength(0);
    expect(queriesFor("anew_clients")).toHaveLength(0);
  });
});

describe("searchDealsLeadsClients — restrictToEntityId", () => {
  it("narrows the deal title pass to the given entity", async () => {
    matchedEntityIds = ["ent-1", "ent-2"];
    await searchDealsLeadsClients({
      term: "silva",
      orgIds: ["org-1"],
      restrictToEntityId: "ent-1",
      viewer: viewerWith(ALL_ORG),
    });

    queriesFor("deals").forEach((query) => {
      expect(argsOf(query, "eq")).toContainEqual(["entity_id", "ent-1"]);
    });
  });

  it("intersects rather than replaces the matched entities", async () => {
    matchedEntityIds = ["ent-1", "ent-2"];
    await searchDealsLeadsClients({
      term: "silva",
      orgIds: ["org-1"],
      restrictToEntityId: "ent-2",
      viewer: viewerWith(ALL_ORG),
    });

    const clientQuery = queriesFor("anew_clients")[0];
    expect(argsOf(clientQuery, "in")).toContainEqual(["entity_id", ["ent-2"]]);
  });

  it("returns nothing for an entity that did not match the term", async () => {
    matchedEntityIds = ["ent-1"];
    await searchDealsLeadsClients({
      term: "silva",
      orgIds: ["org-1"],
      restrictToEntityId: "ent-999",
      kinds: ["client"],
      viewer: viewerWith(ALL_ORG),
    });

    expect(queriesFor("anew_clients")).toHaveLength(0);
  });
});
