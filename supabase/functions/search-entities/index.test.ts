/**
 * search-entities — request handler tests.
 *
 * These tests import handler.ts directly (not index.ts) so that Deno.serve
 * is never invoked in the test process. The Supabase client and the
 * encryption/HMAC key providers are injected via SearchEntitiesDeps,
 * following the same "extract logic, inject dependencies" pattern used
 * elsewhere in this repo's *.test.ts files (see nif-write-proxy/index.test.ts,
 * fiscal-entity-resolve/index.test.ts).
 *
 * A minimal fake Postgres-style query builder (FakeQueryBuilder) stands in
 * for the real Supabase client: it supports .select()/.eq()/.in()/.maybeSingle()
 * and is awaitable, mirroring the subset of the real query builder API this
 * handler actually uses.
 */

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { encryptNif, tokenizeNif } from "../_shared/nifCrypto.ts";
import {
  handleSearchEntitiesRequest,
  type SearchEntitiesDeps,
} from "./handler.ts";

const TEST_NIF = "123456789";
const AUTH_UID = "auth-user-1";
const ANEW_USER_ID = "anew-user-1";
const CALLER_JWT = "caller-jwt-token";

// ── crypto key fixtures ──

function randomKey(): Uint8Array {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes;
}

// ── fake query builder ──

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

class FakeQueryBuilder implements PromiseLike<{ data: Row[]; error: null }> {
  constructor(
    private rows: Row[],
    private filters: Array<(row: Row) => boolean> = [],
  ) {}

  select(_cols?: string): FakeQueryBuilder {
    return this;
  }

  eq(col: string, val: unknown): FakeQueryBuilder {
    return new FakeQueryBuilder(this.rows, [
      ...this.filters,
      (row) => row[col] === val,
    ]);
  }

  in(col: string, vals: unknown[]): FakeQueryBuilder {
    const set = new Set(vals);
    return new FakeQueryBuilder(this.rows, [
      ...this.filters,
      (row) => set.has(row[col]),
    ]);
  }

  private filtered(): Row[] {
    return this.rows.filter((row) => this.filters.every((f) => f(row)));
  }

  async maybeSingle(): Promise<{ data: Row | null; error: null }> {
    const rows = this.filtered();
    return { data: rows[0] ?? null, error: null };
  }

  then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.filtered(), error: null }).then(
      onfulfilled,
      onrejected,
    );
  }
}

// ── mock Supabase admin client ──

interface MockDb {
  tables?: Record<string, Row[]>;
  rpcHandlers?: Record<string, (params: unknown) => Promise<{ data: unknown; error: null }>>;
  authUser?: { id: string } | null;
  anewUser?: { id: string } | null;
}

function makeMockSupabaseAdmin(options: MockDb = {}) {
  const tables = options.tables ?? {};
  const rpcHandlers = options.rpcHandlers ?? {};

  // deno-lint-ignore no-explicit-any
  const supabaseAdmin: any = {
    auth: {
      getUser: async (_token: string) => {
        if (options.authUser === undefined ? true : options.authUser === null) {
          if (options.authUser === null) {
            return { data: { user: null }, error: new Error("invalid token") };
          }
        }
        if (!options.authUser) {
          return { data: { user: null }, error: new Error("invalid token") };
        }
        return { data: { user: options.authUser }, error: null };
      },
    },
    from(table: string): FakeQueryBuilder {
      if (table === "anew_users") {
        return new FakeQueryBuilder(
          options.anewUser ? [{ id: options.anewUser.id, auth_user_id: options.authUser?.id }] : [],
        );
      }
      return new FakeQueryBuilder(tables[table] ?? []);
    },
    rpc: async (name: string, params: unknown) => {
      const handler = rpcHandlers[name];
      if (!handler) {
        throw new Error(`Unexpected rpc call in mock: ${name}`);
      }
      return handler(params);
    },
  };
  return supabaseAdmin;
}

