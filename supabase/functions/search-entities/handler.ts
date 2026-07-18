import { z } from "npm:zod";
import {
  authErrorResponse,
  type CallerIdentity,
  resolveCallerIdentity,
} from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { captureError } from "../_shared/sentry.ts";
import { decryptNif, normalizeNif, tokenizeNif } from "../_shared/nifCrypto.ts";

/**
 * A raw key (Uint8Array, as returned by deriveKeyFromEnv) or an already
 * imported CryptoKey. Both are accepted transparently by nifCrypto.ts.
 */
type NifKey = Uint8Array | CryptoKey;

/**
 * Minimum normalized-term length required to search by NIF trigram tokens.
 * Mirrors TRIGRAM_WINDOW in nifCrypto.ts: tokenizeNif falls back to hashing
 * the whole value when it is shorter than the window, which would never
 * match the 3-char trigram tokens already stored for existing NIFs — a
 * guaranteed false negative. Below this length, the NIF search branch is
 * skipped entirely (name/email/phone search, if any, is out of scope here).
 */
const MIN_NIF_SEARCH_LENGTH = 3;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export interface SearchEntitiesDeps {
  /**
   * Service-role Supabase client. Used both to resolve the caller's identity
   * (auth.getUser + anew_users lookup, via resolveCallerIdentity) and to run
   * every query below. All the tables involved (fiscal_entity_nif_tokens,
   * fiscal_entities.nif_encrypted, the visibility CTE tables) require
   * service_role: RLS denies authenticated/anon on the token table, and the
   * NIF-matching logic itself must run server-side (the DB has no HMAC key).
   */
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any;
  /** Resolves the AES-256-GCM encryption key. Must throw a clear error if unavailable. */
  getEncKey: () => NifKey;
  /** Resolves the HMAC-SHA256 key. Must throw a clear error if unavailable. */
  getHmacKey: () => NifKey;
}

const requestSchema = z.object({
  term: z.string().trim().min(1, "term is required"),
  limit: z.number().int().positive().max(MAX_LIMIT).optional(),
});

interface SuccessBody {
  success: true;
  data: { fiscal_entity_ids: string[] };
}

interface ErrorBody {
  success: false;
  error: string;
}

function jsonResponse(
  req: Request,
  body: SuccessBody | ErrorBody,
  status: number,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function emptyResult(req: Request): Response {
  return jsonResponse(req, { success: true, data: { fiscal_entity_ids: [] } }, 200);
}

/**
 * Groups token rows by fiscal_entity_id and returns only the ids whose set
 * of distinct matched token_hash values covers every token derived from the
 * search term — the SQL equivalent of
 *   GROUP BY fiscal_entity_id HAVING count(DISTINCT token_hash) = N
 * from the architecture contract.
 *
 * This is a CANDIDATE filter, not proof of a real substring match: it only
 * guarantees the entity's NIF contains every trigram of the search term, not
 * that they are contiguous/ordered as a real substring (e.g. a NIF matching
 * trigrams "123" and "234" in non-adjacent positions would pass this check
 * without containing "1234"). recheckSubstringMatches() below eliminates
 * those false positives by decrypting and comparing the real value.
 */
function selectFiscalEntityIdsCoveringAllTokens(
  rows: Array<{ fiscal_entity_id: string; token_hash: string }>,
  tokens: string[],
): string[] {
  const requiredCount = new Set(tokens).size;
  const matchedTokensByEntity = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = matchedTokensByEntity.get(row.fiscal_entity_id) ?? new Set<string>();
    set.add(row.token_hash);
    matchedTokensByEntity.set(row.fiscal_entity_id, set);
  }

  const result: string[] = [];
  for (const [fiscalEntityId, matchedTokens] of matchedTokensByEntity) {
    if (matchedTokens.size === requiredCount) result.push(fiscalEntityId);
  }
  return result;
}

/**
 * Architecture contract, Option A ("candidate filter + recheck by
 * decryption"): decrypts each candidate's nif_encrypted and confirms a real
 * substring match against the normalized search term, eliminating the false
 * positives inherent to the trigram-overlap candidate filter above. The
 * candidate set is expected to be small, so the per-row decrypt cost is
 * negligible.
 */
