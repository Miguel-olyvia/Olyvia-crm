/**
 * export-data — "exportar apenas a seleção" org-scoping regression tests.
 *
 * ── What this guards against ────────────────────────────────────────────
 * `ids` (the explicit selection sent by Proposals.tsx / ClientContracts.tsx
 * when the user exports only the checked rows) must always be an ADDITIONAL
 * filter on top of the organization/owner scope already built into the
 * query — never a substitute for it. If a caller (a compromised client, a
 * bug, or a deliberately crafted request) sends ids that belong to another
 * organization, those ids must come back EMPTY from the export, not be
 * exported.
 *
 * These tests exercise the exact functions `exportProposals` /
 * `exportContracts` (in index.ts) use for this (`applyCommonFilters`,
 * `fetchScopedRows`, `selectInChunks`, `parseRequest`) against an in-memory
 * fake Postgrest-like query builder that enforces real filter semantics on a
 * fabricated multi-tenant dataset. They do not start `Deno.serve` and do not
 * touch a real database.
 *
 * These functions live in `./requestScoping.ts`, not `index.ts`, and were
 * moved there (no behavior change) specifically so this test file can import
 * them directly: `index.ts` imports `npm:@supabase/supabase-js` and Sentry
 * (via `_shared/sentry.ts`), which `deno test` cannot resolve in this repo
 * without a `node_modules` install (see the other `.ignore`d
 * cross-org-isolation tests in this repo, e.g. auto-schedule/index.test.ts,
 * for the same constraint). `requestScoping.ts` has no such dependency, so
 * these tests run for real instead of being permanently skipped.
 */

import {
  assert,
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyCommonFilters,
  fetchAllRows,
  fetchScopedRows,
  IN_CHUNK_SIZE,
  MAX_SELECTION_IDS,
  PAGE_SIZE,
  parseRequest,
  resolveLeadSourceLabel,
  selectInChunks,
  type AuthorizationContext,
  type ExportRequest,
} from "./requestScoping.ts";

// ── fake Postgrest-like query builder ───────────────────────────────────
//
// Applies filters against an in-memory row array using the same semantics
// PostgREST gives `.in()` / `.is()` / `.eq()` / `.order()` / `.range()`.
// Deliberately does NOT implement `.or()` — every test below uses
// scope "ORG" so `applyOwnerScope` is a no-op and never calls it.

interface FakeRow {
  id: string;
  organization_id: string;
  deleted_at: string | null;
  [key: string]: unknown;
}

class FakeQueryBuilder {
  private predicates: Array<(row: FakeRow) => boolean> = [];
  private orderKey: string | null = null;
  private rangeBounds: [number, number] | null = null;

  constructor(private rows: FakeRow[]) {}

  select(_columns?: string): this {
    return this;
  }

  in(column: string, values: unknown[]): this {
    const set = new Set(values);
    this.predicates.push((row) => set.has(row[column]));
    return this;
  }

  is(column: string, value: unknown): this {
    this.predicates.push((row) =>
      value === null ? row[column] === null || row[column] === undefined : row[column] === value,
    );
    return this;
  }

  eq(column: string, value: unknown): this {
    this.predicates.push((row) => row[column] === value);
    return this;
  }

  gte(column: string, value: unknown): this {
    this.predicates.push((row) => String(row[column]) >= String(value));
    return this;
  }

  lte(column: string, value: unknown): this {
    this.predicates.push((row) => String(row[column]) <= String(value));
    return this;
  }

  order(column: string): this {
    this.orderKey = column;
    return this;
  }

  range(from: number, to: number): this {
    this.rangeBounds = [from, to];
    return this;
  }

  private resolve(): { data: FakeRow[]; error: null } {
    let result = this.rows.filter((row) => this.predicates.every((predicate) => predicate(row)));
    if (this.orderKey) {
      const key = this.orderKey;
      result = [...result].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
    }
    if (this.rangeBounds) {
      const [from, to] = this.rangeBounds;
      result = result.slice(from, to + 1);
    }
    return { data: result, error: null };
  }

