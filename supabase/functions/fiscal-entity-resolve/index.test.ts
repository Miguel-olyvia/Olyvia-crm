/**
 * fiscal-entity-resolve — request handler tests.
 *
 * These tests import handler.ts directly (not index.ts) so that Deno.serve
 * is never invoked in the test process. The Supabase service-role client and
 * the encryption/HMAC key providers are injected via FiscalEntityResolveDeps,
 * following the same "extract logic, inject dependencies" pattern used
 * elsewhere in this repo's *.test.ts files (see nif-write-proxy/index.test.ts,
 * nif-backfill/index.test.ts).
 */

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decryptNif, hashNif } from "../_shared/nifCrypto.ts";
import {
  handleFiscalEntityResolveRequest,
  type FiscalEntityResolveDeps,
} from "./handler.ts";

const TEST_NIF = "123456789";
const CALLER_JWT = "caller-jwt-token";

// ── crypto key fixtures ──

function randomKey(): Uint8Array {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes;
}

// ── log capture (asserts plaintext NIF / hash never appear in logs) ──

function captureLogs() {
  const lines: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  return {
    lines,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
    },
  };
}

// ── mock service-role Supabase client (auth.getUser + anew_users + rpc) ──

interface ResolveRpcCall {
  rpc: string;
  params: Record<string, unknown>;
}

interface FiscalEntitiesRow {
  id: string;
  nif_hash: string;
  country_code: string;
  commercial_name: string | null;
}