async function recheckSubstringMatches(
  candidates: Array<{ id: string; nif_encrypted: string | null }>,
  normalizedTerm: string,
  encKey: NifKey,
): Promise<string[]> {
  const confirmed: string[] = [];
  for (const candidate of candidates) {
    if (!candidate.nif_encrypted) continue;
    try {
      const decrypted = await decryptNif(candidate.nif_encrypted, encKey);
      if (normalizeNif(decrypted).includes(normalizedTerm)) {
        confirmed.push(candidate.id);
      }
    } catch {
      // Tampered/corrupted ciphertext for this one row: never let the
      // decrypt failure surface as an error (could hint at crypto
      // internals); just exclude this candidate from the results.
      continue;
    }
  }
  return confirmed;
}

/**
 * Replicates the visibility CTE from search_visible_entity_ids (baseline
 * migration, ~line 6172-6191) for an arbitrary set of candidate entity ids
 * instead of a search term. Returns the subset of `entityIds` visible to the
 * given caller. SERVICE_ROLE callers bypass the check entirely (internal
 * calls), matching the convention used by validateOrgScope in _shared/auth.ts.
 */
async function filterVisibleEntityIds(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
  entityIds: string[],
  caller: CallerIdentity,
): Promise<Set<string>> {
  if (entityIds.length === 0) return new Set();
  if (caller.isServiceRole) return new Set(entityIds);

  const { data: businessMap } = await supabaseAdmin
    .from("auth_to_business_user_map")
    .select("business_user_id")
    .eq("auth_user_id", caller.authUid)
    .maybeSingle();
  const businessUid: string | null = businessMap?.business_user_id ?? null;

  const { data: visibleOrgIdsRaw } = await supabaseAdmin.rpc(
    "get_user_visible_org_ids",
    { _auth_uid: caller.authUid },
  );
  const visibleOrgIds: string[] = Array.isArray(visibleOrgIdsRaw) ? visibleOrgIdsRaw : [];

  const visible = new Set<string>();

  if (businessUid) {
    const { data } = await supabaseAdmin
      .from("anew_entities")
      .select("id")
      .in("id", entityIds)
      .eq("created_by", businessUid);
    for (const row of data ?? []) visible.add(row.id);
  }

  if (visibleOrgIds.length > 0) {
    const orgScopedTables = [
      "anew_entity_org_links",
      "anew_leads",
      "anew_clients",
      "quotes",
      "deals",
    ] as const;

    for (const table of orgScopedTables) {
      const { data } = await supabaseAdmin
        .from(table)
        .select("entity_id")
        .in("entity_id", entityIds)
        .in("organization_id", visibleOrgIds);
      for (const row of data ?? []) visible.add(row.entity_id);
    }
  }

  return visible;
}

/**
 * search-entities
 *
 * Searches fiscal_entities by (partial) NIF over the tokenized trigram
 * index (public.fiscal_entity_nif_tokens), without ever reading or matching
 * against the plaintext nif column. Returns only fiscal_entity_ids the
 * caller is authorized to see, replicating the visibility rules of
 * search_visible_entity_ids (baseline migration).
 *
 * POST /search-entities
 * Body: { term: string, limit?: number }   // limit default 50, cap 100
 * Response: {
 *   success: boolean,
 *   data?: { fiscal_entity_ids: string[] },
 *   error?: string
 * }
 *
 * Requires any authenticated caller (resolveCallerIdentity).
 *
 * SECURITY: no log, error message, or response body produced by this
 * function may ever contain the plaintext NIF, nif_hash, nif_encrypted, or
 * the encryption/HMAC keys — only opaque fiscal_entity_ids are returned.
 */