  // Makes the builder awaitable, like the real supabase-js query builder.
  then<TResult1, TResult2 = never>(
    onFulfilled?: (value: { data: FakeRow[]; error: null }) => TResult1 | PromiseLike<TResult1>,
    onRejected?: (reason: unknown) => TResult2 | PromiseLike<TResult2>,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.resolve()).then(onFulfilled, onRejected);
  }
}

function makeFakeAdmin(rows: FakeRow[]) {
  return {
    from(_table: string) {
      return new FakeQueryBuilder(rows);
    },
  };
}

// ── fixture: two organizations sharing one fake "proposals" table ──────

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function makeProposalId(org: "a" | "b", n: number): string {
  const prefix = org === "a" ? "aaaaaaaa" : "bbbbbbbb";
  const suffix = String(n).padStart(12, "0");
  return `${prefix}-1111-4111-8111-${suffix}`;
}

function buildFixtureRows(orgACount: number, orgBCount: number): FakeRow[] {
  const rows: FakeRow[] = [];
  for (let i = 0; i < orgACount; i += 1) {
    rows.push({ id: makeProposalId("a", i), organization_id: ORG_A, deleted_at: null });
  }
  for (let i = 0; i < orgBCount; i += 1) {
    rows.push({ id: makeProposalId("b", i), organization_id: ORG_B, deleted_at: null });
  }
  return rows;
}

function orgScopedAuth(exportOrgIds: string[]): AuthorizationContext {
  return {
    scope: "ORG",
    exportOrgIds,
    scopedUserIds: [],
    canIncludeSensitive: false,
  };
}

/**
 * Mirrors exportProposals'/exportContracts' `buildProposalsQuery`/
 * `buildContractsQuery` closures exactly: organization_id + deleted_at are
 * applied unconditionally, `applyCommonFilters` (which is where `ids` gets
 * chained in) runs next, and the whole thing is what `fetchScopedRows` calls
 * once per id chunk.
 */
function buildScopedQuery(
  admin: ReturnType<typeof makeFakeAdmin>,
  auth: AuthorizationContext,
  filters: ExportRequest["filters"],
) {
  return (idsChunk?: string[]) => {
    let query = admin
      .from("proposals")
      .select("id, organization_id")
      .in("organization_id", auth.exportOrgIds)
      .is("deleted_at", null)
      .order("id");
    query = applyCommonFilters(query, idsChunk ? { ...filters, ids: idsChunk } : filters);
    // auth.scope is always "ORG" in these fixtures, so applyOwnerScope would
    // be a no-op — omitted here to keep the fake builder from needing `.or()`.
    return query;
  };
}

// ── the regression itself ───────────────────────────────────────────────

Deno.test("fetchScopedRows: ids from another organization never leak into the export", async () => {
  const rows = buildFixtureRows(5, 5);
  const admin = makeFakeAdmin(rows);
  const auth = orgScopedAuth([ORG_A]);

  // A caller scoped to ORG_A sends a selection that mixes its own ids with
  // ids that actually belong to ORG_B (e.g. a tampered request body).
  const requestedIds = [
    makeProposalId("a", 0),
    makeProposalId("a", 1),
    makeProposalId("b", 0),
    makeProposalId("b", 1),
    makeProposalId("b", 2),
  ];

  const buildQuery = buildScopedQuery(admin, auth, {});
  const result = await fetchScopedRows(buildQuery, requestedIds);

  const returnedIds = result.map((row) => row.id).sort();
  assertEquals(returnedIds, [makeProposalId("a", 0), makeProposalId("a", 1)]);
  // Every returned row must genuinely belong to the caller's scoped org —
  // not merely "happen to have the right id format".
  assert(result.every((row) => row.organization_id === ORG_A));
});

