import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { usePermissionScope } from "@/hooks/usePermissionScope";
import { useDescendantOrgIds } from "@/hooks/useDescendantOrgIds";
import {
  ALL_SCOPED_SEARCH_KINDS,
  MIN_SEARCH_TERM_LENGTH,
  normalizeSearchTerm,
  searchDealsLeadsClients,
  type ScopedSearchKind,
  type ScopedSearchResult,
} from "@/lib/search/scopedEntitySearch";

const DEFAULT_DEBOUNCE_MS = 300;

export interface UseScopedEntitySearchOptions {
  kinds?: readonly ScopedSearchKind[];
  limitPerKind?: number;
  debounceMs?: number;
  /** Narrows results to a single contact/entity; never widens them. */
  restrictToEntityId?: string | null;
}

export interface UseScopedEntitySearchResult {
  results: ScopedSearchResult[];
  loading: boolean;
  /** True once both the org subtree and the permission scope have resolved. */
  ready: boolean;
  /** Debounced. Safe to call on every keystroke. */
  search: (term: string) => void;
  clear: () => void;
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
    limitPerKind,
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
      try {
        const found = await searchDealsLeadsClients({
          term,
          orgIds,
          kinds: stableKinds,
          limitPerKind,
          restrictToEntityId,
          viewer: { isSystemAdmin, anewUserId, authUserId, teamMemberIds, getPermissionScope },
        });
        if (requestId !== latestRequestIdRef.current) return;
        setResults(found);
      } catch (error) {
        if (requestId !== latestRequestIdRef.current) return;
        console.error("[useScopedEntitySearch] search failed:", error);
        setResults([]);
      } finally {
        if (requestId === latestRequestIdRef.current) setLoading(false);
      }
    },
    [
      scopeLoading,
      orgLoading,
      orgIds,
      stableKinds,
      limitPerKind,
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
      if (normalizeSearchTerm(term).length < MIN_SEARCH_TERM_LENGTH) {
        latestRequestIdRef.current++;
        setResults([]);
        setLoading(false);
        return;
      }
      debounceRef.current = setTimeout(() => runSearch(term), debounceMs);
    },
    [runSearch, debounceMs],
  );

  const clear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    latestRequestIdRef.current++;
    setResults([]);
    setLoading(false);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { results, loading, ready, search, clear };
}