export async function handleSearchEntitiesRequest(
  req: Request,
  deps: SearchEntitiesDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const { supabaseAdmin } = deps;

  let caller: CallerIdentity;
  try {
    caller = await resolveCallerIdentity(req, supabaseAdmin);
  } catch (e) {
    return authErrorResponse(e, getCorsHeaders(req));
  }

  const rawBody = await req.json().catch(() => null);
  if (rawBody === null) {
    return jsonResponse(req, { success: false, error: "Invalid JSON body" }, 400);
  }

  const parsed = requestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonResponse(
      req,
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      400,
    );
  }

  const limit = Math.min(parsed.data.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const normalizedTerm = normalizeNif(parsed.data.term);

  if (normalizedTerm.length < MIN_NIF_SEARCH_LENGTH) {
    return emptyResult(req);
  }

  let hmacKey: NifKey;
  let encKey: NifKey;
  try {
    hmacKey = deps.getHmacKey();
    encKey = deps.getEncKey();
  } catch (e: unknown) {
    const message = e instanceof Error
      ? e.message
      : "unknown error deriving encryption keys";
    console.error("search-entities: failed to derive encryption keys:", message);
    await captureError(e, { function: "search-entities", stage: "derive-keys" });
    return jsonResponse(req, { success: false, error: "Internal error" }, 500);
  }

  let tokens: string[];
  try {
    tokens = await tokenizeNif(normalizedTerm, hmacKey);
  } catch (e: unknown) {
    console.error(
      "search-entities: failed to tokenize search term:",
      e instanceof Error ? e.message : "unknown error",
    );
    await captureError(e, { function: "search-entities", stage: "tokenize" });
    return jsonResponse(req, { success: false, error: "Internal error" }, 500);
  }

  const { data: tokenRows, error: tokenError } = await supabaseAdmin
    .from("fiscal_entity_nif_tokens")
    .select("fiscal_entity_id, token_hash")
    .in("token_hash", tokens);

  if (tokenError) {
    console.error("search-entities: token query failed:", tokenError.message);
    await captureError(tokenError, { function: "search-entities", stage: "token-query" });
    return jsonResponse(req, { success: false, error: "Internal error" }, 500);
  }

  const candidateFiscalEntityIds = selectFiscalEntityIdsCoveringAllTokens(
    tokenRows ?? [],
    tokens,
  );
  if (candidateFiscalEntityIds.length === 0) {
    return emptyResult(req);
  }

  const { data: fiscalEntityRows, error: fiscalEntityError } = await supabaseAdmin
    .from("fiscal_entities")
    .select("id, nif_encrypted")
    .in("id", candidateFiscalEntityIds);

  if (fiscalEntityError) {
    console.error(
      "search-entities: fiscal_entities query failed:",
      fiscalEntityError.message,
    );
    await captureError(fiscalEntityError, {
      function: "search-entities",
      stage: "fiscal-entities-query",
    });
    return jsonResponse(req, { success: false, error: "Internal error" }, 500);
  }

  const confirmedFiscalEntityIds = await recheckSubstringMatches(
    fiscalEntityRows ?? [],
    normalizedTerm,
    encKey,
  );
  if (confirmedFiscalEntityIds.length === 0) {
    return emptyResult(req);
  }

  const { data: linkRows, error: linkError } = await supabaseAdmin
    .from("anew_entity_fiscal_entities")
    .select("fiscal_entity_id, entity_id")
    .in("fiscal_entity_id", confirmedFiscalEntityIds);

  if (linkError) {
    console.error(
      "search-entities: anew_entity_fiscal_entities query failed:",
      linkError.message,
    );
    await captureError(linkError, { function: "search-entities", stage: "link-query" });
    return jsonResponse(req, { success: false, error: "Internal error" }, 500);
  }

  const fiscalEntityIdsByEntityId = new Map<string, string[]>();
  for (const row of linkRows ?? []) {
    const list = fiscalEntityIdsByEntityId.get(row.entity_id) ?? [];
    list.push(row.fiscal_entity_id);
    fiscalEntityIdsByEntityId.set(row.entity_id, list);
  }
  const candidateEntityIds = Array.from(fiscalEntityIdsByEntityId.keys());

  if (candidateEntityIds.length === 0) {
    return emptyResult(req);
  }

  let visibleEntityIds: Set<string>;
  try {
    visibleEntityIds = await filterVisibleEntityIds(
      supabaseAdmin,
      candidateEntityIds,
      caller,
    );
  } catch (e: unknown) {
    console.error(
      "search-entities: visibility filter failed:",
      e instanceof Error ? e.message : "unknown error",
    );
    await captureError(e, { function: "search-entities", stage: "visibility-filter" });
    return jsonResponse(req, { success: false, error: "Internal error" }, 500);
  }

  const resultFiscalEntityIds: string[] = [];
  for (const entityId of candidateEntityIds) {
    if (!visibleEntityIds.has(entityId)) continue;
    for (const fiscalEntityId of fiscalEntityIdsByEntityId.get(entityId) ?? []) {
      if (!resultFiscalEntityIds.includes(fiscalEntityId)) {
        resultFiscalEntityIds.push(fiscalEntityId);
      }
    }
    if (resultFiscalEntityIds.length >= limit) break;
  }

  return jsonResponse(
    req,
    { success: true, data: { fiscal_entity_ids: resultFiscalEntityIds.slice(0, limit) } },
    200,
  );
}