function makeRequest(body: unknown, authHeader?: string): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authHeader !== undefined) headers["Authorization"] = authHeader;
  return new Request("https://example.com/search-entities", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

// ── fixture builder: one fiscal entity + its trigram tokens ──

interface EntityFixture {
  fiscalEntityId: string;
  entityId: string;
  nif: string;
  nifEncrypted: string;
  tokenRows: Array<{ fiscal_entity_id: string; token_hash: string }>;
}

async function buildEntityFixture(params: {
  fiscalEntityId: string;
  entityId: string;
  nif: string;
  encKey: Uint8Array;
  hmacKey: Uint8Array;
}): Promise<EntityFixture> {
  const { fiscalEntityId, entityId, nif, encKey, hmacKey } = params;
  const nifEncrypted = await encryptNif(nif, encKey);
  const tokens = await tokenizeNif(nif, hmacKey);
  const tokenRows = tokens.map((token_hash) => ({
    fiscal_entity_id: fiscalEntityId,
    token_hash,
  }));
  return { fiscalEntityId, entityId, nif, nifEncrypted, tokenRows };
}

function baseDeps(overrides: Partial<SearchEntitiesDeps> = {}): SearchEntitiesDeps {
  return {
    supabaseAdmin: makeMockSupabaseAdmin({
      authUser: { id: AUTH_UID },
      anewUser: { id: ANEW_USER_ID },
    }),
    getEncKey: () => randomKey(),
    getHmacKey: () => randomKey(),
    ...overrides,
  };
}

// ── tests ──

Deno.test("no Authorization header => 401", async () => {
  const deps = baseDeps();
  const req = makeRequest({ term: TEST_NIF });
  const res = await handleSearchEntitiesRequest(req, deps);
  assertEquals(res.status, 401);
});

Deno.test("invalid/expired token => 401", async () => {
  const deps = baseDeps({
    supabaseAdmin: makeMockSupabaseAdmin({ authUser: null }),
  });
  const req = makeRequest({ term: TEST_NIF }, `Bearer ${CALLER_JWT}`);
  const res = await handleSearchEntitiesRequest(req, deps);
  assertEquals(res.status, 401);
});

Deno.test("full term matches the exact NIF and returns its fiscal_entity_id", async () => {
  const encKey = randomKey();
  const hmacKey = randomKey();
  const fixture = await buildEntityFixture({
    fiscalEntityId: "fe-1",
    entityId: "entity-1",
    nif: TEST_NIF,
    encKey,
    hmacKey,
  });

  const supabaseAdmin = makeMockSupabaseAdmin({
    authUser: { id: AUTH_UID },
    anewUser: { id: ANEW_USER_ID },
    tables: {
      fiscal_entity_nif_tokens: fixture.tokenRows,
      fiscal_entities: [{ id: fixture.fiscalEntityId, nif_encrypted: fixture.nifEncrypted }],
      anew_entity_fiscal_entities: [
        { fiscal_entity_id: fixture.fiscalEntityId, entity_id: fixture.entityId },
      ],
      auth_to_business_user_map: [],
      anew_entity_org_links: [{ entity_id: fixture.entityId, organization_id: "org-visible" }],
      anew_leads: [],
      anew_contacts: [],
      anew_clients: [],
      quotes: [],
      deals: [],
    },
    rpcHandlers: {
      get_user_visible_org_ids: async () => ({ data: ["org-visible"], error: null }),
    },
  });

  const deps = baseDeps({ supabaseAdmin, getEncKey: () => encKey, getHmacKey: () => hmacKey });
  const req = makeRequest({ term: TEST_NIF }, `Bearer ${CALLER_JWT}`);
  const res = await handleSearchEntitiesRequest(req, deps);

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.data.fiscal_entity_ids, [fixture.fiscalEntityId]);
});

for (
  const [label, partial] of [
    ["start", TEST_NIF.slice(0, 3)],
    ["middle", TEST_NIF.slice(3, 6)],
    ["end", TEST_NIF.slice(6, 9)],
  ] as const
) {
  Deno.test(`partial term (${label} of NIF) returns the matching fiscal_entity_id`, async () => {
    const encKey = randomKey();
    const hmacKey = randomKey();
    const fixture = await buildEntityFixture({
      fiscalEntityId: "fe-1",
      entityId: "entity-1",
      nif: TEST_NIF,
      encKey,
      hmacKey,
    });

    const supabaseAdmin = makeMockSupabaseAdmin({
      authUser: { id: AUTH_UID },
      anewUser: { id: ANEW_USER_ID },
      tables: {
        fiscal_entity_nif_tokens: fixture.tokenRows,
        fiscal_entities: [{ id: fixture.fiscalEntityId, nif_encrypted: fixture.nifEncrypted }],
        anew_entity_fiscal_entities: [
          { fiscal_entity_id: fixture.fiscalEntityId, entity_id: fixture.entityId },
        ],
        auth_to_business_user_map: [],
        anew_entity_org_links: [{ entity_id: fixture.entityId, organization_id: "org-visible" }],
        anew_leads: [],
        anew_contacts: [],
        anew_clients: [],
        quotes: [],
        deals: [],
      },
      rpcHandlers: {
        get_user_visible_org_ids: async () => ({ data: ["org-visible"], error: null }),
      },
    });

    const deps = baseDeps({ supabaseAdmin, getEncKey: () => encKey, getHmacKey: () => hmacKey });
    const req = makeRequest({ term: partial }, `Bearer ${CALLER_JWT}`);
    const res = await handleSearchEntitiesRequest(req, deps);

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.success, true);
    assertEquals(body.data.fiscal_entity_ids, [fixture.fiscalEntityId]);
  });
}

Deno.test("term shorter than 3 chars never triggers NIF search (empty result)", async () => {
  const deps = baseDeps();
  const req = makeRequest({ term: "12" }, `Bearer ${CALLER_JWT}`);
  const res = await handleSearchEntitiesRequest(req, deps);

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.data.fiscal_entity_ids, []);
});

