/**
 * nif-write-proxy — request handler tests.
 *
 * These tests import handler.ts directly (not index.ts) so that Deno.serve
 * is never invoked in the test process. The Supabase clients and the
 * encryption/HMAC key providers are injected via NifWriteProxyDeps,
 * following the same "extract logic, inject dependencies" pattern used
 * elsewhere in this repo's *.test.ts files (see nif-backfill/index.test.ts,
 * update-lead/index.test.ts).
 */

import {
  assert,
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decryptNif, hashNif, tokenizeNif } from "../_shared/nifCrypto.ts";
import {
  ALLOWED_RPCS,
  handleNifWriteProxyRequest,
  type NifWriteProxyDeps,
  resetNifRateLimitForTests,
} from "./handler.ts";

const TEST_NIF = "123456789";
const CALLER_JWT = "caller-jwt-token";

// ── crypto key fixtures ──

function randomKey(): Uint8Array {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes;
}

// ── log capture (asserts plaintext NIF never appears in logs) ──

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

// ── mock Supabase admin client (used only for resolveCallerIdentity) ──

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

// ── mock user-scoped client (used for the actual RPC call) ──

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
        return { data: options.rpcData ?? { id: "created-id" }, error: null };
      },
    };
  };

  return { createUserClient, createUserClientCalls, rpcCalls };
}

// ── mock service_role client (sem cabecalho do utilizador; so neg_guardar_nif_pessoa) ──

function makeMockServiceClientFactory(options: {
  rpcError?: { message: string; status?: number; code?: string };
  rpcData?: unknown;
} = {}) {
  let createServiceClientCalls = 0;
  const rpcCalls: RpcCall[] = [];

  const createServiceClient = () => {
    createServiceClientCalls += 1;
    return {
      rpc: async (rpc: string, params: Record<string, unknown>) => {
        rpcCalls.push({ rpc, params });
        if (options.rpcError) {
          return { data: null, error: options.rpcError };
        }
        return { data: options.rpcData ?? { mudou: true }, error: null };
      },
    };
  };

  return {
    createServiceClient,
    rpcCalls,
    callCount: () => createServiceClientCalls,
  };
}

function makeRequest(body: unknown, authHeader?: string): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authHeader !== undefined) headers["Authorization"] = authHeader;
  return new Request("https://example.com/nif-write-proxy", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function baseDeps(overrides: Partial<NifWriteProxyDeps> = {}): NifWriteProxyDeps {
  // O limite de tentativas em memoria vive no modulo: cada teste parte de zero.
  resetNifRateLimitForTests();
  const { createUserClient } = makeMockUserClientFactory();
  const { createServiceClient } = makeMockServiceClientFactory();
  return {
    supabaseAdmin: makeMockSupabaseAdmin({
      authUser: { id: "auth-user-1" },
      anewUser: { id: "anew-user-1" },
    }),
    createUserClient,
    createServiceClient,
    getEncKey: () => randomKey(),
    getHmacKey: () => randomKey(),
    ...overrides,
  };
}

// ── tests ──

Deno.test("no Authorization header => 401", async () => {
  const deps = baseDeps();
  const req = makeRequest({ rpc: ALLOWED_RPCS[0], params: {} }); // no auth header
  const res = await handleNifWriteProxyRequest(req, deps);
  assertEquals(res.status, 401);
});

Deno.test("invalid/expired token => 401", async () => {
  const deps = baseDeps({
    supabaseAdmin: makeMockSupabaseAdmin({ authUser: null }),
  });
  const req = makeRequest(
    { rpc: ALLOWED_RPCS[0], params: {} },
    `Bearer ${CALLER_JWT}`,
  );
  const res = await handleNifWriteProxyRequest(req, deps);
  assertEquals(res.status, 401);
});

Deno.test("rpc outside the allowlist => 400 and supabase.rpc is never called", async () => {
  const { createUserClient, rpcCalls } = makeMockUserClientFactory();
  const deps = baseDeps({ createUserClient });

  const req = makeRequest(
    { rpc: "delete_everything", params: { foo: "bar" } },
    `Bearer ${CALLER_JWT}`,
  );
  const res = await handleNifWriteProxyRequest(req, deps);

  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "RPC não permitida");
  assertEquals(rpcCalls.length, 0);
});

