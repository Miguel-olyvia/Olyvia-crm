import { z } from "npm:zod";
import { authErrorResponse, AuthError, resolveCallerIdentity } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { captureError } from "../_shared/sentry.ts";
import { encryptNif, hashNif, normalizeNif } from "../_shared/nifCrypto.ts";
import { withRetryResult } from "../_shared/retry.ts";

/**
 * A raw key (Uint8Array, as returned by deriveKeyFromEnv) or an already
 * imported CryptoKey. Both are accepted transparently by nifCrypto.ts.
 */
type NifKey = Uint8Array | CryptoKey;

export interface FiscalEntityResolveDeps {
  /**
   * Service-role Supabase client. Used both to resolve the caller's identity
   * (auth.getUser + anew_users lookup, via resolveCallerIdentity) and to run
   * the resolve_fiscal_entity RPC. The RPC intentionally bypasses per-org RLS
   * — fiscal_entities is a shared, cross-org reference table (see the
   * function's contract) — so a single service-role client is correct here,
   * unlike nif-write-proxy which must forward the caller's own JWT.
   */
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any;
  /** Resolves the AES-256-GCM encryption key. Must throw a clear error if unavailable. */
  getEncKey: () => NifKey;
  /** Resolves the HMAC-SHA256 key. Must throw a clear error if unavailable. */
  getHmacKey: () => NifKey;
}

const requestSchema = z.object({
  nif: z.string().trim().min(1, "nif is required"),
  countryCode: z
    .string()
    .trim()
    .length(2, "countryCode must be a 2-letter ISO-3166-1 alpha-2 code")
    .regex(/^[A-Za-z]{2}$/, "countryCode must be a 2-letter ISO-3166-1 alpha-2 code")
    .optional(),
  commercialName: z.string().trim().min(1).nullable().optional(),
  entityType: z.enum(["individual", "company"]).nullable().optional(),
});

interface SuccessBody {
  success: true;
  data: {
    fiscalEntityId: string;
    existed: boolean;
  };
}

interface ErrorBody {
  success: false;
  error: string;
  code: "INVALID_INPUT" | "UNAUTHENTICATED" | "RESOLVE_CONFLICT" | "INTERNAL_ERROR";
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

function errorResponse(
  req: Request,
  status: number,
  code: ErrorBody["code"],
  message: string,
): Response {
  return jsonResponse(req, { success: false, error: message, code }, status);
}

/**
 * Maps an AuthError (thrown by resolveCallerIdentity) to this function's
 * envelope. AuthError already distinguishes 401 (no/invalid token) from 403
 * (valid token, no anew_users profile); both are unauthenticated states for
 * the purposes of this endpoint's contract, which only defines UNAUTHENTICATED.
 */
function authErrorToEnvelope(req: Request, error: unknown): Response {
  if (error instanceof AuthError) {
    return errorResponse(req, error.status, "UNAUTHENTICATED", error.message);
  }
  throw error;
}

/**
 * fiscal-entity-resolve
 *
 * Single server-side "find-or-create fiscal entity by NIF" endpoint,
 * replacing the 3 direct browser reads/writes of `fiscal_entities`
 * (orgEntity.ts, orgFiscalEntity.ts, useEntityIdentity.ts). Returns only an
 * opaque `fiscalEntityId` — never `nif`, `nif_hash`, `nif_encrypted`, or
 * `commercial_name`.
 *
 * POST /fiscal-entity-resolve
 * Body: { nif: string, countryCode?: string, commercialName?: string | null,
 *         entityType?: "individual" | "company" | null }
 *
 * Scope: GLOBAL by (nif_hash, country_code), not restricted by organization —
 * fiscal_entities has no organization_id and is a shared reference table
 * across orgs (see contract). This function does NOT create the
 * anew_entity_fiscal_entities link or any org-link; that stays with the
 * caller, using the returned opaque id.
 *
 * Requires any authenticated caller (resolveCallerIdentity) — the write
 * itself runs under service_role since there is no per-org permission to
 * delegate to (unlike nif-write-proxy's target RPCs).
 *
 * SECURITY: no log, error message, or response body produced by this
 * function may ever contain the plaintext NIF, nif_hash, nif_encrypted, or
 * the encryption/HMAC keys.
 */
export async function handleFiscalEntityResolveRequest(
  req: Request,
  deps: FiscalEntityResolveDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const { supabaseAdmin } = deps;

  try {
    await resolveCallerIdentity(req, supabaseAdmin);
  } catch (e) {
    return authErrorToEnvelope(req, e);
  }

  const rawBody = await req.json().catch(() => null);
  if (rawBody === null) {
    return errorResponse(req, 400, "INVALID_INPUT", "Invalid JSON body");
  }

  const parsed = requestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid request";
    return errorResponse(req, 400, "INVALID_INPUT", message);
  }

