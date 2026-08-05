import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { usePermissionScope } from "@/hooks/usePermissionScope";
import { useDescendantOrgIds } from "@/hooks/useDescendantOrgIds";
import {
  ALL_SCOPED_SEARCH_KINDS,
  MIN_SEARCH_TERM_LENGTH,
  normalizeSearchTerm,
  searchDealsLeadsClients,
  type ScopedSearchBranchError,
  type ScopedSearchKind,
  type ScopedSearchResult,
} from "@/lib/search/scopedEntitySearch";

const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_PAGE_SIZE = 25;

export interface UseScopedEntitySearchOptions {
  kinds?: readonly ScopedSearchKind[];
  /** Rows fetched per kind, per page. Scrolling to the end asks for one more. */
  limitPerKind?: number;
  debounceMs?: number;
  /** Narrows results to a single contact/entity; never widens them. */
  restrictToEntityId?: string | null;
}

export interface UseScopedEntitySearchResult {
  results: ScopedSearchResult[];
  loading: boolean;
  /** Human-readable reason the last search failed, if any branch did. */
  error: string | null;
  /** True once both the org subtree and the permission scope have resolved. */
  ready: boolean;
  /** Debounced. Safe to call on every keystroke. */
  search: (term: string) => void;
  clear: () => void;
  /** True while another page may exist, i.e. the last page came back full. */
  hasMore: boolean;
  /** Fetches one more page. No-op while loading or when nothing more is expected. */
  loadMore: () => void;
}

/**
 * Drives a deal / lead / client picker.
 *
 * Owns the three things the hand-rolled `onChange` searches kept getting
 * wrong, on top of the org + scope guarantees enforced inside
 * `searchDealsLeadsClients`:
 *
 *  - DEBOUNCE, so typing doesn't fire a query burst per keystroke.
 *  - A STALE-REQUEST GUARD, so a slow response for an old term cannot
 *    overwrite the results already rendered for the current one (the same
 *    class of bug documented at length in EntitySearchInput.tsx).
 *  - FAIL-CLOSED while the permission scope is still loading, so a picker can
 *    never briefly show rows the viewer isn't allowed to see.
 */
export function useScopedEntitySearch(
  options: UseScopedEntitySearchOptions = {},
): UseScopedEntitySearchResult {
  const {
    kinds = ALL_SCOPED_SEARCH_KINDS,
    limitPerKind = DEFAULT_PAGE_SIZE,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    restrictToEntityId = null,
  } = options;

  const { isSystemAdmin } = usePermissions();
  const {
    getPermissionScope,
    anewUserId,
    authUserId,
    teamMemberIds,
    loading: scopeLoading,
  } = usePermissionScope();
  const { orgIds, loading: orgLoading } = useDescendantOrgIds();

  const [results, setResults] = useState<ScopedSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Grows a page at a time as the user scrolls; reset on every new term.
  const [limit, setLimit] = useState(limitPerKind);
  const [hasMore, setHasMore] = useState(false);
  // The term the current results belong to, so loadMore can re-query it
  // without the caller having to hand it back.
  const activeTermRef = useRef("");

  const latestRequestIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const ready = !scopeLoading && !orgLoading;

  // `kinds` is typically an inline array literal at the call site, so identity
  // changes every render. Key the memo on the contents instead.
  const kindsKey = kinds.join(",");
  const stableKinds = useMemo(() => kindsKey.split(",") as ScopedSearchKind[], [kindsKey]);

  const runSearch = useCallback(
    async (rawTerm: string) => {
      const requestId = ++latestRequestIdRef.current;
      const term = normalizeSearchTerm(rawTerm);

      if (term.length < MIN_SEARCH_TERM_LENGTH) {
        setResults([]);
        setError(null);
        setLoading(false);
        return;
      }

      // Fail closed: without a resolved scope or organization we would have to
      // guess at the filters, and guessing wide leaks records.
      if (scopeLoading || orgLoading || orgIds.length === 0) {
        setResults([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      let branchFailures: ScopedSearchBranchError[] = [];
      try {
        const found = await searchDealsLeadsClients({
          term,
          orgIds,
          kinds: stableKinds,
          limitPerKind: limit,
          restrictToEntityId,
          viewer: { isSystemAdmin, anewUserId, authUserId, teamMemberIds, getPermissionScope },
          onBranchErrors: (failures) => {
            branchFailures = failures;
          },
        });
        if (requestId !== latestRequestIdRef.current) return;
        setResults(found);
        // A short page means the source is exhausted. A full one only means
        // "maybe more", which is the best any offset pager can say.
        setHasMore(found.length >= limit);
        setError(
          branchFailures.length > 0
            ? `Pesquisa incompleta — ${branchFailures
                .map((f) => `${f.branch}: ${f.message}`)
                .join("; ")}`
            : null,
        );
      } catch (err) {
        if (requestId !== latestRequestIdRef.current) return;
        console.error("[useScopedEntitySearch] search failed:", err);
        setResults([]);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (requestId === latestRequestIdRef.current) setLoading(false);
      }
    },
    [
      scopeLoading,
      orgLoading,
      orgIds,
      stableKinds,
      limit,
      restrictToEntityId,
      isSystemAdmin,
      anewUserId,
      authUserId,
      teamMemberIds,
      getPermissionScope,
    ],
  );

  const search = useCallback(
    (term: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      // Clear immediately on a term that is too short, so stale results from a
      // longer previous term don't linger under an emptied input.
      const normalized = normalizeSearchTerm(term);
      if (normalized.length < MIN_SEARCH_TERM_LENGTH) {
        latestRequestIdRef.current++;
        activeTermRef.current = "";
        setResults([]);
        setError(null);
        setHasMore(false);
        setLoading(false);
        return;
      }
      // A new term starts a new result set, so paging goes back to page one.
      if (normalized !== activeTermRef.current) {
        activeTermRef.current = normalized;
        setLimit(limitPerKind);
      }
      debounceRef.current = setTimeout(() => runSearch(term), debounceMs);
    },
    [runSearch, debounceMs, limitPerKind],
  );

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    setLimit((current) => current + limitPerKind);
  }, [loading, hasMore, limitPerKind]);

  // Re-query when scrolling raised the page cap. Skipped on the first render
  // and while the cap is still at page one, so it never duplicates the
  // debounced search that typing already triggers.
  const isFirstLimitRun = useRef(true);
  useEffect(() => {
    if (isFirstLimitRun.current) {
      isFirstLimitRun.current = false;
      return;
    }
    if (limit === limitPerKind) return;
    if (activeTermRef.current.length < MIN_SEARCH_TERM_LENGTH) return;
    runSearch(activeTermRef.current);
    // runSearch is deliberately omitted: it is recreated whenever `limit`
    // changes, which would make this effect re-enter itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit]);

  const clear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    latestRequestIdRef.current++;
    activeTermRef.current = "";
    setResults([]);
    setError(null);
    setHasMore(false);
    setLoading(false);
    setLimit(limitPerKind);
  }, [limitPerKind]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { results, loading, error, ready, search, clear, hasMore, loadMore };
}