Deno.test("valid nif => final rpc call includes correctly derived p_nif_encrypted/p_nif_hash/p_nif_tokens, params unchanged otherwise", async () => {
  const { createUserClient, rpcCalls } = makeMockUserClientFactory();
  const encKey = randomKey();
  const hmacKey = randomKey();
  const deps = baseDeps({
    createUserClient,
    getEncKey: () => encKey,
    getHmacKey: () => hmacKey,
  });

  const req = makeRequest(
    {
      rpc: "rpc_create_client_manual",
      nif: TEST_NIF,
      params: { p_name: "Acme Lda", p_email: "acme@example.com" },
    },
    `Bearer ${CALLER_JWT}`,
  );
  const res = await handleNifWriteProxyRequest(req, deps);

  assertEquals(res.status, 200);
  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0].rpc, "rpc_create_client_manual");

  const { params } = rpcCalls[0];
  assertEquals(params.p_name, "Acme Lda");
  assertEquals(params.p_email, "acme@example.com");

  assert(typeof params.p_nif_encrypted === "string");
  const decrypted = await decryptNif(params.p_nif_encrypted as string, encKey);
  assertEquals(decrypted, TEST_NIF);

  const expectedHash = await hashNif(TEST_NIF, hmacKey);
  assertEquals(params.p_nif_hash, expectedHash);

  const expectedTokens = await tokenizeNif(TEST_NIF, hmacKey);
  assertEquals(params.p_nif_tokens, expectedTokens);
});

Deno.test("nif omitted => final rpc call does not include the 3 nif-derived fields", async () => {
  const { createUserClient, rpcCalls } = makeMockUserClientFactory();
  const deps = baseDeps({ createUserClient });

  const req = makeRequest(
    { rpc: "rpc_update_contact", params: { p_id: "c-1", p_name: "New Name" } },
    `Bearer ${CALLER_JWT}`,
  );
  const res = await handleNifWriteProxyRequest(req, deps);

  assertEquals(res.status, 200);
  assertEquals(rpcCalls.length, 1);
  const { params } = rpcCalls[0];
  assertEquals(params, { p_id: "c-1", p_name: "New Name" });
  assertEquals("p_nif_encrypted" in params, false);
  assertEquals("p_nif_hash" in params, false);
  assertEquals("p_nif_tokens" in params, false);
});

Deno.test("nif explicitly null => final rpc call does not include the 3 nif-derived fields", async () => {
  const { createUserClient, rpcCalls } = makeMockUserClientFactory();
  const deps = baseDeps({ createUserClient });

  const req = makeRequest(
    { rpc: "rpc_update_contact", nif: null, params: { p_id: "c-1" } },
    `Bearer ${CALLER_JWT}`,
  );
  const res = await handleNifWriteProxyRequest(req, deps);

  assertEquals(res.status, 200);
  const { params } = rpcCalls[0];
  assertEquals(params, { p_id: "c-1" });
});

Deno.test("nif provided but blank after trim => treated as no-NIF, RPC called without nif-derived fields", async () => {
  const { createUserClient, rpcCalls } = makeMockUserClientFactory();
  const deps = baseDeps({ createUserClient });

  const req = makeRequest(
    { rpc: "rpc_update_contact", nif: "   ", params: { p_id: "c-1" } },
    `Bearer ${CALLER_JWT}`,
  );
  const res = await handleNifWriteProxyRequest(req, deps);

  assertEquals(res.status, 200);
  assertEquals(rpcCalls.length, 1);
  const { params } = rpcCalls[0];
  assertEquals("p_nif_encrypted" in params, false);
  assertEquals("p_nif_hash" in params, false);
  assertEquals("p_nif_tokens" in params, false);
});

Deno.test("client-injected p_nif_hash is discarded; final call uses the internally computed hash", async () => {
  const { createUserClient, rpcCalls } = makeMockUserClientFactory();
  const hmacKey = randomKey();
  const deps = baseDeps({
    createUserClient,
    getHmacKey: () => hmacKey,
  });

  const req = makeRequest(
    {
      rpc: "rpc_create_client_manual",
      nif: TEST_NIF,
      params: {
        p_name: "Acme Lda",
        p_nif_hash: "hash-falso",
        p_nif_encrypted: "encrypted-falso",
        p_nif_tokens: ["falso"],
      },
    },
    `Bearer ${CALLER_JWT}`,
  );
  const res = await handleNifWriteProxyRequest(req, deps);

  assertEquals(res.status, 200);
  const { params } = rpcCalls[0];
  const expectedHash = await hashNif(TEST_NIF, hmacKey);
  assertEquals(params.p_nif_hash, expectedHash);
  assertNotEquals(params.p_nif_hash, "hash-falso");
  assertNotEquals(params.p_nif_encrypted, "encrypted-falso");
  assertNotEquals(params.p_nif_tokens, ["falso"]);
});

