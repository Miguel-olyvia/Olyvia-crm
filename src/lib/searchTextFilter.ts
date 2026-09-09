/**
 * Word-AND matching against a denormalized `search_text` column.
 *
 * The `search_text` columns (anew_leads, anew_clients, anew_entities,
 * proposals, quotes) are all maintained by triggers and covered by a trigram
 * GIN index. The matching rule is always the same: EVERY word of the search
 * term must appear SOMEWHERE in `search_text`, in any order — so
 * "proposta cliente X" matches "Proposta para o cliente X", which a single
 * phrase `ILIKE %term%` / `strpos()` never did.
 *
 * `splitSearchWords` is deliberately byte-for-byte equivalent to the SQL side
 *
 *   unnest(regexp_split_to_array(lower(trim(_search)), '\s+'))
 *
 * used by `get_quotes_kpi_stats` (see
 * supabase/migrations/20261113170000_quotes_search_text.sql). The KPI cards
 * and the list query MUST resolve to the same set of rows; any extra
 * client-side sanitisation here (escaping `%`/`_`, dropping `,()`) that the
 * SQL predicate does not also perform would reintroduce exactly the
 * KPI/list divergence that column was added to close. So: lowercase, trim,
 * split on whitespace, and nothing else.
 *
 * Note that `%` and `_` therefore stay live wildcards on BOTH sides. That is
 * a deliberate parity choice, not an oversight: the SQL predicate builds
 * `'%' || w || '%'` without escaping either.
 */
export function splitSearchWords(term: string): string[] {
  return term
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

/** Minimal shape of a PostgREST filter builder — keeps this file free of supabase-js types. */
interface IlikeQuery<Q> {
  ilike: (column: string, pattern: string) => Q;
}

/**
 * Chains one `.ilike("search_text", "%word%")` per word onto `query`.
 * PostgREST ANDs repeated filters on the same column, which is exactly the
 * word-AND semantics above, and each one can still use the trigram index.
 */
export function applySearchTextFilter<Q extends IlikeQuery<Q>>(query: Q, words: readonly string[]): Q {
  return words.reduce((q, word) => q.ilike("search_text", `%${word}%`), query);
}