Deno.test(
  "an entity linked only to an org outside the caller's visibility is excluded, even though it matches the term",
  async () => {
    const encKey = randomKey();
    const hmacKey = randomKey();

    // Entity A: same NIF prefix, linked to a VISIBLE org.
    const fixtureVisible = await buildEntityFixture({
      fiscalEntityId: "fe-visible",
      entityId: "entity-visible",
      nif: TEST_NIF,
      encKey,
      hmacKey,
    });
    // Entity B: same NIF (so it matches the same tokens/substring), linked
    // only to an org the caller cannot see.
    const fixtureHidden = await buildEntityFixture({
      fiscalEntityId: "fe-hidden",
      entityId: "entity-hidden",
      nif: TEST_NIF,
      encKey,
      hmacKey,
    });

    const supabaseAdmin = makeMockSupabaseAdmin({
      authUser: { id: AUTH_UID },
      anewUser: { id: ANEW_USER_ID },
      tables: {
        fiscal_entity_nif_tokens: [...fixtureVisible.tokenRows, ...fixtureHidden.tokenRows],
        fiscal_entities: [
          { id: fixtureVisible.fiscalEntityId, nif_encrypted: fixtureVisible.nifEncrypted },
          { id: fixtureHidden.fiscalEntityId, nif_encrypted: fixtureHidden.nifEncrypted },
        ],
        anew_entity_fiscal_entities: [
          { fiscal_entity_id: fixtureVisible.fiscalEntityId, entity_id: fixtureVisible.entityId },
          { fiscal_entity_id: fixtureHidden.fiscalEntityId, entity_id: fixtureHidden.entityId },
        ],
        auth_to_business_user_map: [],
        anew_entity_org_links: [
          { entity_id: fixtureVisible.entityId, organization_id: "org-visible" },
          { entity_id: fixtureHidden.entityId, organization_id: "org-hidden" },
        ],
        anew_leads: [],
        anew_contacts: [],
        anew_clients: [],
        quotes: [],
        deals: [],
      },
      rpcHandlers: {
        // Caller can only see "org-visible" — "org-hidden" is a different org
        // this caller has no membership/hierarchy/cross-association with.
        get_user_visible_org_ids: async () => ({ data: ["org-visible"], error: null }),
      },
    });

    const deps = baseDeps({ supabaseAdmin, getEncKey: () => encKey, getHmacKey: () => hmacKey });
    const req = makeRequest({ term: TEST_NIF }, `Bearer ${CALLER_JWT}`);
    const res = await handleSearchEntitiesRequest(req, deps);

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.success, true);
    assertEquals(body.data.fiscal_entity_ids, [fixtureVisible.fiscalEntityId]);
  },
);

Deno.test("response never contains the plaintext NIF, nif_hash, or nif_encrypted", async () => {
  const encKey = randomKey();
  const hmacKey = randomKey();
  const fixture = await buildEntityFixture({
    fiscalEntityId: "fe-1",
    entityId: "entity-1",
    nif: TEST_NIF,
    encKey,
    hmacKey,
  });

  const supabaseAdmin = makeMockSupabaseAdmin({
    authUser: { id: AUTH_UID },
    anewUser: { id: ANEW_USER_ID },
    tables: {
      fiscal_entity_nif_tokens: fixture.tokenRows,
      fiscal_entities: [{ id: fixture.fiscalEntityId, nif_encrypted: fixture.nifEncrypted }],
      anew_entity_fiscal_entities: [
        { fiscal_entity_id: fixture.fiscalEntityId, entity_id: fixture.entityId },
      ],
      auth_to_business_user_map: [],
      anew_entity_org_links: [{ entity_id: fixture.entityId, organization_id: "org-visible" }],
      anew_leads: [],
      anew_contacts: [],
      anew_clients: [],
      quotes: [],
      deals: [],
    },
    rpcHandlers: {
      get_user_visible_org_ids: async () => ({ data: ["org-visible"], error: null }),
    },
  });

  const deps = baseDeps({ supabaseAdmin, getEncKey: () => encKey, getHmacKey: () => hmacKey });
  const req = makeRequest({ term: TEST_NIF }, `Bearer ${CALLER_JWT}`);
  const res = await handleSearchEntitiesRequest(req, deps);

  const bodyText = await res.text();
  assertEquals(bodyText.includes(TEST_NIF), false);
  assertEquals(bodyText.includes(fixture.nifEncrypted), false);
  assertEquals(bodyText.includes("nif_hash"), false);
  assertEquals(bodyText.includes("nif_encrypted"), false);
  assert(bodyText.includes(fixture.fiscalEntityId));
});

Deno.test("no candidate tokens match => empty result, no error", async () => {
  const supabaseAdmin = makeMockSupabaseAdmin({
    authUser: { id: AUTH_UID },
    anewUser: { id: ANEW_USER_ID },
    tables: {
      fiscal_entity_nif_tokens: [],
    },
  });
  const deps = baseDeps({ supabaseAdmin });
  const req = makeRequest({ term: "999999999" }, `Bearer ${CALLER_JWT}`);
  const res = await handleSearchEntitiesRequest(req, deps);

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.data.fiscal_entity_ids, []);
});

Deno.test("invalid request body (missing term) => 400", async () => {
  const deps = baseDeps();
  const req = makeRequest({}, `Bearer ${CALLER_JWT}`);
  const res = await handleSearchEntitiesRequest(req, deps);
  assertEquals(res.status, 400);
});
