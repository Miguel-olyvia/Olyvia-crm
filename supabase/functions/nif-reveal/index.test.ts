/**
 * nif-reveal — request handler tests.
 *
 * These tests import handler.ts directly (not index.ts) so that Deno.serve
 * is never invoked in the test process. The Supabase admin client and the
 * decryption key provider are injected via NifRevealDeps, following the same
 * "extract logic, inject dependencies" pattern used elsewhere in this repo's
 * *.test.ts files (see nif-write-proxy/index.test.ts).
 */

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { encryptNif } from "../_shared/nifCrypto.ts";
import {
  MAX_BATCH_SIZE,
  handleNifRevealRequest,
  type NifRevealDeps,
} from "./handler.ts";

const CALLER_JWT = "caller-jwt-token";

// ── crypto key fixtures ──

function randomKey(): Uint8Array {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes;
}

// ── mock Supabase admin client ──

interface FiscalRow {
  id: string;
  nif_encrypted: string | null;
}

interface LinkRow {
  entity_id: string;
  fiscal_entity_id: string;
}

function makeMockSupabaseAdmin(options: {
  authUser?: { id: string } | null;
  anewUser?: { id: string } | null;
  fiscalRows?: FiscalRow[];
  linkRows?: LinkRow[];
  visibleEntityIds?: string[];
  fiscalSelectError?: { message: string };
  linkSelectError?: { message: string };
  visibilityRpcError?: { message: string };
}) {
  const fiscalRows = options.fiscalRows ?? [];
  const linkRows = options.linkRows ?? [];
  const visibleEntityIds = new Set(options.visibleEntityIds ?? []);

  const rpcCalls: Array<{ rpc: string; params: Record<string, unknown> }> = [];

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
      if (table === "fiscal_entities") {
        return {
          select: () => ({
            in: async (_col: string, ids: string[]) => {
              if (options.fiscalSelectError) {
                return { data: null, error: options.fiscalSelectError };
              }
              return {
                data: fiscalRows.filter((row) => ids.includes(row.id)),
                error: null,
              };
            },
          }),
        };
      }
      if (table === "anew_entity_fiscal_entities") {
        return {
          select: () => ({
            in: async (_col: string, ids: string[]) => {
              if (options.linkSelectError) {
                return { data: null, error: options.linkSelectError };
              }
              return {
                data: linkRows.filter((row) =>
                  ids.includes(row.fiscal_entity_id)
                ),
                error: null,
              };
            },
          }),
        };
      }
      throw new Error(`Unexpected table in mock supabaseAdmin: ${table}`);
    },
    rpc: async (rpc: string, params: Record<string, unknown>) => {
      rpcCalls.push({ rpc, params });
      if (rpc === "filter_visible_entity_ids") {
        if (options.visibilityRpcError) {
          return { data: null, error: options.visibilityRpcError };
        }
        const requestedEntityIds = params.p_entity_ids as string[];
        const data = requestedEntityIds
          .filter((id) => visibleEntityIds.has(id))
          .map((id) => ({ entity_id: id }));
        return { data, error: null };
      }
      throw new Error(`Unexpected rpc in mock supabaseAdmin: ${rpc}`);
    },
  };

  return { supabaseAdmin, rpcCalls };
}

function makeRequest(body: unknown, authHeader?: string): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authHeader !== undefined) headers["Authorization"] = authHeader;
  return new Request("https://example.com/nif-reveal", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

// ── tests ──

Deno.test("no Authorization header => 401", async () => {
  const { supabaseAdmin } = makeMockSupabaseAdmin({
    authUser: { id: "auth-user-1" },
    anewUser: { id: "anew-user-1" },
  });
  const deps: NifRevealDeps = {
    supabaseAdmin,
    getDecKey: () => randomKey(),
  };

  const req = makeRequest({ fiscal_entity_ids: ["fe-1"] }); // no auth header
  const res = await handleNifRevealRequest(req, deps);
  assertEquals(res.status, 401);
});

Deno.test("invalid/expired token => 401", async () => {
  const { supabaseAdmin } = makeMockSupabaseAdmin({ authUser: null });
  const deps: NifRevealDeps = {
    supabaseAdmin,
    getDecKey: () => randomKey(),
  };

  const req = makeRequest(
    { fiscal_entity_ids: ["fe-1"] },
    `Bearer ${CALLER_JWT}`,
  );
  const res = await handleNifRevealRequest(req, deps);
  assertEquals(res.status, 401);
});

Deno.test("authorized ids are revealed with the correctly decrypted NIF", async () => {
  const decKey = randomKey();
  const nifPlain = "123456789";
  const nifEncrypted = await encryptNif(nifPlain, decKey);

  const { supabaseAdmin } = makeMockSupabaseAdmin({
    authUser: { id: "auth-user-1" },
    anewUser: { id: "anew-user-1" },
    fiscalRows: [{ id: "fe-1", nif_encrypted: nifEncrypted }],
    linkRows: [{ entity_id: "entity-1", fiscal_entity_id: "fe-1" }],
    visibleEntityIds: ["entity-1"],
  });
  const deps: NifRevealDeps = { supabaseAdmin, getDecKey: () => decKey };

  const req = makeRequest(
    { fiscal_entity_ids: ["fe-1"] },
    `Bearer ${CALLER_JWT}`,
  );
  const res = await handleNifRevealRequest(req, deps);

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.data.revealed["fe-1"], nifPlain);
  assertEquals(body.data.denied, []);
});