Deno.test("fetchScopedRows: an all-foreign-org selection resolves to zero rows, not an error", async () => {
  const rows = buildFixtureRows(3, 3);
  const admin = makeFakeAdmin(rows);
  const auth = orgScopedAuth([ORG_A]);

  const requestedIds = [makeProposalId("b", 0), makeProposalId("b", 1), makeProposalId("b", 2)];
  const buildQuery = buildScopedQuery(admin, auth, {});
  const result = await fetchScopedRows(buildQuery, requestedIds);

  assertEquals(result, []);
});

Deno.test("fetchScopedRows: selections over 300 ids are chunked under IN_CHUNK_SIZE and return every in-scope row exactly once", async () => {
  const orgACount = 350;
  const rows = buildFixtureRows(orgACount, 10);
  const admin = makeFakeAdmin(rows);
  const auth = orgScopedAuth([ORG_A]);

  const chunkSizesSeen: number[] = [];
  const instrumentedBuild = (idsChunk?: string[]) => {
    if (idsChunk) chunkSizesSeen.push(idsChunk.length);
    return buildScopedQuery(admin, auth, {})(idsChunk);
  };

  // Selection includes every ORG_A id plus a handful of ORG_B ids mixed in,
  // simulating a large "select all" that also carries tampered/foreign ids.
  const requestedIds = [
    ...Array.from({ length: orgACount }, (_, i) => makeProposalId("a", i)),
    makeProposalId("b", 0),
    makeProposalId("b", 1),
  ];

  const result = await fetchScopedRows(instrumentedBuild, requestedIds);

  // Measured, not assumed: every chunk actually sent stays at or under the
  // documented IN_CHUNK_SIZE, and more than one chunk was needed for 352 ids.
  assert(chunkSizesSeen.length > 1, "expected selection to be split into multiple chunks");
  assert(chunkSizesSeen.every((size) => size <= IN_CHUNK_SIZE), "a chunk exceeded IN_CHUNK_SIZE");

  const returnedIds = result.map((row) => row.id);
  assertEquals(returnedIds.length, orgACount, "expected exactly the org-scoped rows, no more, no fewer");
  assertEquals(new Set(returnedIds).size, orgACount, "expected no duplicate rows across chunks");
  assert(result.every((row) => row.organization_id === ORG_A));
});

Deno.test("fetchScopedRows: duplicate ids in the selection do not produce duplicate rows", async () => {
  const rows = buildFixtureRows(2, 0);
  const admin = makeFakeAdmin(rows);
  const auth = orgScopedAuth([ORG_A]);

  const oneId = makeProposalId("a", 0);
  const requestedIds = [oneId, oneId, oneId, makeProposalId("a", 1)];
  const buildQuery = buildScopedQuery(admin, auth, {});
  const result = await fetchScopedRows(buildQuery, requestedIds);

  assertEquals(result.map((row) => row.id).sort(), [makeProposalId("a", 0), makeProposalId("a", 1)]);
});

Deno.test("fetchScopedRows: with no ids, falls back to the normal paginated fetch (unchanged behavior)", async () => {
  const rows = buildFixtureRows(3, 0);
  const admin = makeFakeAdmin(rows);
  const auth = orgScopedAuth([ORG_A]);

  const buildQuery = buildScopedQuery(admin, auth, {});
  const result = await fetchScopedRows(buildQuery, undefined);

  assertEquals(result.length, 3);
});

// ── fetchAllRows: parallel pagination ───────────────────────────────────

Deno.test("fetchAllRows: pages through more than PAGE_SIZE rows, in id order, with no duplicates", async () => {
  const total = PAGE_SIZE * 2 + 500;
  const rows: FakeRow[] = Array.from({ length: total }, (_, i) => ({
    id: String(i).padStart(8, "0"),
    organization_id: ORG_A,
    deleted_at: null,
  }));
  const admin = makeFakeAdmin(rows);
  const build = () =>
    admin
      .from("proposals")
      .select("id, organization_id")
      .in("organization_id", [ORG_A])
      .is("deleted_at", null)
      .order("id");

  const result = await fetchAllRows(build);

  assertEquals(result.length, total);
  assertEquals(new Set(result.map((r) => r.id)).size, total, "expected no duplicate rows");
  assertEquals(
    result.map((r) => r.id),
    rows.map((r) => r.id),
    "expected rows in ascending id order, matching the query's ORDER BY",
  );
});

