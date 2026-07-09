import { z } from "npm:zod";
import { authErrorResponse, requireAdminRole, resolveCallerIdentity } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { captureError } from "../_shared/sentry.ts";
import { encryptNif, hashNif, tokenizeNif } from "../_shared/nifCrypto.ts";

export const DEFAULT_LIMIT = 200;
export const MAX_LIMIT = 1000;

const requestSchema = z.object({
  dry_run: z.boolean().optional(),
  limit: z.number().int().positive().max(MAX_LIMIT).optional(),
});

/**
 * A raw key (Uint8Array, as returned by deriveKeyFromEnv) or an already
 * imported CryptoKey. Both are accepted transparently by nifCrypto.ts.
 */
type NifKey = Uint8Array | CryptoKey;

export interface NifBackfillDeps {
  /** Supabase client (service-role) used for auth resolution and reads/writes. */
  // deno-lint-ignore no-explicit-any
  supabase: any;
  /** Resolves the AES-256-GCM encryption key. Must throw a clear error if unavailable. */
  getEncKey: () => NifKey;
  /** Resolves the HMAC-SHA256 key. Must throw a clear error if unavailable. */
  getHmacKey: () => NifKey;
}

interface FiscalEntityCandidate {
  id: string;
  nif: string;
}

/**
 * NIF Backfill
 *
 * Populates fiscal_entities.nif_encrypted / nif_hash and
 * fiscal_entity_nif_tokens for rows where nif is set but nif_hash is still
 * NULL (i.e. not yet migrated to the encrypted representation).
 *
 * POST /nif-backfill
 * Body: { dry_run?: boolean (default true), limit?: number (default 200, max 1000) }
 *
 * Requires the global system_admin role (or an internal SERVICE_ROLE call).
 *
 * SECURITY: the response body, and every log/console/Sentry call in this
 * function, must never contain a plaintext NIF value — only counts and IDs.
 *
 * Consistency note: a true single-row DB transaction spanning
 * fiscal_entities.update + fiscal_entity_nif_tokens.upsert would require a
 * dedicated Postgres RPC, which does not exist yet for this table pair. To
 * avoid ever leaving a row with nif_hash populated but tokens missing, this
 * function writes tokens FIRST (idempotent upsert, safe to retry) and only
 * updates nif_encrypted/nif_hash on that row AFTER the token write succeeds.
 * If the token write fails, the row is skipped (nif_hash stays NULL) and will
 * be retried on the next run. If the row update fails after tokens were
 * written, the next run re-derives and re-upserts the same tokens (no
 * duplicates, thanks to the token table's composite primary key).
 */
export async function handleNifBackfillRequest(
  req: Request,
  deps: NifBackfillDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const { supabase } = deps;

  let caller;
  try {
    caller = await resolveCallerIdentity(req, supabase);
  } catch (e) {
    return authErrorResponse(e, corsHeaders);
  }

  const isAdmin = await requireAdminRole(supabase, caller);
  if (!isAdmin) {
    return new Response(
      JSON.stringify({ error: "Admin role required" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const rawBody = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const parsed = requestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid request", details: parsed.error.issues }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const dryRun = parsed.data.dry_run ?? true;
  const batchLimit = Math.min(parsed.data.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  let encKey: NifKey;
  let hmacKey: NifKey;
  try {
    encKey = deps.getEncKey();
    hmacKey = deps.getHmacKey();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown error deriving encryption keys";
    console.error("nif-backfill: failed to derive encryption keys:", message);
    await captureError(e, { function: "nif-backfill", stage: "derive-keys" });
    return new Response(
      JSON.stringify({ error: `Encryption keys unavailable: ${message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { data: rows, error: selectError } = await supabase
    .from("fiscal_entities")
    .select("id, nif")
    .not("nif", "is", null)
    .is("nif_hash", null)
    .limit(batchLimit);

  if (selectError) {
    console.error("nif-backfill: failed to select candidate rows:", selectError.message);
    return new Response(
      JSON.stringify({ error: "Failed to select candidate rows" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const candidates: FiscalEntityCandidate[] = rows ?? [];

  if (dryRun) {
    let tokensWouldWrite = 0;
    for (const row of candidates) {
      const tokens = await tokenizeNif(row.nif, hmacKey);
      tokensWouldWrite += tokens.length;
    }

    return new Response(
      JSON.stringify({
        processed: 0,
        would_process: candidates.length,
        tokens_written: 0,
        tokens_would_write: tokensWouldWrite,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let processed = 0;
  let tokensWritten = 0;

  for (const row of candidates) {
    try {
      const tokens = await tokenizeNif(row.nif, hmacKey);

      if (tokens.length > 0) {
        const tokenRows = tokens.map((token_hash: string) => ({
          fiscal_entity_id: row.id,
          token_hash,
        }));

        const { error: tokenError } = await supabase
          .from("fiscal_entity_nif_tokens")
          .upsert(tokenRows, { onConflict: "fiscal_entity_id,token_hash", ignoreDuplicates: true });

        if (tokenError) {
          console.error(`nif-backfill: failed to upsert tokens for entity ${row.id}:`, tokenError.message);
          continue;
        }
      }

      const nifEncrypted = await encryptNif(row.nif, encKey);
      const nifHash = await hashNif(row.nif, hmacKey);

      const { error: updateError } = await supabase
        .from("fiscal_entities")
        .update({ nif_encrypted: nifEncrypted, nif_hash: nifHash })
        .eq("id", row.id);

      if (updateError) {
        console.error(`nif-backfill: failed to update entity ${row.id}:`, updateError.message);
        continue;
      }

      tokensWritten += tokens.length;
      processed++;
    } catch (rowError: unknown) {
      console.error(`nif-backfill: failed to process entity ${row.id}:`, rowError instanceof Error ? rowError.message : rowError);
      await captureError(rowError, { function: "nif-backfill", stage: "process-row" });
    }
  }

  return new Response(
    JSON.stringify({ processed, tokens_written: tokensWritten }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
