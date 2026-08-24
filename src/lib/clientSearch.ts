import { supabase } from "@/integrations/supabase/client";

// Must stay <= the search-entities Edge Function's own MAX_LIMIT (100,
// supabase/functions/search-entities/handler.ts) — sending more trips its
// zod validation ("Too big: expected number to be <=100") on every call.
const NIF_SEARCH_LIMIT = 100;

/**
 * `.in("entity_id", ids)` on a REST `select` sends the ids as a URL query
 * param, not a POST body — unlike an RPC call. Measured against this
 * project's gateway: ~300 uuids (~11 kB of query string) pass, ~400
 * (~15 kB) are rejected at the connection level. Chunking keeps every
 * request comfortably under that ceiling even after the rest of a page's
 * filters (org/status/date/scope `.or(...)`) add their own query-string
 * weight alongside the `entity_id=in.(...)` clause.
 */
export const ENTITY_ID_CHUNK_SIZE = 100;

export function chunkIds(ids: readonly string[], size: number = ENTITY_ID_CHUNK_SIZE): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks;
}

interface SearchEntitiesResponse {
  success: boolean;
  data?: { fiscal_entity_ids: string[] };
  error?: string;
}

/**
 * Escapes the PostgREST `ilike` wildcards so a user-typed term is matched
 * literally. Exported because every caller that builds its own `.ilike(...)`
 * pattern (deal titles, quote numbers, ...) needs the exact same escaping.
 */
export function escapeIlike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Sanitizes a term before it's interpolated into a PostgREST `.or(...)`
 * filter string (e.g. `.or(\`name.ilike.%${term}%,sku.ilike.%${term}%\`)`).
 * `,` and `()` are structural characters in that mini-language — an
 * unescaped one in the term breaks the filter with a syntax error (400)
 * instead of just matching oddly, e.g. searching "Cadeira, Mesa (2un)".
 * `%`/`_` (ilike wildcards) are also escaped via escapeIlike so the term is
 * matched literally rather than as a pattern.
 */
export function escapePostgrestOrTerm(term: string): string {
  return escapeIlike(term).replace(/[,()]/g, " ").trim();
}

function sanitizeWord(raw: string): string {
  return escapeIlike(raw.trim().toLowerCase())
    .replace(/[,()*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolves `entity_id`s whose NIF matches `term`, via the `search-entities`
 * Edge Function (tokenized/encrypted NIF search — never exposes plaintext
 * NIF/hash to the client, unlike the legacy `fe.nif ILIKE` path it replaces).
 *
 * The Edge Function already restricts its `fiscal_entity_ids` response to
 * entities visible to the caller (see search-entities/handler.ts), so mapping
 * fiscal_entity_id -> entity_id via `anew_entity_fiscal_entities` here is a
 * pure join: RLS on that table (`is_entity_in_user_scope`) re-enforces the
 * same visibility rule, it does not relax it.
 */
export async function searchEntityIdsByNif(term: string, limit = NIF_SEARCH_LIMIT): Promise<string[]> {
  try {
    const { data, error } = await supabase.functions.invoke<SearchEntitiesResponse>("search-entities", {
      body: { term, limit },
    });

    if (error || !data?.success) {
      if (error) console.error("[clientSearch] search-entities error:", error);
      return [];
    }

    const fiscalEntityIds = data.data?.fiscal_entity_ids ?? [];
    if (fiscalEntityIds.length === 0) return [];

    const { data: links, error: linkError } = await supabase
      .from("anew_entity_fiscal_entities")
      .select("entity_id")
      .in("fiscal_entity_id", fiscalEntityIds);

    if (linkError) {
      console.error("[clientSearch] anew_entity_fiscal_entities lookup error:", linkError);
      return [];
    }

    return Array.from(
      new Set((links || []).map((row: { entity_id: string | null }) => row.entity_id).filter(Boolean) as string[]),
    );
  } catch (err) {
    console.error("[clientSearch] search-entities invocation failed:", err);
    return [];
  }
}

/**
 * Resolves `entity_id`s whose name, email or phone contains `word`, via the
 * `search_entity_ids_by_word` RPC (see
 * supabase/migrations/20261113060000_search_entity_ids_by_word_rpc.sql).
 *
 * Replaces three separate `.ilike(...).limit(200)` queries with NO
 * `ORDER BY`, which silently truncated any word with >200 real matches to an
 * arbitrary 200 — e.g. "mar" (802 real matches) or "silva" (287), causing
 * clients whose own name contains such a word to disappear from the
 * AND-across-words intersection entirely. The RPC has no LIMIT.
 *
 * SECURITY INVOKER (the RPC's default, kept on purpose): anew_entities,
 * anew_entity_emails and anew_entity_phones stay under the same RLS the
 * client already queried them under directly.
 */
async function entityIdsByNameEmailPhone(word: string): Promise<Set<string>> {
  const { data, error } = await (supabase as any).rpc("search_entity_ids_by_word", { p_word: word });

  if (error) {
    console.error("[clientSearch] search_entity_ids_by_word RPC error:", error);
    return new Set<string>();
  }

  const rows = (data || []) as { entity_id: string | null }[];
  return new Set(rows.map((r) => r.entity_id).filter(Boolean) as string[]);
}

async function entityIdsForWord(word: string): Promise<Set<string>> {
  const [nameEmailPhoneIds, nifEntityIds] = await Promise.all([
    entityIdsByNameEmailPhone(word),
    searchEntityIdsByNif(word),
  ]);
  return new Set<string>([...nameEmailPhoneIds, ...nifEntityIds]);
}

export interface SearchEntityIdsResult {
  ids: string[];
}

/**
 * Resolve `entity_id`s that match the search term across name, email, phone and NIF.
 * AND between words (tolerates order); OR between fields per word.
 *
 * Returns the FULL matched set — no arbitrary cap. The previous
 * `MAX_MATCHED_IDS = 1000` truncation existed only because every id had to
 * ride in a REST `.in("entity_id", ids)` URL query string; that transport
 * limit is now handled by the caller via `chunkIds` (see AnewClients.tsx),
 * so it no longer needs to leak into this function's contract.
 */
export async function searchEntityIds(search: string): Promise<SearchEntityIdsResult> {
  const words = search
    .toLowerCase()
    .split(/\s+/)
    .map(sanitizeWord)
    .filter((w) => w.length > 0);

  if (words.length === 0) return { ids: [] };

  const perWord = await Promise.all(words.map(entityIdsForWord));
  if (perWord.some((s) => s.size === 0)) return { ids: [] };

  let intersection = perWord[0];
  for (let i = 1; i < perWord.length; i++) {
    const next = new Set<string>();
    for (const id of intersection) if (perWord[i].has(id)) next.add(id);
    intersection = next;
  }

  return { ids: Array.from(intersection) };
}
