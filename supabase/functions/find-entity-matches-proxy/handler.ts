import { z } from "npm:zod";
import { authErrorResponse, resolveCallerIdentity } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { captureError } from "../_shared/sentry.ts";
import { hashNif, normalizeNif } from "../_shared/nifCrypto.ts";
import { withRetryResult } from "../_shared/retry.ts";

/**
 * A raw key (Uint8Array, as returned by deriveKeyFromEnv) or an already
 * imported CryptoKey. Both are accepted transparently by nifCrypto.ts.
 */
type NifKey = Uint8Array | CryptoKey;

export interface FindEntityMatchesProxyDeps {
  /**
   * Service-role client, used ONLY to resolve the caller's identity
   * (auth.getUser + anew_users lookup, via resolveCallerIdentity). Never
   * used to run the find_entity_matches RPC itself.
   */
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any;
  /**
   * Builds a Supabase client scoped to the caller's own JWT (the incoming
   * request's `Authorization` header, forwarded as-is). find_entity_matches
   * is SECURITY DEFINER but reads auth.uid() internally (via
   * get_user_visible_org_ids) to compute cross-org visibility, so the RPC
   * MUST run through this client, not a fixed service-role client.
   */
  // deno-lint-ignore no-explicit-any
  createUserClient: (authHeader: string) => any;
  /** Resolves the HMAC-SHA256 key. Must throw a clear error if unavailable. */
  getHmacKey: () => NifKey;
}

const requestSchema = z.object({
  orgId: z.string().trim().min(1, "orgId is required"),
  email: z.string().trim().min(1).nullable().optional(),
  phone: z.string().trim().min(1).nullable().optional(),
  nif: z.string().trim().min(1).nullable().optional(),
  countryCode: z.string().trim().min(1).optional(),
});

interface EntityMatchRow {
  entityId: string;
  scope: "same_org" | "group";
  primaryOrgId: string | null;
  primaryOrgName: string | null;
  ownerOrgAccessible: boolean;
  matchField: "email" | "phone" | "nif";
  displayName: string | null;
}

interface SuccessBody {
  success: true;
  data: EntityMatchRow[];
}

interface ErrorBody {
  success: false;
  error: string;
  code: "INVALID_INPUT" | "UNAUTHENTICATED" | "INTERNAL_ERROR";
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

// deno-lint-ignore no-explicit-any
function mapRow(r: any): EntityMatchRow {
  return {
    entityId: r.entity_id,
    scope: r.scope,
    primaryOrgId: r.primary_org_id ?? null,
    primaryOrgName: r.primary_org_name ?? null,
    ownerOrgAccessible: !!r.owner_org_accessible,
    matchField: r.match_field,
    displayName: r.display_name ?? null,
  };
}

/**
 * find-entity-matches-proxy
 *
 * The ONLY sanctioned path for the frontend to call `find_entity_matches`.
 * Previously the browser sent the plaintext NIF straight to the 5/6-arg RPC
 * (see orgEntity.ts::findEntityMatches history); this function computes the
 * HMAC-SHA256 nif_hash server-side and forwards ONLY the hash, never the
 * plaintext NIF, to the 6-arg overload of find_entity_matches.
 *
 * POST /find-entity-matches-proxy
 * Body: { orgId: string, email?: string | null, phone?: string | null,
 *         nif?: string | null, countryCode?: string }
 *
 * Requires any authenticated caller (resolveCallerIdentity). The RPC itself
 * runs through a client scoped to the caller's own JWT so its internal
 * auth.uid()-based visibility checks (get_user_visible_org_ids) behave
 * exactly as if the browser had called it directly.
 *
 * SECURITY: no log, error message, or response body produced by this
 * function may ever contain the plaintext NIF or the HMAC key.
 */
export async function handleFindEntityMatchesProxyRequest(
  req: Request,
  deps: FindEntityMatchesProxyDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const { supabaseAdmin } = deps;

  try {
    await resolveCallerIdentity(req, supabaseAdmin);
  } catch (e) {
    return authErrorResponse(e, getCorsHeaders(req));
  }

  const authHeader = req.headers.get("Authorization") ?? "";

  const rawBody = await req.json().catch(() => null);
  if (rawBody === null) {
    return errorResponse(req, 400, "INVALID_INPUT", "Invalid JSON body");
  }

  const parsed = requestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid request";
    return errorResponse(req, 400, "INVALID_INPUT", message);
  }

  const { orgId, email, phone, nif } = parsed.data;
  const countryCode = (parsed.data.countryCode ?? "PT").toUpperCase();

  if (!email && !phone && !nif) {
    return jsonResponse(req, { success: true, data: [] }, 200);
  }

  let nifHash: string | null = null;
  const trimmedNif = nif != null ? nif.trim() : "";
  const nifProvided = trimmedNif !== "" && normalizeNif(trimmedNif) !== "";

  if (nifProvided) {
    let hmacKey: NifKey;
    try {
      hmacKey = deps.getHmacKey();
    } catch (e: unknown) {
      console.error(
        "find-entity-matches-proxy: failed to derive HMAC key:",
        e instanceof Error ? e.message : "unknown error",
      );
      await captureError(e, {
        function: "find-entity-matches-proxy",
        stage: "derive-keys",
      });
      return errorResponse(req, 500, "INTERNAL_ERROR", "Internal error");
    }

    try {
      nifHash = await hashNif(trimmedNif, hmacKey);
    } catch (e: unknown) {
      console.error(
        "find-entity-matches-proxy: failed to hash nif:",
        e instanceof Error ? e.message : "unknown error",
      );
      await captureError(e, {
        function: "find-entity-matches-proxy",
        stage: "hash-nif",
      });
      return errorResponse(req, 500, "INTERNAL_ERROR", "Internal error");
    }
  }

  const userClient = deps.createUserClient(authHeader);

  // Transient connection failures are retried with backoff; business errors
  // from find_entity_matches (returned in `error`, never thrown) are never
  // retried — see withRetryResult.
  const { data, error } = await withRetryResult(() =>
    userClient.rpc("find_entity_matches", {
      p_org_id: orgId,
      p_email: email ?? null,
      p_phone: phone ?? null,
      p_nif: null,
      p_country_code: countryCode,
      p_nif_hash: nifHash,
    })
  );

  if (error) {
    console.error(
      "find-entity-matches-proxy: find_entity_matches RPC failed:",
      error.message,
    );
    await captureError(error, {
      function: "find-entity-matches-proxy",
      stage: "rpc",
    });
    const status = typeof error.status === "number" ? error.status : 400;
    return errorResponse(req, status, "INTERNAL_ERROR", "Internal error");
  }

  // deno-lint-ignore no-explicit-any
  const rows = (data ?? []).map((r: any) => mapRow(r));
  return jsonResponse(req, { success: true, data: rows }, 200);
}