Deno.test("fetchAllRows: a single short page (the common case) needs exactly one request", async () => {
  const rows = buildFixtureRows(3, 0);
  const admin = makeFakeAdmin(rows);
  let requestCount = 0;
  const build = () => {
    requestCount += 1;
    return admin
      .from("proposals")
      .select("id, organization_id")
      .in("organization_id", [ORG_A])
      .is("deleted_at", null)
      .order("id");
  };

  const result = await fetchAllRows(build);

  assertEquals(result.length, 3);
  // No count round trip and no second batch: the first page already came
  // back short, which is the common case (clients, contracts, proposals).
  assertEquals(requestCount, 1, "expected no extra requests once the first page is short");
});

Deno.test("fetchAllRows: fetches in doubling parallel batches (1, 2, 4...) and stops at the first short last-page", async () => {
  // 6 full pages + 1 short one, mirroring roughly what leads looks like:
  // several thousand rows spanning more than PAGE_SIZE * 4.
  const total = PAGE_SIZE * 6 + 500;
  const requestedFroms: number[] = [];
  const build = () => ({
    range: (from: number) => {
      requestedFroms.push(from);
      const length = Math.max(0, Math.min(PAGE_SIZE, total - from));
      const data = Array.from({ length }, (_, i) => ({ id: String(from + i).padStart(8, "0") }));
      return Promise.resolve({ data, error: null });
    },
  });

  const result = await fetchAllRows(build);

  assertEquals(result.length, total);
  // Batch 1: [0]. Batch 2: [1000, 2000]. Batch 3: [3000, 4000, 5000, 6000] —
  // the last of which (6000) comes back short (500 rows), stopping there.
  // No wasted requests beyond that: exactly the 7 pages the data needs.
  assertEquals(requestedFroms, [0, 1000, 2000, 3000, 4000, 5000, 6000]);
});

Deno.test("fetchAllRows: dedupes a row duplicated across the page boundary (e.g. a concurrent insert shifting rows)", async () => {
  const pageOneRows = Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: `p1-${i}` }));
  // Page two "accidentally" repeats the last row of page one — the shape a
  // concurrent insert produces between batches (see fetchAllRows' doc
  // comment in requestScoping.ts).
  const pageTwoRows = [pageOneRows[PAGE_SIZE - 1], { id: "p2-new" }];
  const build = () => ({
    range: (from: number) => {
      if (from === 0) return Promise.resolve({ data: pageOneRows, error: null });
      if (from === PAGE_SIZE) return Promise.resolve({ data: pageTwoRows, error: null });
      // Batch 2 also requests from=2*PAGE_SIZE (doubling batch size); coming
      // back empty is what stops the loop, even though the *other* page in
      // this same batch (pageTwoRows, above) was already short.
      return Promise.resolve({ data: [], error: null });
    },
  });

  const result = await fetchAllRows(build);

  assertEquals(result.length, PAGE_SIZE + 1, "the repeated row must be counted once, not twice");
  assertEquals(new Set(result.map((r) => r.id)).size, result.length);
  assertEquals(result[result.length - 1].id, "p2-new");
});

Deno.test("fetchAllRows: preserves row order across pages even when a later page resolves first", async () => {
  const total = PAGE_SIZE * 3;
  const build = () => ({
    range: async (from: number) => {
      // Deliberately resolve later pages faster than earlier ones, to prove
      // ordering comes from array position, not resolution timing.
      const delayMs = from === 0 ? 30 : from === PAGE_SIZE ? 15 : 0;
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      const length = Math.max(0, Math.min(PAGE_SIZE, total - from));
      const data = Array.from({ length }, (_, i) => ({ id: String(from + i).padStart(6, "0") }));
      return { data, error: null };
    },
  });

  const result = await fetchAllRows(build);
  const ids = result.map((r) => r.id);

  assertEquals(ids.length, total);
  assertEquals(ids, [...ids].sort(), "expected strictly ascending id order");
});