Deno.test("response and logs never contain the plaintext test NIF", async () => {
  const { createUserClient } = makeMockUserClientFactory({
    rpcData: { id: "created-id" },
  });
  const deps = baseDeps({ createUserClient });

  const captured = captureLogs();
  let res: Response;
  try {
    const req = makeRequest(
      {
        rpc: "rpc_create_client_manual",
        nif: TEST_NIF,
        params: { p_name: "Acme Lda" },
      },
      `Bearer ${CALLER_JWT}`,
    );
    res = await handleNifWriteProxyRequest(req, deps);
  } finally {
    captured.restore();
  }

  const bodyText = await res.text();
  assertEquals(bodyText.includes(TEST_NIF), false);
  for (const line of captured.lines) {
    assertEquals(line.includes(TEST_NIF), false);
  }
});

Deno.test("rpc error is propagated to the client", async () => {
  const { createUserClient, rpcCalls } = makeMockUserClientFactory({
    rpcError: { message: "permission denied for this organization", status: 403 },
  });
  const deps = baseDeps({ createUserClient });

  const req = makeRequest(
    { rpc: "rpc_update_organization", params: { p_id: "org-1" } },
    `Bearer ${CALLER_JWT}`,
  );
  const res = await handleNifWriteProxyRequest(req, deps);

  assertEquals(res.status, 403);
  const body = await res.json();
  assertEquals(body.error, "permission denied for this organization");
  assertEquals(rpcCalls.length, 1);
});

Deno.test("rpc call uses the caller's own JWT via createUserClient, never a fixed service-role client", async () => {
  const { createUserClient, createUserClientCalls, rpcCalls } =
    makeMockUserClientFactory();
  const deps = baseDeps({ createUserClient });

  const req = makeRequest(
    { rpc: "rpc_update_user", params: { p_id: "u-1" } },
    `Bearer ${CALLER_JWT}`,
  );
  await handleNifWriteProxyRequest(req, deps);

  assertEquals(createUserClientCalls.length, 1);
  assertEquals(createUserClientCalls[0], `Bearer ${CALLER_JWT}`);
  assertEquals(rpcCalls.length, 1);
});

// ── neg_guardar_nif_pessoa: service_role + actor verificado, sem tokens ──

const ORG_ID = "b6ffce4f-f630-4933-833a-008649757a33";
const PESSOA_ID = "aaaaaaaa-0000-4000-8000-000000000009";

Deno.test("neg_guardar_nif_pessoa => cliente de servico com p_actor_auth_uid do JWT, sem p_nif_tokens, e o cliente do utilizador nao e usado", async () => {
  const user = makeMockUserClientFactory();
  const service = makeMockServiceClientFactory();
  const hmacKey = randomKey();
  const deps = baseDeps({
    createUserClient: user.createUserClient,
    createServiceClient: service.createServiceClient,
    getHmacKey: () => hmacKey,
  });

  const req = makeRequest(
    {
      rpc: "neg_guardar_nif_pessoa",
      nif: ` ${TEST_NIF} `,
      params: {
        p_organization_id: ORG_ID,
        p_entity_id: PESSOA_ID,
        p_actor_auth_uid: "outro-utilizador",
        p_nif_tokens: ["falso"],
      },
    },
    `Bearer ${CALLER_JWT}`,
  );
  const res = await handleNifWriteProxyRequest(req, deps);

  assertEquals(res.status, 200);
  assertEquals(user.rpcCalls.length, 0);
  assertEquals(user.createUserClientCalls.length, 0);
  assertEquals(service.callCount(), 1);
  assertEquals(service.rpcCalls.length, 1);

  const { rpc, params } = service.rpcCalls[0];
  assertEquals(rpc, "neg_guardar_nif_pessoa");
  assertEquals(params.p_actor_auth_uid, "auth-user-1");
  assertEquals(params.p_organization_id, ORG_ID);
  assertEquals(params.p_entity_id, PESSOA_ID);
  assertEquals(params.p_nif, TEST_NIF);
  assertEquals(params.p_nif_hash, await hashNif(TEST_NIF, hmacKey));
  assertEquals("p_nif_tokens" in params, false);
});

