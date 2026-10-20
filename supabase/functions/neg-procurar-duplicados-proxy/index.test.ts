/**
 * neg-procurar-duplicados-proxy — testes do handler.
 *
 * Importam handler.ts (não index.ts), por isso o Deno.serve nunca arranca. Os clientes Supabase e a chave HMAC injetam-se por
 * ProcurarDuplicadosProxyDeps, como em find-entity-matches-proxy/index.test.ts. Nada vai à rede nem à base.
 */

import {
  assert,
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { hashNif } from "../_shared/nifCrypto.ts";
import {
  handleProcurarDuplicadosProxyRequest,
  type ProcurarDuplicadosProxyDeps,
} from "./handler.ts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
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
  console.log = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
  console.error = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
  return { lines, restore: () => { console.log = originalLog; console.error = originalError; } };
}

function makeMockSupabaseAdmin(options: { authUser?: { id: string } | null; anewUser?: { id: string } | null } = {}) {
  // deno-lint-ignore no-explicit-any
  const supabaseAdmin: any = {
    auth: {
      getUser: async (_token: string) => {
        if (!options.authUser) return { data: { user: null }, error: new Error("invalid token") };
        return { data: { user: options.authUser }, error: null };
      },
    },
    // deno-lint-ignore no-explicit-any
    from(table: string): any {
      if (table === "anew_users") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: options.anewUser ?? null, error: null }) }) }) };
      }
      throw new Error(`Unexpected table in mock supabaseAdmin: ${table}`);
    },
  };
  return supabaseAdmin;
}

interface RpcCall { rpc: string; params: Record<string, unknown> }

function makeMockUserClientFactory(options: { rpcError?: { message: string; code?: string }; rpcData?: unknown } = {}) {
  const createUserClientCalls: string[] = [];
  const rpcCalls: RpcCall[] = [];
  const createUserClient = (authHeader: string) => {
    createUserClientCalls.push(authHeader);
    return {
      rpc: async (rpc: string, params: Record<string, unknown>) => {
        rpcCalls.push({ rpc, params });
        if (options.rpcError) return { data: null, error: options.rpcError };
        return { data: options.rpcData ?? [], error: null };
      },
    };
  };
  return { createUserClient, createUserClientCalls, rpcCalls };
}

function makeRequest(body: unknown, authHeader?: string): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authHeader !== undefined) headers["Authorization"] = authHeader;
  return new Request("https://example.com/neg-procurar-duplicados-proxy", { method: "POST", headers, body: JSON.stringify(body) });
}

function baseDeps(overrides: Partial<ProcurarDuplicadosProxyDeps> = {}): ProcurarDuplicadosProxyDeps {
  const { createUserClient } = makeMockUserClientFactory();
  return {
    supabaseAdmin: makeMockSupabaseAdmin({ authUser: { id: "auth-user-1" }, anewUser: { id: "anew-user-1" } }),
    createUserClient,
    getHmacKey: () => randomKey(),
    ...overrides,
  };
}

Deno.test("sem cabeçalho Authorization => 401", async () => {
  const res = await handleProcurarDuplicadosProxyRequest(makeRequest({ orgId: ORG_ID, nif: TEST_NIF }), baseDeps());
  assertEquals(res.status, 401);
});

Deno.test("token inválido ou expirado => 401", async () => {
  const deps = baseDeps({ supabaseAdmin: makeMockSupabaseAdmin({ authUser: null }) });
  const res = await handleProcurarDuplicadosProxyRequest(makeRequest({ orgId: ORG_ID, nif: TEST_NIF }, `Bearer ${CALLER_JWT}`), deps);
  assertEquals(res.status, 401);
});

Deno.test("OPTIONS responde ao preflight sem exigir sessão", async () => {
  const req = new Request("https://example.com/neg-procurar-duplicados-proxy", { method: "OPTIONS" });
  const res = await handleProcurarDuplicadosProxyRequest(req, baseDeps());
  assertEquals(res.status, 200);
});

Deno.test("orgId em falta ou que não é uuid => 400 INVALID_INPUT", async () => {
  for (const corpo of [{ nif: TEST_NIF }, { orgId: "org-1", nif: TEST_NIF }]) {
    const res = await handleProcurarDuplicadosProxyRequest(makeRequest(corpo, `Bearer ${CALLER_JWT}`), baseDeps());
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.success, false);
    assertEquals(body.code, "INVALID_INPUT");
  }
});

