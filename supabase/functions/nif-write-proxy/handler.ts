import { z } from "npm:zod";
import { authErrorResponse, resolveCallerIdentity } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { captureError } from "../_shared/sentry.ts";
import { encryptNif, hashNif, tokenizeNif } from "../_shared/nifCrypto.ts";
import { withRetryResult } from "../_shared/retry.ts";

/**
 * Closed allowlist of RPCs this proxy is allowed to invoke.
 *
 * This is the single most important security control in this function: it
 * MUST stay a hardcoded, closed list. Without it, this Edge Function would
 * be an arbitrary-RPC-call proxy for any authenticated user, which would be
 * a severe security hole (any RPC in the schema could be invoked with any
 * parameters, service-role-forwarded-auth notwithstanding).
 */
export const ALLOWED_RPCS = [
  "create_contact_with_role",
  "rpc_update_contact",
  "rpc_create_client_manual",
  "rpc_update_client",
  "rpc_create_organization",
  "rpc_update_organization",
  "rpc_create_organization_with_hierarchy",
  "rpc_update_user",
] as const;

export type AllowedRpc = (typeof ALLOWED_RPCS)[number];

/**
 * Parameter keys that are computed exclusively inside this function from the
 * plaintext `nif` field. A client must never be able to set these directly:
 * doing so would let a malicious client inject a hash/tokens pair that is
 * incoherent with the actual NIF value (e.g. to poison lookup indexes or
 * impersonate another entity's NIF fingerprint).
 */
const NIF_DERIVED_PARAM_KEYS = [
  "p_nif_encrypted",
  "p_nif_hash",
  "p_nif_tokens",
] as const;

/**
 * Fields that must never leak back to the client in the response body, even
 * if (unexpectedly) present in the RPC's own return payload. Defense in
 * depth: the RPCs are not expected to return these, but we strip them
 * explicitly anyway.
 */
const SENSITIVE_RESPONSE_KEYS = [
  "nif",
  "nif_encrypted",
  "nif_hash",
  "p_nif_encrypted",
  "p_nif_hash",
  "p_nif_tokens",
];

const requestSchema = z.object({
  rpc: z.string(),
  nif: z.string().nullable().optional(),
  params: z.record(z.string(), z.unknown()),
});

/**
 * A raw key (Uint8Array, as returned by deriveKeyFromEnv) or an already
 * imported CryptoKey. Both are accepted transparently by nifCrypto.ts.
 */
type NifKey = Uint8Array | CryptoKey;

export interface NifWriteProxyDeps {
  /**
   * Service-role (or otherwise privileged) Supabase client, used ONLY to
   * resolve the caller's identity (auth.getUser + anew_users lookup). It is
   * never used to perform the actual RPC write.
   */
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any;
  /**
   * Builds a Supabase client scoped to the caller's own JWT (the incoming
   * request's `Authorization` header, forwarded as-is). The RPC call itself
   * MUST run through this client so that every internal `auth.uid()`-based
   * permission check inside the RPC behaves exactly as it would if the
   * browser called the RPC directly.
   */
  // deno-lint-ignore no-explicit-any
  createUserClient: (authHeader: string) => any;
  /** Resolves the AES-256-GCM encryption key. Must throw a clear error if unavailable. */
  getEncKey: () => NifKey;
  /** Resolves the HMAC-SHA256 key. Must throw a clear error if unavailable. */
  getHmacKey: () => NifKey;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isAllowedRpc(rpc: string): rpc is AllowedRpc {
  return (ALLOWED_RPCS as readonly string[]).includes(rpc);
}

/**
 * Removes any client-supplied nif-derived keys from `params` before this
 * function's own computed values (if any) are merged in. Returns a new
 * object; never mutates the input.
 */
function sanitizeClientParams(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized = { ...params };
  for (const key of NIF_DERIVED_PARAM_KEYS) {
    delete sanitized[key];
  }
  return sanitized;
}

/**
 * Recursively strips sensitive keys from an arbitrary response payload
 * before it is sent back to the client. Never mutates the input.
 */
function stripSensitiveFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripSensitiveFields(item)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const clone: Record<string, unknown> = {};
    for (const key of Object.keys(source)) {
      if (SENSITIVE_RESPONSE_KEYS.includes(key)) continue;
      clone[key] = stripSensitiveFields(source[key]);
    }
    return clone as unknown as T;
  }
  return value;
}