Deno.test("neg_guardar_nif_pessoa com NIF vazio => limpa hash e cifra (null), p_nif vazio e o actor verificado", async () => {
  const service = makeMockServiceClientFactory();
  const deps = baseDeps({ createServiceClient: service.createServiceClient });

  const req = makeRequest(
    {
      rpc: "neg_guardar_nif_pessoa",
      nif: "   ",
      params: { p_organization_id: ORG_ID, p_entity_id: PESSOA_ID },
    },
    `Bearer ${CALLER_JWT}`,
  );
  const res = await handleNifWriteProxyRequest(req, deps);

  assertEquals(res.status, 200);
  const { params } = service.rpcCalls[0];
  assertEquals(params.p_nif, "");
  assertEquals(params.p_nif_hash, null);
  assertEquals(params.p_nif_encrypted, null);
  assertEquals("p_nif_tokens" in params, false);
  assertEquals(params.p_actor_auth_uid, "auth-user-1");
});

Deno.test("neg_guardar_nif_pessoa: recusa devolvida (NG030) => 409 com o codigo e sem o NIF", async () => {
  const service = makeMockServiceClientFactory({
    rpcData: { erro: "NG030", mensagem: `Repetido ${TEST_NIF}` },
  });
  const deps = baseDeps({ createServiceClient: service.createServiceClient });

  const req = makeRequest(
    {
      rpc: "neg_guardar_nif_pessoa",
      nif: TEST_NIF,
      params: { p_organization_id: ORG_ID, p_entity_id: PESSOA_ID },
    },
    `Bearer ${CALLER_JWT}`,
  );
  const res = await handleNifWriteProxyRequest(req, deps);

  assertEquals(res.status, 409);
  const text = await res.text();
  assert(text.includes("NG030"));
  assertEquals(text.includes(TEST_NIF), false);
});

Deno.test("neg_guardar_nif_pessoa: NG032 lancado => 429 com o codigo e sem o NIF", async () => {
  const captured = captureLogs();
  let res: Response;
  try {
    const service = makeMockServiceClientFactory({
      rpcError: { message: `Demasiadas ${TEST_NIF}`, code: "NG032" },
    });
    const deps = baseDeps({ createServiceClient: service.createServiceClient });
    res = await handleNifWriteProxyRequest(
      makeRequest(
        {
          rpc: "neg_guardar_nif_pessoa",
          nif: TEST_NIF,
          params: { p_organization_id: ORG_ID, p_entity_id: PESSOA_ID },
        },
        `Bearer ${CALLER_JWT}`,
      ),
      deps,
    );
  } finally {
    captured.restore();
  }

  assertEquals(res.status, 429);
  const text = await res.text();
  assert(text.includes("NG032"));
  assertEquals(text.includes(TEST_NIF), false);
  for (const line of captured.lines) {
    assertEquals(line.includes(TEST_NIF), false);
  }
});

Deno.test("as outras RPCs nao criam o cliente de servico e descartam p_actor_auth_uid do cliente", async () => {
  const user = makeMockUserClientFactory();
  const service = makeMockServiceClientFactory();
  const deps = baseDeps({
    createUserClient: user.createUserClient,
    createServiceClient: service.createServiceClient,
  });

  const req = makeRequest(
    { rpc: "rpc_update_user", params: { p_id: "u-1", p_actor_auth_uid: "outro" } },
    `Bearer ${CALLER_JWT}`,
  );
  const res = await handleNifWriteProxyRequest(req, deps);

  assertEquals(res.status, 200);
  assertEquals(service.callCount(), 0);
  assertEquals(user.rpcCalls.length, 1);
  assertEquals(user.rpcCalls[0].params, { p_id: "u-1" });
});

Deno.test("limite de tentativas com NIF: a 11.a tentativa do mesmo utilizador => 429 e nao chega a RPC", async () => {
  const service = makeMockServiceClientFactory();
  const deps = baseDeps({ createServiceClient: service.createServiceClient });
  const captured = captureLogs();
  const statuses: number[] = [];
  try {
    for (let i = 0; i < 11; i++) {
      const res = await handleNifWriteProxyRequest(
        makeRequest(
          {
            rpc: "neg_guardar_nif_pessoa",
            nif: TEST_NIF,
            params: { p_organization_id: ORG_ID, p_entity_id: PESSOA_ID },
          },
          `Bearer ${CALLER_JWT}`,
        ),
        deps,
      );
      statuses.push(res.status);
      await res.text();
    }
  } finally {
    captured.restore();
  }

  assertEquals(statuses.slice(0, 10).every((s) => s === 200), true);
  assertEquals(statuses[10], 429);
  assertEquals(service.rpcCalls.length, 10);
});
