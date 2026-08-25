/**
 * Request parsing and org/owner-scoped query composition for export-data.
 *
 * Deliberately dependency-free (no npm:/esm.sh imports, no Supabase client,
 * no Sentry) besides ./exportConfig.ts, which is itself dependency-free.
 * That is what lets index.test.ts import these functions directly and
 * exercise the "ids never widen the org/owner scope" guarantee with an
 * in-memory fake query builder, without pulling in `deno test`'s
 * node_modules/network requirements for @supabase/supabase-js and
 * @sentry/deno that index.ts needs at runtime.
 */

import { isSupportedExportModule, type ExportModule } from "./exportConfig.ts";

export const MAX_EXPORT_ROWS = 10_000;
// Selection exports ("exportar apenas a seleção") send an explicit id list
// instead of relying on the module's normal filters. Bounded independently of
// MAX_EXPORT_ROWS so a request with more ids than could ever legitimately be
// exported fails fast with a clear error instead of an expensive query.
export const MAX_SELECTION_IDS = MAX_EXPORT_ROWS;

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ScopeLevel = "NONE" | "OWNED" | "TEAM" | "ORG";

export interface ExportRequest {
  module: ExportModule;
  organizationId: string;
  includeSensitive: boolean;
  filters: {
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    assignedTo?: string;
    onlyMine?: boolean;
    /**
     * Explicit id allow-list for "exportar apenas a seleção". This is always
     * an ADDITIONAL filter layered on top of the org/owner scope built by
     * authorizeExport — see buildProposalsQuery/buildContractsQuery in
     * index.ts, which apply organization_id, deleted_at and owner scope
     * before ever chaining this in. Ids outside the caller's scope simply
     * match zero rows; they are never treated as a substitute for that
     * scope.
     */
    ids?: string[];
  };
}

export interface AuthorizationContext {
  scope: ScopeLevel;
  exportOrgIds: string[];
  scopedUserIds: string[];
  canIncludeSensitive: boolean;
}

export function parseRequest(input: unknown): ExportRequest {
  if (!input || typeof input !== "object") throw new Error("INVALID_REQUEST");
  const body = input as Record<string, unknown>;
  const module = typeof body.module === "string" ? body.module : "";
  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";

  if (!isSupportedExportModule(module) || !UUID_PATTERN.test(organizationId)) {
    throw new Error("INVALID_REQUEST");
  }

  const filtersInput =
    body.filters && typeof body.filters === "object"
      ? (body.filters as Record<string, unknown>)
      : {};
  const filters: ExportRequest["filters"] = {};

  if (typeof filtersInput.status === "string" && filtersInput.status.length <= 40) {
    filters.status = filtersInput.status;
  }
  for (const key of ["dateFrom", "dateTo"] as const) {
    const value = filtersInput[key];
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      filters[key] = value;
    }
  }
  if (typeof filtersInput.search === "string" && filtersInput.search.trim().length > 0) {
    filters.search = filtersInput.search.trim().slice(0, 200);
  }
  if (typeof filtersInput.assignedTo === "string" && filtersInput.assignedTo.length <= 80) {
    filters.assignedTo = filtersInput.assignedTo;
  }
  if (filtersInput.onlyMine === true) {
    filters.onlyMine = true;
  }
  if (filtersInput.ids !== undefined) {
    if (!Array.isArray(filtersInput.ids)) throw new Error("INVALID_REQUEST");
    if (filtersInput.ids.length > MAX_SELECTION_IDS) throw new Error("SELECTION_TOO_LARGE");
    // Every entry must be a real UUID — reject the whole request rather than
    // silently dropping malformed entries, which could otherwise mask a bug
    // upstream that mixes up ids with something else.
    const invalid = filtersInput.ids.some(
      (id) => typeof id !== "string" || !UUID_PATTERN.test(id),
    );
    if (invalid) throw new Error("INVALID_REQUEST");
    const uniqueIds = Array.from(new Set(filtersInput.ids as string[]));
    if (uniqueIds.length > 0) filters.ids = uniqueIds;
  }

  return {
    module,
    organizationId,
    includeSensitive: body.includeSensitive === true,
    filters,
  };
}