/**
 * nif-write-proxy
 *
 * The ONLY sanctioned path for the frontend to call any of the 8 write RPCs
 * that accept a NIF. The browser sends the plaintext NIF (when relevant);
 * this function derives the encrypted/hash/tokenized representations
 * server-side, calls the target RPC on the caller's behalf, and returns only
 * the RPC's result — never the derived NIF fields, never the plaintext NIF.
 *
 * POST /nif-write-proxy
 * Body: { rpc: string, nif?: string | null, params: Record<string, unknown> }
 *
 * Requires any authenticated caller (resolveCallerIdentity). Authorization
 * for the specific write is entirely delegated to the target RPC itself,
 * which runs under the caller's own JWT so its internal auth.uid() checks
 * behave exactly as if the browser had called it directly.
 *
 * SECURITY: no log, error message, or response body produced by this
 * function may ever contain the plaintext NIF or the encryption/HMAC keys.
 */
export async function handleNifWriteProxyRequest(
  req: Request,
  deps: NifWriteProxyDeps,
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
  // caller is resolved purely to enforce "must be authenticated"; the
  // specific write permission is delegated to the target RPC below.
  void caller;

  const authHeader = req.headers.get("Authorization") ?? "";

  const rawBody = await req.json().catch(() => null);
  if (rawBody === null) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const parsed = requestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonResponse(
      { error: "Invalid request", details: parsed.error.issues },
      400,
    );
  }

  const { rpc, nif, params } = parsed.data;

  if (!isAllowedRpc(rpc)) {
    return jsonResponse({ error: "RPC não permitida" }, 400);
  }

  // Higienização: descarta imediatamente qualquer p_nif_encrypted/p_nif_hash/
  // p_nif_tokens vindo do cliente — só o cálculo interno abaixo pode definir
  // estes três campos.
  const sanitizedParams = sanitizeClientParams(params);

  let finalParams: Record<string, unknown> = sanitizedParams;

  // NIF is optional on every RPC this proxy fronts. A blank/whitespace-only
  // string must be treated the same as null/undefined ("no NIF supplied"),
  // not rejected as an error — the caller (e.g. UsersNew.tsx saving a User
  // with no NIF) legitimately has nothing to send here. Previously this
  // returned a hard 400 "NIF inválido" for any blank string, which blocked
  // saving entities that simply don't have a NIF filled in.
  const trimmedNif = nif != null ? nif.trim() : "";
  const nifProvided = trimmedNif !== "";

  if (nifProvided) {
    let encKey: NifKey;
    let hmacKey: NifKey;
    try {
      encKey = deps.getEncKey();
      hmacKey = deps.getHmacKey();
    } catch (e: unknown) {
      const message = e instanceof Error
        ? e.message
        : "unknown error deriving encryption keys";
      console.error(
        "nif-write-proxy: failed to derive encryption keys:",
        message,
      );
      await captureError(e, {
        function: "nif-write-proxy",
        stage: "derive-keys",
      });
      return jsonResponse(
        { error: `Encryption keys unavailable: ${message}` },
        500,
      );
    }

    try {
      const [nifEncrypted, nifHash, nifTokens] = await Promise.all([
        encryptNif(trimmedNif, encKey),
        hashNif(trimmedNif, hmacKey),
        tokenizeNif(trimmedNif, hmacKey),
      ]);

      finalParams = {
        ...sanitizedParams,
        p_nif_encrypted: nifEncrypted,
        p_nif_hash: nifHash,
        p_nif_tokens: nifTokens,
      };
    } catch (e: unknown) {
      console.error(
        "nif-write-proxy: failed to derive nif fields:",
        e instanceof Error ? e.message : "unknown error",
      );
      await captureError(e, {
        function: "nif-write-proxy",
        stage: "derive-nif-fields",
      });
      return jsonResponse({ error: "Failed to process NIF" }, 500);
    }
  }

  const userClient = deps.createUserClient(authHeader);

  // Transient connection failures (pool exhaustion, 502/503/504) are retried
  // with backoff; the target RPC's own business/permission errors (returned
  // in `error`, never thrown) are never retried — see withRetryResult.
  const { data, error } = await withRetryResult(() => userClient.rpc(rpc, finalParams));

  if (error) {
    console.error(`nif-write-proxy: rpc "${rpc}" failed:`, error.message);
    const status = typeof error.status === "number" ? error.status : 400;
    return jsonResponse(
      { error: stripSensitiveFields(error.message ?? "RPC failed") },
      status,
    );
  }

  return jsonResponse({ data: stripSensitiveFields(data) }, 200);
}
