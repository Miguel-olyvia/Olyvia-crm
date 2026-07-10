import { z } from "npm:zod";
import { authErrorResponse, resolveCallerIdentity } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { captureError } from "../_shared/sentry.ts";
import { decryptNif } from "../_shared/nifCrypto.ts";

/**
 * Maximum number of fiscal_entity_ids accepted in a single request. Bounds
 * both the cost of the batch decryption and the exfiltration surface of a
 * single call (see architect contract, Piece 3).
 */
export const MAX_BATCH_SIZE = 100;

const requestSchema = z.object({
  fiscal_entity_ids: z.array(z.string()).min(1).max(MAX_BATCH_SIZE),
});

/**
 * A raw key (Uint8Array, as returned by deriveKeyFromEnv) or an already
 * imported CryptoKey. Both are accepted transparently by nifCrypto.ts.
 */
type NifKey = Uint8Array | CryptoKey;

export interface NifRevealDeps {
  /**
   * Service-role Supabase client. Used to resolve the caller's identity, to
   * read fiscal_entities/anew_entity_fiscal_entities (service-role-only
   * tables), and to invoke the batch visibility RPC on the caller's behalf.
   */
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any;
  /** Resolves the AES-256-GCM decryption key. Must throw a clear error if unavailable. */
  getDecKey: () => NifKey;
}

interface FiscalEntityRow {
  id: string;
  nif_encrypted: string | null;
}

interface EntityLinkRow {
  entity_id: string;
  fiscal_entity_id: string;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * nif-reveal
 *
 * Batch-decrypts the NIF of a set of fiscal_entity_ids, but ONLY for the ones
 * the caller is authorized to see (per the same visibility rules used
 * elsewhere for anew_entities). Authorization is resolved in a single batch
 * RPC call (filter_visible_entity_ids) to avoid an N+1 query pattern.
 *
 * POST /nif-reveal
 * Body: { fiscal_entity_ids: string[] }   // 1..MAX_BATCH_SIZE ids
 *
 * Requires any authenticated caller (resolveCallerIdentity). Per-entity
 * authorization is delegated to filter_visible_entity_ids, which reuses the
 * same visibility CTE as search_visible_entity_ids.
 *
 * SECURITY:
 *  - Requested ids that do not exist and requested ids the caller is not
 *    authorized to see are both silently omitted from `revealed` and
 *    reported together in `denied`, without distinguishing the two cases
 *    (never confirm/deny existence of an entity the caller cannot see).
 *  - No log, error message, or response body produced by this function may
 *    ever contain a plaintext NIF for a denied id, or the decryption key.
 */
export async function handleNifRevealRequest(
  req: Request,
  deps: NifRevealDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const { supabaseAdmin } = deps;

  let caller;
  try {
    caller = await resolveCallerIdentity(req, supabaseAdmin);
  } catch (e) {
    return authErrorResponse(e, corsHeaders);
  }

  const rawBody = await req.json().catch(() => null);
  if (rawBody === null) {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
  }

  const parsed = requestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonResponse(
      { success: false, error: "Invalid request", details: parsed.error.issues },
      400,
    );
  }

  const requestedIds = Array.from(new Set(parsed.data.fiscal_entity_ids));

  let decKey: NifKey;
  try {
    decKey = deps.getDecKey();
  } catch (e: unknown) {
    const message = e instanceof Error
      ? e.message
      : "unknown error deriving decryption key";
    console.error("nif-reveal: failed to derive decryption key:", message);
    await captureError(e, { function: "nif-reveal", stage: "derive-key" });
    return jsonResponse(
      { success: false, error: `Decryption key unavailable: ${message}` },
      500,
    );
  }

  // Query 1a: fiscal_entities rows (service-role-only table).
  const { data: fiscalRows, error: fiscalError } = await supabaseAdmin
    .from("fiscal_entities")
    .select("id, nif_encrypted")
    .in("id", requestedIds);

  if (fiscalError) {
    console.error(
      "nif-reveal: failed to select fiscal_entities:",
      fiscalError.message,
    );
    return jsonResponse(
      { success: false, error: "Failed to load fiscal entities" },
      500,
    );
  }

  // Query 1b: entity <-> fiscal_entity links, needed to resolve visibility
  // (visibility is defined per anew_entities.id, not per fiscal_entity_id).
  const { data: linkRows, error: linkError } = await supabaseAdmin
    .from("anew_entity_fiscal_entities")
    .select("entity_id, fiscal_entity_id")
    .in("fiscal_entity_id", requestedIds);

  if (linkError) {
    console.error(
      "nif-reveal: failed to select anew_entity_fiscal_entities:",
      linkError.message,
    );
    return jsonResponse(
      { success: false, error: "Failed to load entity links" },
      500,
    );
  }

  const fiscalRowsById = new Map<string, FiscalEntityRow>(
    ((fiscalRows ?? []) as FiscalEntityRow[]).map((row) => [row.id, row]),
  );
  const entityIdByFiscalEntityId = new Map<string, string>(
    ((linkRows ?? []) as EntityLinkRow[]).map((row) => [
      row.fiscal_entity_id,
      row.entity_id,
    ]),
  );

  const candidateEntityIds = Array.from(
    new Set(Array.from(entityIdByFiscalEntityId.values())),
  );

  // Query 2: batch authorization — reuses the same visibility CTE as
  // search_visible_entity_ids, but filters a fixed array instead of matching
  // a search term.
  let visibleEntityIds = new Set<string>();
  if (candidateEntityIds.length > 0) {
    const { data: visibleRows, error: visibilityError } = await supabaseAdmin
      .rpc("filter_visible_entity_ids", {
        p_entity_ids: candidateEntityIds,
        p_auth_uid: caller.authUid,
      });

    if (visibilityError) {
      console.error(
        "nif-reveal: filter_visible_entity_ids failed:",
        visibilityError.message,
      );
      return jsonResponse(
        { success: false, error: "Failed to resolve visibility" },
        500,
      );
    }

    visibleEntityIds = new Set(
      (Array.isArray(visibleRows) ? visibleRows : []).map(
        (row: { entity_id: string }) => row.entity_id,
      ),
    );
  }

  const revealed: Record<string, string> = {};
  const denied: string[] = [];

  for (const fiscalEntityId of requestedIds) {
    const fiscalRow = fiscalRowsById.get(fiscalEntityId);
    const entityId = entityIdByFiscalEntityId.get(fiscalEntityId);

    // Never confirm/deny existence: missing row, missing link, and missing
    // visibility are all treated identically — silently omitted.
    if (!fiscalRow || !fiscalRow.nif_encrypted || !entityId) {
      denied.push(fiscalEntityId);
      continue;
    }
    if (!visibleEntityIds.has(entityId)) {
      denied.push(fiscalEntityId);
      continue;
    }

    try {
      revealed[fiscalEntityId] = await decryptNif(
        fiscalRow.nif_encrypted,
        decKey,
      );
    } catch (e: unknown) {
      console.error(
        `nif-reveal: failed to decrypt fiscal_entity ${fiscalEntityId}`,
      );
      await captureError(e, {
        function: "nif-reveal",
        stage: "decrypt",
        fiscal_entity_id: fiscalEntityId,
      });
      denied.push(fiscalEntityId);
    }
  }

  return jsonResponse({ success: true, data: { revealed, denied } }, 200);
}