Deno.test("ids without visibility are omitted from revealed, without erroring", async () => {
  const decKey = randomKey();
  const nifEncrypted = await encryptNif("123456789", decKey);

  const { supabaseAdmin } = makeMockSupabaseAdmin({
    authUser: { id: "auth-user-1" },
    anewUser: { id: "anew-user-1" },
    fiscalRows: [{ id: "fe-1", nif_encrypted: nifEncrypted }],
    linkRows: [{ entity_id: "entity-1", fiscal_entity_id: "fe-1" }],
    visibleEntityIds: [], // not visible
  });
  const deps: NifRevealDeps = { supabaseAdmin, getDecKey: () => decKey };

  const req = makeRequest(
    { fiscal_entity_ids: ["fe-1"] },
    `Bearer ${CALLER_JWT}`,
  );
  const res = await handleNifRevealRequest(req, deps);

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.data.revealed, {});
  assertEquals(body.data.denied, ["fe-1"]);
});

Deno.test("nonexistent id is omitted from revealed the same way as a non-visible id", async () => {
  const decKey = randomKey();

  const { supabaseAdmin } = makeMockSupabaseAdmin({
    authUser: { id: "auth-user-1" },
    anewUser: { id: "anew-user-1" },
    fiscalRows: [],
    linkRows: [],
    visibleEntityIds: [],
  });
  const deps: NifRevealDeps = { supabaseAdmin, getDecKey: () => decKey };

  const req = makeRequest(
    { fiscal_entity_ids: ["fe-does-not-exist"] },
    `Bearer ${CALLER_JWT}`,
  );
  const res = await handleNifRevealRequest(req, deps);

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.data.revealed, {});
  assertEquals(body.data.denied, ["fe-does-not-exist"]);
});

Deno.test("mixed batch: only the visible id is revealed, the other is denied", async () => {
  const decKey = randomKey();
  const nifPlain = "987654321";
  const nifEncrypted = await encryptNif(nifPlain, decKey);

  const { supabaseAdmin } = makeMockSupabaseAdmin({
    authUser: { id: "auth-user-1" },
    anewUser: { id: "anew-user-1" },
    fiscalRows: [
      { id: "fe-visible", nif_encrypted: nifEncrypted },
      { id: "fe-hidden", nif_encrypted: "irrelevant" },
    ],
    linkRows: [
      { entity_id: "entity-visible", fiscal_entity_id: "fe-visible" },
      { entity_id: "entity-hidden", fiscal_entity_id: "fe-hidden" },
    ],
    visibleEntityIds: ["entity-visible"],
  });
  const deps: NifRevealDeps = { supabaseAdmin, getDecKey: () => decKey };

  const req = makeRequest(
    { fiscal_entity_ids: ["fe-visible", "fe-hidden"] },
    `Bearer ${CALLER_JWT}`,
  );
  const res = await handleNifRevealRequest(req, deps);

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.data.revealed, { "fe-visible": nifPlain });
  assertEquals(body.data.denied, ["fe-hidden"]);
});

Deno.test(`batch limit of ${MAX_BATCH_SIZE} ids is respected: exceeding it => 400`, async () => {
  const { supabaseAdmin } = makeMockSupabaseAdmin({
    authUser: { id: "auth-user-1" },
    anewUser: { id: "anew-user-1" },
  });
  const deps: NifRevealDeps = { supabaseAdmin, getDecKey: () => randomKey() };

  const tooManyIds = Array.from(
    { length: MAX_BATCH_SIZE + 1 },
    (_, i) => `fe-${i}`,
  );
  const req = makeRequest(
    { fiscal_entity_ids: tooManyIds },
    `Bearer ${CALLER_JWT}`,
  );
  const res = await handleNifRevealRequest(req, deps);

  assertEquals(res.status, 400);
});