function makeMockSupabaseAdmin(options: {
  authUser?: { id: string } | null;
  anewUser?: { id: string } | null;
  rpcError?: { message: string; code?: string; status?: number };
  /** Simulates the fiscal_entities table state for the ON CONFLICT upsert. */
  existingRows?: FiscalEntitiesRow[];
} = {}) {
  const rpcCalls: ResolveRpcCall[] = [];
  const rows: FiscalEntitiesRow[] = options.existingRows
    ? [...options.existingRows]
    : [];
  let nextId = 1;

  // deno-lint-ignore no-explicit-any
  const supabaseAdmin: any = {
    auth: {
      getUser: async (_token: string) => {
        if (!options.authUser) {
          return { data: { user: null }, error: new Error("invalid token") };
        }
        return { data: { user: options.authUser }, error: null };
      },
    },
    // deno-lint-ignore no-explicit-any
    from(table: string): any {
      if (table === "anew_users") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: options.anewUser ?? null,
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table in mock supabaseAdmin: ${table}`);
    },
    rpc: async (rpc: string, params: Record<string, unknown>) => {
      rpcCalls.push({ rpc, params });

      if (options.rpcError) {
        return { data: null, error: options.rpcError };
      }

      if (rpc !== "resolve_fiscal_entity") {
        throw new Error(`Unexpected rpc in mock supabaseAdmin: ${rpc}`);
      }

      // Emulates the atomic ON CONFLICT (nif_hash, country_code) upsert.
      const existing = rows.find(
        (r) =>
          r.nif_hash === params.p_nif_hash &&
          r.country_code === params.p_country_code,
      );

      if (existing) {
        if (params.p_commercial_name) {
          existing.commercial_name = params.p_commercial_name as string;
        }
        return {
          data: [{ fiscal_entity_id: existing.id, existed: true }],
          error: null,
        };
      }

      const created: FiscalEntitiesRow = {
        id: `fiscal-entity-${nextId++}`,
        nif_hash: params.p_nif_hash as string,
        country_code: params.p_country_code as string,
        commercial_name: (params.p_commercial_name as string | null) ?? null,
      };
      rows.push(created);
      return {
        data: [{ fiscal_entity_id: created.id, existed: false }],
        error: null,
      };
    },
  };

  return { supabaseAdmin, rpcCalls, rows };
}

function makeRequest(body: unknown, authHeader?: string): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authHeader !== undefined) headers["Authorization"] = authHeader;
  return new Request("https://example.com/fiscal-entity-resolve", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function baseDeps(
  overrides: Partial<FiscalEntityResolveDeps> = {},
  adminOptions: Parameters<typeof makeMockSupabaseAdmin>[0] = {},
): { deps: FiscalEntityResolveDeps; rpcCalls: ResolveRpcCall[]; rows: FiscalEntitiesRow[] } {
  const { supabaseAdmin, rpcCalls, rows } = makeMockSupabaseAdmin({
    authUser: { id: "auth-user-1" },
    anewUser: { id: "anew-user-1" },
    ...adminOptions,
  });
  const deps: FiscalEntityResolveDeps = {
    supabaseAdmin,
    getEncKey: () => randomKey(),
    getHmacKey: () => randomKey(),
    ...overrides,
  };
  return { deps, rpcCalls, rows };
}

// ── tests ──

Deno.test("no Authorization header => 401 UNAUTHENTICATED", async () => {
  const { deps } = baseDeps();
  const req = makeRequest({ nif: TEST_NIF }); // no auth header
  const res = await handleFiscalEntityResolveRequest(req, deps);
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.success, false);
  assertEquals(body.code, "UNAUTHENTICATED");
});

Deno.test("invalid/expired token => 401 UNAUTHENTICATED", async () => {
  const { deps } = baseDeps({}, { authUser: null });
  const req = makeRequest({ nif: TEST_NIF }, `Bearer ${CALLER_JWT}`);
  const res = await handleFiscalEntityResolveRequest(req, deps);
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.code, "UNAUTHENTICATED");
});

Deno.test("missing nif => 400 INVALID_INPUT", async () => {
  const { deps, rpcCalls } = baseDeps();
  const req = makeRequest({}, `Bearer ${CALLER_JWT}`);
  const res = await handleFiscalEntityResolveRequest(req, deps);
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.success, false);
  assertEquals(body.code, "INVALID_INPUT");
  assertEquals(rpcCalls.length, 0);
});

Deno.test("blank nif after trim => 400 INVALID_INPUT", async () => {
  const { deps, rpcCalls } = baseDeps();
  const req = makeRequest({ nif: "   " }, `Bearer ${CALLER_JWT}`);
  const res = await handleFiscalEntityResolveRequest(req, deps);
  assertEquals(res.status, 400);
  assertEquals(rpcCalls.length, 0);
});

Deno.test("invalid countryCode => 400 INVALID_INPUT", async () => {
  const { deps, rpcCalls } = baseDeps();
  const req = makeRequest(
    { nif: TEST_NIF, countryCode: "PRT" },
    `Bearer ${CALLER_JWT}`,
  );
  const res = await handleFiscalEntityResolveRequest(req, deps);
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.code, "INVALID_INPUT");
  assertEquals(rpcCalls.length, 0);
});

Deno.test("new nif => creates a row; nif_hash/nif_encrypted match nifCrypto.ts", async () => {
  const encKey = randomKey();
  const hmacKey = randomKey();
  const { deps, rpcCalls } = baseDeps({
    getEncKey: () => encKey,
    getHmacKey: () => hmacKey,
  });

  const req = makeRequest(
    { nif: TEST_NIF, commercialName: "Acme Lda" },
    `Bearer ${CALLER_JWT}`,
  );
  const res = await handleFiscalEntityResolveRequest(req, deps);

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.data.existed, false);
  assert(typeof body.data.fiscalEntityId === "string");

  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0].rpc, "resolve_fiscal_entity");
  const { params } = rpcCalls[0];

  const expectedHash = await hashNif(TEST_NIF, hmacKey);
  assertEquals(params.p_nif_hash, expectedHash);
  assertEquals(params.p_country_code, "PT");
  assertEquals(params.p_commercial_name, "Acme Lda");

  const decrypted = await decryptNif(params.p_nif_encrypted as string, encKey);
  assertEquals(decrypted, TEST_NIF);
});

Deno.test("existing nif => reuses the row instead of duplicating it", async () => {
  const hmacKey = randomKey();
  const existingHash = await hashNif(TEST_NIF, hmacKey);

  const { deps, rpcCalls, rows } = baseDeps(
    { getHmacKey: () => hmacKey },
    {
      existingRows: [
        {
          id: "fiscal-entity-existing",
          nif_hash: existingHash,
          country_code: "PT",
          commercial_name: "Old Name",
        },
      ],
    },
  );

  const req = makeRequest({ nif: TEST_NIF }, `Bearer ${CALLER_JWT}`);
  const res = await handleFiscalEntityResolveRequest(req, deps);

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.data.existed, true);
  assertEquals(body.data.fiscalEntityId, "fiscal-entity-existing");

  // Still only ever one row for this (nif_hash, country_code) pair.
  assertEquals(rows.length, 1);
  assertEquals(rpcCalls.length, 1);
});

Deno.test("two concurrent writes of the same new nif do not duplicate (atomic ON CONFLICT emulated in the mock)", async () => {
  const hmacKey = randomKey();
  const { deps, rows } = baseDeps({ getHmacKey: () => hmacKey });

  const req1 = makeRequest({ nif: TEST_NIF }, `Bearer ${CALLER_JWT}`);
  const req2 = makeRequest({ nif: TEST_NIF }, `Bearer ${CALLER_JWT}`);

  const [res1, res2] = await Promise.all([
    handleFiscalEntityResolveRequest(req1, deps),
    handleFiscalEntityResolveRequest(req2, deps),
  ]);

  const [body1, body2] = await Promise.all([res1.json(), res2.json()]);

  assertEquals(res1.status, 200);
  assertEquals(res2.status, 200);
  assertEquals(body1.data.fiscalEntityId, body2.data.fiscalEntityId);
  // Exactly one of the two calls observes existed=false (the "creator");
  // the other observes existed=true (reused the just-created row).
  const existedFlags = [body1.data.existed, body2.data.existed].sort();
  assertEquals(existedFlags, [false, true]);
  assertEquals(rows.length, 1);
});

Deno.test("response never contains the plaintext nif, nif_hash, or nif_encrypted", async () => {
  const hmacKey = randomKey();
  const { deps } = baseDeps({ getHmacKey: () => hmacKey });
  const expectedHash = await hashNif(TEST_NIF, hmacKey);

  const req = makeRequest(
    { nif: TEST_NIF, commercialName: "Acme Lda" },
    `Bearer ${CALLER_JWT}`,
  );
  const res = await handleFiscalEntityResolveRequest(req, deps);
  const bodyText = await res.text();

  assertEquals(bodyText.includes(TEST_NIF), false);
  assertEquals(bodyText.includes(expectedHash), false);
  assertEquals(bodyText.includes("commercial_name"), false);
  assertEquals(bodyText.includes("nif_encrypted"), false);
});

Deno.test("response and logs never contain the plaintext nif on the happy path", async () => {
  const { deps } = baseDeps();
  const captured = captureLogs();
  let res: Response;
  try {
    const req = makeRequest({ nif: TEST_NIF }, `Bearer ${CALLER_JWT}`);
    res = await handleFiscalEntityResolveRequest(req, deps);
  } finally {
    captured.restore();
  }
  const bodyText = await res.text();
  assertEquals(bodyText.includes(TEST_NIF), false);
  for (const line of captured.lines) {
    assertEquals(line.includes(TEST_NIF), false);
  }
});

Deno.test("missing encryption key => 500 INTERNAL_ERROR without leaking key/nif details", async () => {
  const { deps } = baseDeps({
    getEncKey: () => {
      throw new Error("deriveKeyFromEnv: missing required environment variable \"NIF_ENC_KEY\"");
    },
  });

  const captured = captureLogs();
  let res: Response;
  try {
    const req = makeRequest({ nif: TEST_NIF }, `Bearer ${CALLER_JWT}`);
    res = await handleFiscalEntityResolveRequest(req, deps);
  } finally {
    captured.restore();
  }

  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.success, false);
  assertEquals(body.code, "INTERNAL_ERROR");
  assertEquals(body.error, "Internal error");
  assertEquals(JSON.stringify(body).includes(TEST_NIF), false);
});

Deno.test("resolve_fiscal_entity RPC unique-violation => 409 RESOLVE_CONFLICT", async () => {
  const { deps } = baseDeps(
    {},
    { rpcError: { message: "duplicate key value violates unique constraint", code: "23505" } },
  );

  const req = makeRequest({ nif: TEST_NIF }, `Bearer ${CALLER_JWT}`);
  const res = await handleFiscalEntityResolveRequest(req, deps);

  assertEquals(res.status, 409);
  const body = await res.json();
  assertEquals(body.success, false);
  assertEquals(body.code, "RESOLVE_CONFLICT");
});

Deno.test("resolve_fiscal_entity RPC unexpected error => 500 INTERNAL_ERROR", async () => {
  const { deps } = baseDeps(
    {},
    { rpcError: { message: "connection refused" } },
  );

  const req = makeRequest({ nif: TEST_NIF }, `Bearer ${CALLER_JWT}`);
  const res = await handleFiscalEntityResolveRequest(req, deps);

  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.code, "INTERNAL_ERROR");
});
