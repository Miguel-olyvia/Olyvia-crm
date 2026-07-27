/**
 * find-entity-matches-proxy — request handler tests.
 *
 * These tests import handler.ts directly (not index.ts) so that Deno.serve
 * is never invoked in the test process. The Supabase clients and the HMAC
 * key provider are injected via FindEntityMatchesProxyDeps, following the
 * same "extract logic, inject dependencies" pattern used elsewhere in this
 * repo's *.test.ts files (see nif-write-proxy/index.test.ts).
 */

import {
  assert,
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { hashNif } from "../_shared/nifCrypto.ts";
import {
  handleFindEntityMatchesProxyRequest,
  type FindEntityMatchesProxyDeps,
} from "./handler.ts";

const TEST_NIF = "123456789";
const CALLER_JWT = "caller-jwt-token";

function randomKey(): Uint8Array {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes;
}

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

function makeMockSupabaseAdmin(options: {
  authUser?: { id: string } | null;
  anewUser?: { id: string } | null;
} = {}) {
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
  };
  return supabaseAdmin;
}

interface RpcCall {
  rpc: string;
  params: Record<string, unknown>;
}

function makeMockUserClientFactory(options: {
  rpcError?: { message: string; status?: number };
  rpcData?: unknown;
} = {}) {
  const createUserClientCalls: string[] = [];
  const rpcCalls: RpcCall[] = [];

  const createUserClient = (authHeader: string) => {
    createUserClientCalls.push(authHeader);
    return {
      rpc: async (rpc: string, params: Record<string, unknown>) => {
        rpcCalls.push({ rpc, params });
        if (options.rpcError) {
          return { data: null, error: options.rpcError };
        }
        return { data: options.rpcData ?? [], error: null };
      },
    };
  };

  return { createUserClient, createUserClientCalls, rpcCalls };
}

function makeRequest(body: unknown, authHeader?: string): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authHeader !== undefined) headers["Authorization"] = authHeader;
  return new Request("https://example.com/find-entity-matches-proxy", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function baseDeps(
  overrides: Partial<FindEntityMatchesProxyDeps> = {},
): FindEntityMatchesProxyDeps {
  const { createUserClient } = makeMockUserClientFactory();
  return {
    supabaseAdmin: makeMockSupabaseAdmin({
      authUser: { id: "auth-user-1" },
      anewUser: { id: "anew-user-1" },
    }),
    createUserClient,
    getHmacKey: () => randomKey(),
    ...overrides,
  };
}

Deno.test("no Authorization header => 401", async () => {
  const deps = baseDeps();
  const req = makeRequest({ orgId: "org-1", nif: TEST_NIF });
  const res = await handleFindEntityMatchesProxyRequest(req, deps);
  assertEquals(res.status, 401);
});

Deno.test("invalid/expired token => 401", async () => {
  const deps = baseDeps({
    supabaseAdmin: makeMockSupabaseAdmin({ authUser: null }),
  });
  const req = makeRequest({ orgId: "org-1", nif: TEST_NIF }, `Bearer ${CALLER_JWT}`);
  const res = await handleFindEntityMatchesProxyRequest(req, deps);
  assertEquals(res.status, 401);
});

Deno.test("missing orgId => 400", async () => {
  const deps = baseDeps();
  const req = makeRequest({ nif: TEST_NIF }, `Bearer ${CALLER_JWT}`);
  const res = await handleFindEntityMatchesProxyRequest(req, deps);
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.success, false);
  assertEquals(body.code, "INVALID_INPUT");
});

Deno.test("no email/phone/nif => returns empty result without calling the RPC", async () => {
  const { createUserClient, rpcCalls } = makeMockUserClientFactory();
  const deps = baseDeps({ createUserClient });

  const req = makeRequest({ orgId: "org-1" }, `Bearer ${CALLER_JWT}`);
  const res = await handleFindEntityMatchesProxyRequest(req, deps);

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body, { success: true, data: [] });
  assertEquals(rpcCalls.length, 0);
});