Deno.test("corpo que não é JSON => 400 INVALID_INPUT", async () => {
  const req = new Request("https://example.com/x", {
    method: "POST", headers: { Authorization: `Bearer ${CALLER_JWT}`, "Content-Type": "application/json" }, body: "{nao e json",
  });
  const res = await handleProcurarDuplicadosProxyRequest(req, baseDeps());
  assertEquals(res.status, 400);
  assertEquals((await res.json()).code, "INVALID_INPUT");
});

Deno.test("com NIF: a RPC recebe só o hash (nunca o NIF), o email e o telefone como vieram, e o país em maiúsculas", async () => {
  const { createUserClient, rpcCalls, createUserClientCalls } = makeMockUserClientFactory({ rpcData: [{ pessoa: 1 }] });
  const hmacKey = randomKey();
  const deps = baseDeps({ createUserClient, getHmacKey: () => hmacKey });
  const res = await handleProcurarDuplicadosProxyRequest(
    makeRequest({ orgId: ORG_ID, email: "ana@x.pt", phone: "+351912345678", nif: TEST_NIF, countryCode: "pt" }, `Bearer ${CALLER_JWT}`),
    deps,
  );
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { success: true, data: [{ pessoa: 1 }] });
  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0].rpc, "neg_procurar_duplicados");
  const { params } = rpcCalls[0];
  assertEquals(params.p_organization_id, ORG_ID);
  assertEquals(params.p_email, "ana@x.pt");
  assertEquals(params.p_telefone, "+351912345678");
  assertEquals(params.p_pais, "PT");
  const esperado = await hashNif(TEST_NIF, hmacKey);
  assertEquals(params.p_nif_hash, esperado);
  assertNotEquals(params.p_nif_hash, TEST_NIF);
  assert(!JSON.stringify(params).includes(TEST_NIF), "o NIF em claro não pode ir à base");
  // A função da base corre com a sessão de QUEM PEDE, não com a chave de serviço.
  assertEquals(createUserClientCalls, [`Bearer ${CALLER_JWT}`]);
});

Deno.test("sem NIF (ou NIF vazio): p_nif_hash é null e o país por omissão é PT", async () => {
  const { createUserClient, rpcCalls } = makeMockUserClientFactory();
  const deps = baseDeps({ createUserClient });
  await handleProcurarDuplicadosProxyRequest(makeRequest({ orgId: ORG_ID, email: "ana@x.pt", nif: null }, `Bearer ${CALLER_JWT}`), deps);
  await handleProcurarDuplicadosProxyRequest(makeRequest({ orgId: ORG_ID, phone: "912", nif: "   " }, `Bearer ${CALLER_JWT}`), deps).catch(() => undefined);
  assertEquals(rpcCalls[0].params.p_nif_hash, null);
  assertEquals(rpcCalls[0].params.p_pais, "PT");
});

Deno.test("falha o cálculo do hash (chave em falta) => 500 sem a chave nem o NIF, e a RPC não corre (a UI falha fechada)", async () => {
  const { createUserClient, rpcCalls } = makeMockUserClientFactory();
  const logs = captureLogs();
  try {
    const deps = baseDeps({ createUserClient, getHmacKey: () => { throw new Error("NIF_HMAC_KEY not configured"); } });
    const res = await handleProcurarDuplicadosProxyRequest(makeRequest({ orgId: ORG_ID, nif: TEST_NIF }, `Bearer ${CALLER_JWT}`), deps);
    assertEquals(res.status, 500);
    const body = await res.json();
    assertEquals(body.success, false);
    assertEquals(body.code, "INTERNAL_ERROR");
    assertEquals(rpcCalls.length, 0);
    assert(!JSON.stringify(body).includes(TEST_NIF));
    assert(!logs.lines.join("\n").includes(TEST_NIF), "o NIF não pode ir para os logs");
  } finally {
    logs.restore();
  }
});

Deno.test("recusas da função da base (NG008, NG009, NG020, 42501) => HTTP 200 success:false com o código", async () => {
  for (const code of ["NG008", "NG009", "NG020", "42501"]) {
    const { createUserClient } = makeMockUserClientFactory({ rpcError: { message: "x", code } });
    const res = await handleProcurarDuplicadosProxyRequest(
      makeRequest({ orgId: ORG_ID, email: "ana@x.pt" }, `Bearer ${CALLER_JWT}`), baseDeps({ createUserClient }),
    );
    assertEquals(res.status, 200, code);
    const body = await res.json();
    assertEquals(body.success, false);
    assertEquals(body.code, code);
  }
});