Deno.test("applyCommonFilters: ids narrow an already org-scoped query, they never widen it", async () => {
  const rows = buildFixtureRows(2, 2);
  const admin = makeFakeAdmin(rows);
  const orgAOnlyQuery = admin
    .from("proposals")
    .select("id, organization_id")
    .in("organization_id", [ORG_A])
    .is("deleted_at", null);

  // Even asking for every id in the dataset (both orgs), the org filter
  // applied before `applyCommonFilters` still wins.
  const allIds = rows.map((row) => row.id);
  const filtered = applyCommonFilters(orgAOnlyQuery, { ids: allIds });
  const { data } = await filtered;

  assertEquals(data.map((row: FakeRow) => row.organization_id), [ORG_A, ORG_A]);
});

// ── parseRequest: input validation for the `ids` filter ────────────────

Deno.test("parseRequest: accepts a valid, deduplicated list of uuid ids", () => {
  const id1 = makeProposalId("a", 0);
  const id2 = makeProposalId("a", 1);
  const parsed = parseRequest({
    module: "proposals",
    organizationId: ORG_A,
    filters: { ids: [id1, id2, id1] },
  });

  assertEquals(parsed.filters.ids?.length, 2);
  assert(parsed.filters.ids?.includes(id1));
  assert(parsed.filters.ids?.includes(id2));
});

Deno.test("parseRequest: rejects a selection containing a non-uuid entry", () => {
  assertThrows(
    () =>
      parseRequest({
        module: "proposals",
        organizationId: ORG_A,
        filters: { ids: [makeProposalId("a", 0), "not-a-uuid"] },
      }),
    Error,
    "INVALID_REQUEST",
  );
});

Deno.test("parseRequest: rejects a selection larger than MAX_SELECTION_IDS", () => {
  const tooMany = Array.from({ length: MAX_SELECTION_IDS + 1 }, (_, i) => makeProposalId("a", i));
  assertThrows(
    () =>
      parseRequest({
        module: "proposals",
        organizationId: ORG_A,
        filters: { ids: tooMany },
      }),
    Error,
    "SELECTION_TOO_LARGE",
  );
});

Deno.test("parseRequest: an omitted ids filter leaves filters.ids undefined (unchanged behavior)", () => {
  const parsed = parseRequest({
    module: "proposals",
    organizationId: ORG_A,
    filters: {},
  });

  assertEquals(parsed.filters.ids, undefined);
});

// ── exportLeads: "Origem" column source-of-truth precedence ──────────────
//
// Regression coverage for the export-data `exportLeads` bug where ~2866 of
// 6096 leads (org "nike") exported an empty "Origem" column: the query only
// ever looked up `lead_sources.name` via `source_id`, and left the column
// blank whenever `source_id` was null — even though the lead's own raw
// `source` text column had the value all along. Decided precedence (not the
// UI's, which never resolves source_id at all): lead_sources name via
// source_id first (it is the more reliable value once a real source is
// picked at creation) > raw lead.source text > empty. No translation is
// applied to either value.
Deno.test("resolveLeadSourceLabel: prefers the lead_sources name resolved via source_id when present (no regression)", () => {
  assertEquals(resolveLeadSourceLabel("META", "manual"), "META");
});

Deno.test("resolveLeadSourceLabel: falls back to the raw source text, verbatim, when source_id is unresolved", () => {
  assertEquals(resolveLeadSourceLabel(undefined, "public_form"), "public_form");
});

Deno.test("resolveLeadSourceLabel: falls back to the raw source text when it is already a display-ready value", () => {
  assertEquals(resolveLeadSourceLabel(undefined, "Website"), "Website");
});

Deno.test("resolveLeadSourceLabel: returns empty, without inventing a value, when neither source_id nor source is set", () => {
  assertEquals(resolveLeadSourceLabel(undefined, null), "");
});