Deno.test("valid nif => RPC receives p_nif_hash and p_nif is always null", async () => {
  const { createUserClient, rpcCalls } = makeMockUserClientFactory();
  const hmacKey = randomKey();
  const deps = baseDeps({ createUserClient, getHmacKey: () => hmacKey });

  const req = makeRequest(
    { orgId: "org-1", nif: TEST_NIF, countryCode: "pt" },
    `Bearer ${CALLER_JWT}`,
  );
  const res = await handleFindEntityMatchesProxyRequest(req, deps);

  assertEquals(res.status, 200);
  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0].rpc, "find_entity_matches");

  const { params } = rpcCalls[0];
  assertEquals(params.p_org_id, "org-1");
  assertEquals(params.p_country_code, "PT");
  assertEquals(params.p_nif, null);

  const expectedHash = await hashNif(TEST_NIF, hmacKey);
  assertEquals(params.p_nif_hash, expectedHash);
  assertNotEquals(params.p_nif_hash, TEST_NIF);
});

Deno.test("nif omitted, email provided => RPC call has p_nif_hash null and p_nif null", async () => {
  const { createUserClient, rpcCalls } = makeMockUserClientFactory();
  const deps = baseDeps({ createUserClient });

  const req = makeRequest(
    { orgId: "org-1", email: "acme@example.com" },
    `Bearer ${CALLER_JWT}`,
  );
  const res = await handleFindEntityMatchesProxyRequest(req, deps);

  assertEquals(res.status, 200);
  const { params } = rpcCalls[0];
  assertEquals(params.p_email, "acme@example.com");
  assertEquals(params.p_nif, null);
  assertEquals(params.p_nif_hash, null);
});

Deno.test("RPC response rows are mapped to the documented camelCase shape", async () => {
  const rpcData = [
    {
      entity_id: "entity-1",
      scope: "same_org",
      primary_org_id: "org-1",
      primary_org_name: "Acme Lda",
      owner_org_accessible: true,
      match_field: "nif",
      display_name: "Acme Lda",
    },
  ];
  const { createUserClient } = makeMockUserClientFactory({ rpcData });
  const deps = baseDeps({ createUserClient });

  const req = makeRequest({ orgId: "org-1", nif: TEST_NIF }, `Bearer ${CALLER_JWT}`);
  const res = await handleFindEntityMatchesProxyRequest(req, deps);
  const body = await res.json();

  assertEquals(body, {
    success: true,
    data: [
      {
        entityId: "entity-1",
        scope: "same_org",
        primaryOrgId: "org-1",
        primaryOrgName: "Acme Lda",
        ownerOrgAccessible: true,
        matchField: "nif",
        displayName: "Acme Lda",
      },
    ],
  });
});

Deno.test("rpc error is not echoed raw to the client", async () => {
  const { createUserClient, rpcCalls } = makeMockUserClientFactory({
    rpcError: { message: "internal db error with sensitive detail", status: 500 },
  });
  const deps = baseDeps({ createUserClient });

  const req = makeRequest({ orgId: "org-1", nif: TEST_NIF }, `Bearer ${CALLER_JWT}`);
  const res = await handleFindEntityMatchesProxyRequest(req, deps);

  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.success, false);
  assertEquals(body.error, "Internal error");
  assertEquals(rpcCalls.length, 1);
});

Deno.test("rpc call uses the caller's own JWT via createUserClient, never a fixed service-role client", async () => {
  const { createUserClient, createUserClientCalls, rpcCalls } =
    makeMockUserClientFactory();
  const deps = baseDeps({ createUserClient });

  const req = makeRequest({ orgId: "org-1", nif: TEST_NIF }, `Bearer ${CALLER_JWT}`);
  await handleFindEntityMatchesProxyRequest(req, deps);

  assertEquals(createUserClientCalls.length, 1);
  assertEquals(createUserClientCalls[0], `Bearer ${CALLER_JWT}`);
  assertEquals(rpcCalls.length, 1);
});

Deno.test("response and logs never contain the plaintext test NIF", async () => {
  const { createUserClient } = makeMockUserClientFactory();
  const deps = baseDeps({ createUserClient });

  const captured = captureLogs();
  let res: Response;
  try {
    const req = makeRequest({ orgId: "org-1", nif: TEST_NIF }, `Bearer ${CALLER_JWT}`);
    res = await handleFindEntityMatchesProxyRequest(req, deps);
  } finally {
    captured.restore();
  }

  const bodyText = await res.text();
  assert(!bodyText.includes(TEST_NIF));
  for (const line of captured.lines) {
    assertEquals(line.includes(TEST_NIF), false);
  }
});