  const { nif, commercialName, entityType } = parsed.data;
  const countryCode = (parsed.data.countryCode ?? "PT").toUpperCase();

  const normalizedNif = normalizeNif(nif);
  if (normalizedNif === "") {
    return errorResponse(req, 400, "INVALID_INPUT", "nif is required");
  }

  let encKey: NifKey;
  let hmacKey: NifKey;
  try {
    encKey = deps.getEncKey();
    hmacKey = deps.getHmacKey();
  } catch (e: unknown) {
    console.error(
      "fiscal-entity-resolve: failed to derive encryption keys:",
      e instanceof Error ? e.message : "unknown error",
    );
    await captureError(e, { function: "fiscal-entity-resolve", stage: "derive-keys" });
    return errorResponse(req, 500, "INTERNAL_ERROR", "Internal error");
  }

  let nifEncrypted: string;
  let nifHash: string;
  try {
    [nifEncrypted, nifHash] = await Promise.all([
      encryptNif(normalizedNif, encKey),
      hashNif(normalizedNif, hmacKey),
    ]);
  } catch (e: unknown) {
    console.error(
      "fiscal-entity-resolve: failed to derive nif fields:",
      e instanceof Error ? e.message : "unknown error",
    );
    await captureError(e, { function: "fiscal-entity-resolve", stage: "derive-nif-fields" });
    return errorResponse(req, 500, "INTERNAL_ERROR", "Internal error");
  }

  // Transient connection failures are retried with backoff; conflict/business
  // errors from resolve_fiscal_entity (returned in `error`, never thrown) are
  // never retried — see withRetryResult.
  const { data, error } = await withRetryResult(() =>
    supabaseAdmin.rpc("resolve_fiscal_entity", {
      p_nif: normalizedNif,
      p_nif_hash: nifHash,
      p_nif_encrypted: nifEncrypted,
      p_country_code: countryCode,
      p_commercial_name: commercialName ?? null,
      p_entity_type: entityType ?? null,
    })
  );

  if (error) {
    console.error("fiscal-entity-resolve: resolve_fiscal_entity RPC failed:", error.message);
    await captureError(error, { function: "fiscal-entity-resolve", stage: "resolve-rpc" });

    if (error.code === "23505") {
      return errorResponse(req, 409, "RESOLVE_CONFLICT", "Could not resolve fiscal entity due to a conflict");
    }
    return errorResponse(req, 500, "INTERNAL_ERROR", "Internal error");
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.fiscal_entity_id !== "string") {
    console.error("fiscal-entity-resolve: resolve_fiscal_entity RPC returned no row");
    await captureError(new Error("resolve_fiscal_entity returned no row"), {
      function: "fiscal-entity-resolve",
      stage: "resolve-rpc-empty",
    });
    return errorResponse(req, 500, "INTERNAL_ERROR", "Internal error");
  }

  return jsonResponse(
    req,
    {
      success: true,
      data: {
        fiscalEntityId: row.fiscal_entity_id,
        existed: Boolean(row.existed),
      },
    },
    200,
  );
}