Deno.test("avaria da RPC (código desconhecido) => 500 INTERNAL_ERROR", async () => {
  const { createUserClient } = makeMockUserClientFactory({ rpcError: { message: "timeout", code: "57014" } });
  const logs = captureLogs();
  try {
    const res = await handleProcurarDuplicadosProxyRequest(
      makeRequest({ orgId: ORG_ID, email: "ana@x.pt" }, `Bearer ${CALLER_JWT}`), baseDeps({ createUserClient }),
    );
    assertEquals(res.status, 500);
    assertEquals((await res.json()).code, "INTERNAL_ERROR");
  } finally {
    logs.restore();
  }
});

Deno.test("a base devolve algo que não é lista => data vazia", async () => {
  const { createUserClient } = makeMockUserClientFactory({ rpcData: { inesperado: true } });
  const res = await handleProcurarDuplicadosProxyRequest(
    makeRequest({ orgId: ORG_ID, email: "ana@x.pt" }, `Bearer ${CALLER_JWT}`), baseDeps({ createUserClient }),
  );
  assertEquals(await res.json(), { success: true, data: [] });
});

Deno.test("limites de tamanho: nif acima de 64, email acima de 254, telefone acima de 30 ou país acima de 8 => 400 e a RPC não corre", async () => {
  const excessos: Record<string, unknown>[] = [
    { nif: "1".repeat(65) },
    { email: `${"a".repeat(250)}@x.pt` },
    { phone: "9".repeat(31) },
    { countryCode: "P".repeat(9) },
  ];
  for (const extra of excessos) {
    const { createUserClient, rpcCalls, createUserClientCalls } = makeMockUserClientFactory();
    const res = await handleProcurarDuplicadosProxyRequest(
      makeRequest({ orgId: ORG_ID, ...extra }, `Bearer ${CALLER_JWT}`), baseDeps({ createUserClient }),
    );
    assertEquals(res.status, 400, JSON.stringify(Object.keys(extra)));
    const body = await res.json();
    assertEquals(body.success, false);
    assertEquals(body.code, "INVALID_INPUT");
    assertEquals(rpcCalls.length, 0);
    assertEquals(createUserClientCalls.length, 0);
  }
});

Deno.test("limites de tamanho: no limite exato passa (nif 64, email 254, telefone 30)", async () => {
  const { createUserClient, rpcCalls } = makeMockUserClientFactory();
  const email = `${"a".repeat(249)}@x.pt`;
  assertEquals(email.length, 254);
  const res = await handleProcurarDuplicadosProxyRequest(
    makeRequest({ orgId: ORG_ID, nif: "1".repeat(64), email, phone: "9".repeat(30), countryCode: "pt" }, `Bearer ${CALLER_JWT}`),
    baseDeps({ createUserClient }),
  );
  assertEquals(res.status, 200);
  assertEquals(rpcCalls.length, 1);
});

Deno.test("o Authorization de quem chama é exatamente o que chega a createUserClient (nunca um token da função)", async () => {
  const { createUserClient, createUserClientCalls } = makeMockUserClientFactory();
  await handleProcurarDuplicadosProxyRequest(
    makeRequest({ orgId: ORG_ID, email: "ana@x.pt" }, "Bearer outro-jwt-do-chamador"), baseDeps({ createUserClient }),
  );
  assertEquals(createUserClientCalls, ["Bearer outro-jwt-do-chamador"]);
});

Deno.test("token de serviço/cron: passa a autenticação, o token segue tal e qual e a base recusa com 42501 => HTTP 200 success:false 42501", async () => {
  const anterior = Deno.env.get("CRON_SHARED_SECRET");
  Deno.env.set("CRON_SHARED_SECRET", "segredo-cron-de-teste");
  try {
    const { createUserClient, createUserClientCalls, rpcCalls } = makeMockUserClientFactory({ rpcError: { message: "permission denied", code: "42501" } });
    const res = await handleProcurarDuplicadosProxyRequest(
      makeRequest({ orgId: ORG_ID, email: "ana@x.pt" }, "Bearer segredo-cron-de-teste"),
      baseDeps({ createUserClient, supabaseAdmin: makeMockSupabaseAdmin({ authUser: null }) }),
    );
    assertEquals(createUserClientCalls, ["Bearer segredo-cron-de-teste"]);
    assertEquals(rpcCalls.length, 1);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.success, false);
    assertEquals(body.code, "42501");
  } finally {
    if (anterior === undefined) Deno.env.delete("CRON_SHARED_SECRET");
    else Deno.env.set("CRON_SHARED_SECRET", anterior);
  }
});