Deno.test(`batch of exactly ${MAX_BATCH_SIZE} ids is accepted`, async () => {
  const { supabaseAdmin } = makeMockSupabaseAdmin({
    authUser: { id: "auth-user-1" },
    anewUser: { id: "anew-user-1" },
    fiscalRows: [],
    linkRows: [],
    visibleEntityIds: [],
  });
  const deps: NifRevealDeps = { supabaseAdmin, getDecKey: () => randomKey() };

  const exactlyMaxIds = Array.from(
    { length: MAX_BATCH_SIZE },
    (_, i) => `fe-${i}`,
  );
  const req = makeRequest(
    { fiscal_entity_ids: exactlyMaxIds },
    `Bearer ${CALLER_JWT}`,
  );
  const res = await handleNifRevealRequest(req, deps);

  assertEquals(res.status, 200);
});

Deno.test("empty fiscal_entity_ids array => 400", async () => {
  const { supabaseAdmin } = makeMockSupabaseAdmin({
    authUser: { id: "auth-user-1" },
    anewUser: { id: "anew-user-1" },
  });
  const deps: NifRevealDeps = { supabaseAdmin, getDecKey: () => randomKey() };

  const req = makeRequest({ fiscal_entity_ids: [] }, `Bearer ${CALLER_JWT}`);
  const res = await handleNifRevealRequest(req, deps);
  assertEquals(res.status, 400);
});

Deno.test("missing decryption key => 500 with a clear error message", async () => {
  const { supabaseAdmin } = makeMockSupabaseAdmin({
    authUser: { id: "auth-user-1" },
    anewUser: { id: "anew-user-1" },
  });
  const deps: NifRevealDeps = {
    supabaseAdmin,
    getDecKey: () => {
      throw new Error(
        'deriveKeyFromEnv: missing required environment variable "NIF_ENC_KEY"',
      );
    },
  };

  const req = makeRequest(
    { fiscal_entity_ids: ["fe-1"] },
    `Bearer ${CALLER_JWT}`,
  );
  const res = await handleNifRevealRequest(req, deps);

  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.success, false);
  assert(body.error.includes("Decryption key unavailable"));
  assert(body.error.includes("NIF_ENC_KEY"));
});

Deno.test("filter_visible_entity_ids RPC error => 500, no partial reveal", async () => {
  const decKey = randomKey();
  const nifEncrypted = await encryptNif("123456789", decKey);

  const { supabaseAdmin, rpcCalls } = makeMockSupabaseAdmin({
    authUser: { id: "auth-user-1" },
    anewUser: { id: "anew-user-1" },
    fiscalRows: [{ id: "fe-1", nif_encrypted: nifEncrypted }],
    linkRows: [{ entity_id: "entity-1", fiscal_entity_id: "fe-1" }],
    visibilityRpcError: { message: "db unavailable" },
  });
  const deps: NifRevealDeps = { supabaseAdmin, getDecKey: () => decKey };

  const req = makeRequest(
    { fiscal_entity_ids: ["fe-1"] },
    `Bearer ${CALLER_JWT}`,
  );
  const res = await handleNifRevealRequest(req, deps);

  assertEquals(res.status, 500);
  assertEquals(rpcCalls.length, 1);
});

Deno.test("response never contains the plaintext NIF for a denied id", async () => {
  const decKey = randomKey();
  const hiddenNif = "555666777";
  const nifEncrypted = await encryptNif(hiddenNif, decKey);

  const { supabaseAdmin } = makeMockSupabaseAdmin({
    authUser: { id: "auth-user-1" },
    anewUser: { id: "anew-user-1" },
    fiscalRows: [{ id: "fe-1", nif_encrypted: nifEncrypted }],
    linkRows: [{ entity_id: "entity-1", fiscal_entity_id: "fe-1" }],
    visibleEntityIds: [], // not visible
  });
  const deps: NifRevealDeps = { supabaseAdmin, getDecKey: () => decKey };

  const req = makeRequest(
    { fiscal_entity_ids: ["fe-1"] },
    `Bearer ${CALLER_JWT}`,
  );
  const res = await handleNifRevealRequest(req, deps);
  const bodyText = await res.text();
  assertEquals(bodyText.includes(hiddenNif), false);
});
