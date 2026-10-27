import { z } from "npm:zod";
import { authErrorResponse, resolveCallerIdentity } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
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
  "neg_guardar_nif_pessoa",
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
  /**
   * Builds a service_role Supabase client WITHOUT any user Authorization header. Used ONLY for
   * neg_guardar_nif_pessoa, whose EXECUTE is granted to service_role alone: the proxy passes the
   * already-verified JWT user as `p_actor_auth_uid` and the function re-validates it inside.
   */
  // deno-lint-ignore no-explicit-any
  createServiceClient: () => any;
  /** Resolves the AES-256-GCM encryption key. Must throw a clear error if unavailable. */
  getEncKey: () => NifKey;
  /** Resolves the HMAC-SHA256 key. Must throw a clear error if unavailable. */
  getHmacKey: () => NifKey;
}

function jsonResponse(req: Request, body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

/** RPCs que correm com service_role e recebem o actor verificado (nunca o do cliente). */
const SERVICE_ROLE_RPCS: readonly string[] = ["neg_guardar_nif_pessoa"];

/** Parametros de actor: so o proxy os define, a partir do JWT validado. */
const ACTOR_PARAM_KEY = "p_actor_auth_uid";
const CLIENT_ACTOR_KEY = /^p_actor/;

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
  // O actor nunca vem do cliente (p_actor_auth_uid, p_actor, ...).
  for (const key of Object.keys(sanitized)) {
    if (CLIENT_ACTOR_KEY.test(key)) delete sanitized[key];
  }
  return sanitized;
}

/**
 * Limite de tentativas com NIF por utilizador autenticado (janela deslizante, EM MEMORIA).
 *
 * ATENCAO: isto NAO e um controlo de seguranca. Vive em cada isolate da Edge Function: com
 * varias instancias concorrentes e arranques a frio o limite real e 10 x n.o de isolates e
 * recomeca a cada arranque, e quem chame a RPC directamente por PostgREST nao passa por aqui.
 * O limite que conta esta na base, dentro de neg_guardar_nif_pessoa (tabela
 * neg_nif_tentativas, NG032, migration 20261231600000). Este fica so como camada extra, que
 * poupa a ida a base a um cliente insistente na mesma instancia.
 */
export const NIF_RATE_LIMIT_MAX = 10;
export const NIF_RATE_LIMIT_WINDOW_MS = 60_000;
/** De quantas em quantas tentativas se varrem as chaves antigas do Map. */
export const NIF_RATE_LIMIT_SWEEP_EVERY = 100;
/** Teto de chaves: passado este tamanho, varre-se em cada tentativa. */
export const NIF_RATE_LIMIT_MAX_KEYS = 5_000;

const nifAttempts = new Map<string, number[]>();
let attemptsSinceSweep = 0;

/** Apaga as chaves cujas marcas estao todas fora da janela (sem isto o Map cresce sem fim). */
function sweepNifAttempts(now: number): void {
  for (const [key, marks] of nifAttempts) {
    if (marks.every((t) => now - t >= NIF_RATE_LIMIT_WINDOW_MS)) nifAttempts.delete(key);
  }
}

/** Regista uma tentativa e devolve false se o utilizador ja esgotou o limite na janela. */
function consumeNifAttempt(userKey: string, now: number): boolean {
  attemptsSinceSweep += 1;
  if (attemptsSinceSweep >= NIF_RATE_LIMIT_SWEEP_EVERY || nifAttempts.size >= NIF_RATE_LIMIT_MAX_KEYS) {
    attemptsSinceSweep = 0;
    sweepNifAttempts(now);
  }
  const recent = (nifAttempts.get(userKey) ?? []).filter(
    (t) => now - t < NIF_RATE_LIMIT_WINDOW_MS,
  );
  if (recent.length >= NIF_RATE_LIMIT_MAX) {
    nifAttempts.set(userKey, recent);
    return false;
  }
  nifAttempts.set(userKey, [...recent, now]);
  return true;
}

/** Apenas para testes: limpa o estado do limite de tentativas. */
export function resetNifRateLimitForTests(): void {
  nifAttempts.clear();
  attemptsSinceSweep = 0;
}

/** Apenas para testes: quantas chaves o limite em memoria guarda. */
export function nifRateLimitKeyCountForTests(): number {
  return nifAttempts.size;
}

/** Codigo de erro proprio das funcoes neg_* (NG001..NG999), ou null. */
const CODIGO_NG = /^NG\d{3}$/;

/**
 * neg_guardar_nif_pessoa devolve (nao lanca) a recusa por NIF repetido, para o contador de
 * tentativas da base ficar gravado: {erro: 'NG030'|'NG031', mensagem}. Le essa recusa, ou null.
 */
function recusaDevolvida(data: unknown): { codigo: string; mensagem: string } | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const { erro, mensagem } = data as { erro?: unknown; mensagem?: unknown };
  if (typeof erro !== "string" || !CODIGO_NG.test(erro)) return null;
  return { codigo: erro, mensagem: typeof mensagem === "string" ? mensagem : "" };
}

/** A mensagem com o codigo NG a frente (o ecra le o codigo do texto), sem o repetir. */
function comCodigo(codigo: unknown, mensagem: string): string {
  if (typeof codigo !== "string" || !CODIGO_NG.test(codigo) || mensagem.includes(codigo)) return mensagem;
  return `${codigo} ${mensagem}`.trim();
}