export function applyCommonFilters(query: any, filters: ExportRequest["filters"]): any {
  let filtered = query;
  if (filters.status) filtered = filtered.eq("status", filters.status);
  if (filters.dateFrom) filtered = filtered.gte("created_at", `${filters.dateFrom}T00:00:00`);
  if (filters.dateTo) filtered = filtered.lte("created_at", `${filters.dateTo}T23:59:59.999`);
  // `ids` is always applied on top of everything else the caller builds into
  // `query` before calling this (organization_id, deleted_at, owner scope) —
  // it narrows an already-scoped query, it never replaces the scope. Callers
  // that accept a selection must pass one chunk at a time (see
  // fetchScopedRows) so this never grows the URL past PostgREST's limit.
  if (filters.ids && filters.ids.length > 0) filtered = filtered.in("id", filters.ids);
  return filtered;
}

export function applyOwnerScope(query: any, auth: AuthorizationContext): any {
  if (auth.scope === "ORG") return query;
  const ids = auth.scopedUserIds;
  if (ids.length === 1) {
    return query.or(`created_by.eq.${ids[0]},assigned_to.eq.${ids[0]}`);
  }
  return query.or(`created_by.in.(${ids.join(",")}),assigned_to.in.(${ids.join(",")})`);
}

/**
 * PostgREST serialises `.in()` into the query string, and the gateway rejects
 * URLs past roughly 12 kB. Measured against this project: 300 ids (~11 kB)
 * succeed, 400 (~15 kB) fail outright at the connection level.
 *
 * Exporting an organization with 5418 leads built a ~200 kB URL, so every
 * lookup here failed and the whole export returned 500. Smaller organizations
 * stayed under the limit, which is why leads broke while clients and contacts
 * kept working — the defect was invisible until a tenant grew.
 *
 * 200 ids per request is ~7.5 kB, leaving room for the rest of the URL and the
 * headers.
 */
export const IN_CHUNK_SIZE = 200;

/**
 * PostgREST caps every response at `db-max-rows`, 1000 on this project, and
 * does so silently — `.limit(10001)` still returns 1000 rows with no error and
 * no indication that anything was dropped. An organization with 5418 leads was
 * therefore exporting 1000 of them, which is worse than failing outright.
 *
 * Pages through the result instead, rebuilding the query each time because
 * `.range()` needs a fresh builder. The caller's query must carry a
 * deterministic ORDER BY or pages can overlap.
 */
export const PAGE_SIZE = 1000;

/**
 * Caps how many page requests `fetchAllRows` ever has in flight at once, and
 * the growth ceiling for the doubling batches below. MAX_EXPORT_ROWS /
 * PAGE_SIZE already bounds the *total* number of pages a single export can
 * ever need (11), so this is a second, independent guard: it keeps that
 * bound from silently growing into "dozens of open connections" if either
 * constant changes later, without reintroducing the fully-sequential
 * behavior this replaces.
 */
export const PAGE_FETCH_CONCURRENCY = 5;

export type PagedQueryBuilder = () => any;

/**
 * Runs `fn` over `items` with at most `limit` calls in flight at once.
 * Results are returned in input order regardless of completion order, so
 * callers can safely concatenate them and preserve row order across pages.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) return;
      results[current] = await fn(items[current]);
    }
  }
  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

/**
 * Pages through a module's rows in growing parallel batches instead of one
 * request at a time.
 *
 * There is no upfront `count` query: an earlier version of this function
 * asked PostgREST for `count: 'exact'` on page 1 to size all the remaining
 * pages in one shot, but measuring it against this project's RLS showed an
 * exact count costs roughly as much as a full page fetch — cheap tables
 * (clients, contracts, proposals: one page) paid for a count they never
 * needed, and two-page tables (contacts, quotes) got measurably *slower*
 * than the old sequential loop, not faster. Doubling batches need no count
 * at all: fetch 1 page, then (only if it came back full) 2 more in
 * parallel, then 4, then capped at PAGE_FETCH_CONCURRENCY, stopping as soon
 * as the last page of a batch comes back short. Small result sets — the
 * common case — finish after that single first request, exactly like
 * before. Large ones (leads) finish in a handful of parallel rounds instead
 * of one request per 1000 rows.
 *
 * Each batch is not one atomic snapshot of a live table — a row can be
 * inserted between rounds and, because these queries order by the immutable
 * random `id` primary key (not insertion time), land anywhere in the sort
 * order. An insert ahead of the last fetched page shifts every row after it
 * forward by one position, which can duplicate a row across adjacent pages
 * (the row that used to be last on page N becomes first on page N+1 too).
 * Every row is deduped by its `id` primary key when pages are merged, so a
 * row counted twice by an insert-caused shift is only ever kept once. A row
 * inserted late enough to land after every page this call ever fetches is
 * simply not part of this export, the same as it would be for a plain
 * one-shot query run at that same instant — not a lost row, a new one that
 * arrived after the snapshot. The caller's query must select `id` and order
 * by it — every module that uses this already does, since `.range()`
 * pagination requires a deterministic ORDER BY regardless.
 */