/** Replaces any occurrence of the plaintext NIF (with and without separators) in a message. */
export function redactNif(message: string, nif: string): string {
  if (nif === "") return message;
  let result = message.split(nif).join("***");
  const digits = nif.replace(/\D/g, "");
  if (digits !== nif && digits !== "") result = result.split(digits).join("***");
  return result;
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
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const { supabaseAdmin } = deps;

  let caller;
  try {
    caller = await resolveCallerIdentity(req, supabaseAdmin);
  } catch (e) {
    return authErrorResponse(e, getCorsHeaders(req));
  }
  // caller is resolved purely to enforce "must be authenticated"; the
  // specific write permission is delegated to the target RPC below.
  void caller;

  const authHeader = req.headers.get("Authorization") ?? "";

  const rawBody = await req.json().catch(() => null);
  if (rawBody === null) {
    return jsonResponse(req, { error: "Invalid JSON body" }, 400);
  }

  const parsed = requestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonResponse(
      req,
      { error: "Invalid request", details: parsed.error.issues },
      400,
    );
  }

  const { rpc, nif, params } = parsed.data;

  if (!isAllowedRpc(rpc)) {
    return jsonResponse(req, { error: "RPC não permitida" }, 400);
  }

  const usaServiceRole = SERVICE_ROLE_RPCS.includes(rpc);
  // A chave service_role ou o segredo do cron nao sao um utilizador: nao ha actor a validar na
  // base, por isso nem se chega la.
  if (usaServiceRole && caller.isServiceRole) {
    console.warn(`nif-write-proxy: rpc "${rpc}" recusada a chamador interno`);
    return jsonResponse(req, { error: "Não autorizado" }, 403);
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

  if (nifProvided || rpc === "neg_guardar_nif_pessoa") {
    const userKey = caller.authUid || caller.anewUserId || "unknown";
    if (!consumeNifAttempt(userKey, Date.now())) {
      // Registo de seguranca: identifica o utilizador e a RPC, nunca o NIF.
      console.warn(
        `nif-write-proxy: rate limit exceeded user=${userKey} rpc=${rpc}`,
      );
      return jsonResponse(
        req,
        { error: "Demasiadas tentativas. Tente novamente dentro de um minuto." },
        429,
      );
    }
  }

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
        req,
        { error: `Encryption keys unavailable: ${message}` },
        500,
      );
    }

    try {
      // neg_guardar_nif_pessoa nao usa tokens: nem sequer se calculam.
      const wantsTokens = rpc !== "neg_guardar_nif_pessoa";
      const [nifEncrypted, nifHash, nifTokens] = await Promise.all([
        encryptNif(trimmedNif, encKey),
        hashNif(trimmedNif, hmacKey),
        wantsTokens ? tokenizeNif(trimmedNif, hmacKey) : Promise.resolve(null),
      ]);

      finalParams = {
        ...sanitizedParams,
        p_nif_encrypted: nifEncrypted,
        p_nif_hash: nifHash,
        ...(wantsTokens ? { p_nif_tokens: nifTokens } : {}),
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
      return jsonResponse(req, { error: "Failed to process NIF" }, 500);
    }
  }

  // neg_guardar_nif_pessoa: p_nif e SEMPRE o NIF aparado que o proxy cifrou (a RPC confere o
  // tamanho da cifra contra ele), e um NIF vazio limpa: hash, cifra e tokens a NULL explicitos.
  // A RPC ja nao recebe tokens: o proxy nao os calcula nem os passa (os do cliente foram descartados).
  if (rpc === "neg_guardar_nif_pessoa") {
    const { p_nif_tokens: _tokens, ...semTokens } = finalParams;
    void _tokens;
    finalParams = nifProvided
      ? { ...semTokens, p_nif: trimmedNif }
      : {
        ...semTokens,
        p_nif: "",
        p_nif_hash: null,
        p_nif_encrypted: null,
      };
  }

  // neg_guardar_nif_pessoa: cliente service_role sem cabecalho do utilizador; o actor e o auth uid
  // que o JWT validado acima deu (a funcao revalida-o dentro). As restantes RPCs correm com o JWT.
  const rpcClient = usaServiceRole ? deps.createServiceClient() : deps.createUserClient(authHeader);
  const rpcParams = usaServiceRole
    ? { ...finalParams, [ACTOR_PARAM_KEY]: caller.authUid }
    : finalParams;

  // Transient connection failures (pool exhaustion, 502/503/504) are retried
  // with backoff; the target RPC's own business/permission errors (returned
  // in `error`, never thrown) are never retried — see withRetryResult.
  const { data, error } = await withRetryResult(() => rpcClient.rpc(rpc, rpcParams));

  if (error) {
    // O NIF nunca vai a log nem a erro devolvido, mesmo que a RPC o ecoe.
    const safeMessage = comCodigo(
      error.code,
      redactNif(String(error.message ?? "RPC failed"), trimmedNif),
    );
    console.error(`nif-write-proxy: rpc "${rpc}" failed:`, safeMessage);
    // NG032: limite de tentativas da base (o que conta, partilhado por todas as instancias).
    // 42501: recusa por falta de permissao na base.
    const status = error.code === "NG032"
      ? 429
      : error.code === "42501"
      ? 403
      : typeof error.status === "number" ? error.status : 400;
    return jsonResponse(
      req,
      { error: safeMessage },
      status,
    );
  }

  if (rpc === "neg_guardar_nif_pessoa") {
    const recusa = recusaDevolvida(data);
    if (recusa) {
      const safeMessage = comCodigo(recusa.codigo, redactNif(recusa.mensagem, trimmedNif));
      return jsonResponse(req, { error: safeMessage }, 409);
    }
  }

  return jsonResponse(req, { data: stripSensitiveFields(data) }, 200);
}