export async function fetchAllRows(build: PagedQueryBuilder): Promise<any[]> {
  const seenIds = new Set<string>();
  const rows: any[] = [];
  const addRow = (row: any) => {
    const id = row?.id;
    if (typeof id === "string") {
      if (seenIds.has(id)) return;
      seenIds.add(id);
    }
    rows.push(row);
  };

  let nextFrom = 0;
  let batchSize = 1;
  while (nextFrom <= MAX_EXPORT_ROWS) {
    const starts: number[] = [];
    for (let i = 0; i < batchSize && nextFrom + i * PAGE_SIZE <= MAX_EXPORT_ROWS; i += 1) {
      starts.push(nextFrom + i * PAGE_SIZE);
    }
    if (starts.length === 0) break;

    const pages = await mapWithConcurrency(starts, PAGE_FETCH_CONCURRENCY, async (from) => {
      const { data, error } = await build().range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return (data || []) as any[];
    });
    for (const page of pages) {
      for (const row of page) addRow(row);
    }

    // Only the last page of the batch decides whether to keep going — a
    // short page earlier in the same parallel batch doesn't necessarily
    // mean the end, since later `from` offsets in the same batch can still
    // hold rows (see doc comment above).
    const lastPage = pages[pages.length - 1];
    if (!lastPage || lastPage.length < PAGE_SIZE) break;
    // One row past the cap is enough for the caller's limit check to trip —
    // no need to page all the way through a runaway result set.
    if (rows.length > MAX_EXPORT_ROWS) break;

    nextFrom = starts[starts.length - 1] + PAGE_SIZE;
    batchSize = Math.min(batchSize * 2, PAGE_FETCH_CONCURRENCY);
  }
  return rows;
}

export async function selectInChunks(
  ids: string[],
  build: (chunk: string[]) => any,
): Promise<any[]> {
  if (ids.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK_SIZE) {
    chunks.push(ids.slice(i, i + IN_CHUNK_SIZE));
  }
  const results = await Promise.all(chunks.map((chunk) => build(chunk)));
  const rows: any[] = [];
  for (const result of results) {
    if (result.error) throw result.error;
    if (result.data) rows.push(...result.data);
  }
  return rows;
}

/**
 * Fetches rows for a module, chunking by explicit id selection when present.
 *
 * When `ids` is set (the "exportar apenas a seleção" path), `buildQuery` is
 * called once per chunk of `IN_CHUNK_SIZE` ids, with the chunk substituted
 * for `filters.ids` on that call only — `buildQuery` must apply
 * organization_id / deleted_at / owner scope unconditionally, ids merely
 * narrows further via applyCommonFilters. Ids are de-duplicated before
 * chunking, so no two chunks can ever contain the same id and no duplicate
 * rows can be produced (each id is also a primary key, so at most one row
 * per id regardless).
 *
 * Without `ids`, this falls back to the normal `.range()`-paginated
 * `fetchAllRows` used by every other export.
 */
export async function fetchScopedRows(
  buildQuery: (idsChunk?: string[]) => any,
  ids: string[] | undefined,
): Promise<any[]> {
  if (!ids || ids.length === 0) {
    return fetchAllRows(() => buildQuery());
  }
  const uniqueIds = Array.from(new Set(ids));
  return selectInChunks(uniqueIds, (chunk) => buildQuery(chunk));
}
