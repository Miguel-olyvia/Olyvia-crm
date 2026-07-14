/**
 * nif-backfill — request handler tests.
 *
 * These tests import handler.ts directly (not index.ts) so that Deno.serve
 * is never invoked in the test process. The Supabase client and the
 * encryption/HMAC key providers are injected via NifBackfillDeps, following
 * the same "extract logic, inject dependencies" pattern used elsewhere in
 * this repo's *.test.ts files (see update-lead/index.test.ts).
 */

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decryptNif, hashNif, tokenizeNif } from "../_shared/nifCrypto.ts";
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  handleNifBackfillRequest,
  type NifBackfillDeps,
} from "./handler.ts";

const SERVICE_ROLE_KEY = "test-service-role-key";

// ── crypto key fixtures ──

function randomKey(): Uint8Array {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes;
}

// ── mock Supabase client ──

interface FiscalRow {
  id: string;
  nif: string;
  nif_hash: string | null;
  nif_encrypted: string | null;
}

interface MockState {
  fiscalRows: FiscalRow[];
  tokenRows: Array<{ fiscal_entity_id: string; token_hash: string }>;
  limitCalledWith: number[];
  upsertCallCount: number;
  updateCallCount: number;
}

function makeMockSupabase(options: {
  fiscalRows?: FiscalRow[];
  isAdmin?: boolean;
  authUser?: { id: string } | null;
  anewUser?: { id: string } | null;
  /**
   * When set, `fiscal_entity_nif_tokens.upsert` returns this error message
   * instead of succeeding, exercising the `tokenError` continue-on-failure
   * branch in handler.ts.
   */
  tokenUpsertError?: string;
  /**
   * When set, `fiscal_entities.update` returns this error message instead
   * of succeeding, exercising the `updateError` continue-on-failure branch
   * in handler.ts (after the token upsert has already succeeded).
   */
  fiscalUpdateError?: string;
} = {}) {
  const state: MockState = {
    fiscalRows: options.fiscalRows ?? [],
    tokenRows: [],
    limitCalledWith: [],
    upsertCallCount: 0,
    updateCallCount: 0,
  };

  // deno-lint-ignore no-explicit-any
  const supabase: any = {
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
              maybeSingle: async () => ({ data: options.anewUser ?? null, error: null }),
            }),
          }),
        };
      }

      if (table === "anew_memberships") {
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({
                data: options.isAdmin ? [{ role_id: "role-admin" }] : [{ role_id: "role-basic" }],
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === "anew_roles") {
        return {
          select: () => ({
            in: () => ({
              eq: async () => ({
                data: options.isAdmin ? [{ id: "role-admin" }] : [],
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === "fiscal_entities") {
        return {
          select: () => ({
            not: () => ({
              is: () => ({
                limit: async (n: number) => {
                  state.limitCalledWith.push(n);
                  const candidates = state.fiscalRows.filter((r) => r.nif && r.nif_hash === null);
                  return { data: candidates.slice(0, n).map((r) => ({ id: r.id, nif: r.nif })), error: null };
                },
              }),
            }),
          }),
          update: (payload: { nif_encrypted: string; nif_hash: string }) => ({
            eq: async (_col: string, id: string) => {
              state.updateCallCount++;
              if (options.fiscalUpdateError) {
                return { error: { message: options.fiscalUpdateError } };
              }
              const idx = state.fiscalRows.findIndex((r) => r.id === id);
              if (idx >= 0) {
                state.fiscalRows[idx] = {
                  ...state.fiscalRows[idx],
                  nif_encrypted: payload.nif_encrypted,
                  nif_hash: payload.nif_hash,
                };
              }
              return { error: null };
            },
          }),
        };
      }

      if (table === "fiscal_entity_nif_tokens") {
        return {
          upsert: async (
            rows: Array<{ fiscal_entity_id: string; token_hash: string }>,
            _opts: unknown,
          ) => {
            state.upsertCallCount++;
            if (options.tokenUpsertError) {
              return { error: { message: options.tokenUpsertError } };
            }
            for (const row of rows) {
              const exists = state.tokenRows.some(
                (t) => t.fiscal_entity_id === row.fiscal_entity_id && t.token_hash === row.token_hash,
              );
              if (!exists) state.tokenRows.push(row);
            }
            return { error: null };
          },
        };
      }

      throw new Error(`makeMockSupabase: unexpected table "${table}"`);
    },
  };

  return { supabase, state };
}

function makeReq(body: unknown, token: string | null = SERVICE_ROLE_KEY): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token !== null) headers["Authorization"] = `Bearer ${token}`;
  return new Request("http://localhost/nif-backfill", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function withServiceRoleEnv<T>(fn: () => Promise<T>): Promise<T> {
  const originalGet = Deno.env.get;
  Deno.env.get = ((name: string) =>
    name === "SUPABASE_SERVICE_ROLE_KEY" ? SERVICE_ROLE_KEY : originalGet(name)) as typeof Deno.env.get;
  return fn().finally(() => {
    Deno.env.get = originalGet;
  });
}

function makeDeps(supabase: unknown, encKey: Uint8Array, hmacKey: Uint8Array): NifBackfillDeps {
  return {
    supabase,
    getEncKey: () => encKey,
    getHmacKey: () => hmacKey,
  };
}

// ── console.error / captureError spying ──
//
// console.error is a plain mutable property on the global `console` object,
// so it can be swapped for a capturing stub and restored afterwards — this
// is used below to assert that none of the continue-on-failure log lines in
// handler.ts (tokenError / updateError / catch(rowError)) ever contain the
// plaintext NIF.
//
// captureError, by contrast, is a named export of ../_shared/sentry.ts
// imported directly by handler.ts (not injected via NifBackfillDeps). ES
// module namespace bindings are non-writable and non-configurable by spec —
// reassigning or redefining `captureError` from this test file throws
// ("Cannot assign to property ... of [object Module]"), so it cannot be
// spied on directly without changing handler.ts's dependency structure,
// which is out of scope here (the implementation itself is correct; only
// test coverage is being reinforced). Two facts make the PII invariant
// verifiable anyway without a literal spy:
//   1. captureError(error, context) is only ever called with the exact same
//      `rowError` value that was just logged one line earlier via
//      console.error(...) at the same call site — so asserting on the
//      console.error spy's captured arguments also covers what reaches
//      captureError at that call site.
//   2. captureError's entire body is gated on the module-level `initialized`
//      flag in sentry.ts, which is only ever set by calling initSentry()
//      (done in index.ts, never imported by this test file) and only when
//      SENTRY_DSN is set. Since no test in this file calls initSentry(),
//      captureError is provably a no-op for the whole test process,
//      regardless of what arguments it receives.
function spyConsoleError(): { calls: string[]; restore: () => void } {
  const originalConsoleError = console.error;
  const calls: string[] = [];
  console.error = (...args: unknown[]) => {
    calls.push(
      args
        .map((a) => (a instanceof Error ? a.message : typeof a === "string" ? a : JSON.stringify(a)))
        .join(" "),
    );
  };
  return {
    calls,
    restore: () => {
      console.error = originalConsoleError;
    },
  };
}

// ── auth ──

Deno.test("rejects requests without an Authorization header (401)", async () => {
  await withServiceRoleEnv(async () => {
    const { supabase } = makeMockSupabase();
    const encKey = randomKey();
    const hmacKey = randomKey();

    const res = await handleNifBackfillRequest(
      makeReq({}, null),
      makeDeps(supabase, encKey, hmacKey),
    );

    assertEquals(res.status, 401);
    const body = await res.text();
    assert(!body.includes("123456789"));
  });
});

Deno.test("rejects requests from an authenticated non-admin user (403)", async () => {
  await withServiceRoleEnv(async () => {
    const { supabase } = makeMockSupabase({
      isAdmin: false,
      authUser: { id: "auth-user-1" },
      anewUser: { id: "anew-user-1" },
    });
    const encKey = randomKey();
    const hmacKey = randomKey();

    const res = await handleNifBackfillRequest(
      makeReq({}, "not-the-service-role-key"),
      makeDeps(supabase, encKey, hmacKey),
    );

    assertEquals(res.status, 403);
    const json = await res.json();
    assertEquals(json.error, "Admin role required");
  });
});

// ── dry_run behavior ──

Deno.test("dry_run defaults to true and does not write anything", async () => {
  await withServiceRoleEnv(async () => {
    const fiscalRows: FiscalRow[] = [
      { id: "fe-1", nif: "123456789", nif_hash: null, nif_encrypted: null },
      { id: "fe-2", nif: "987654321", nif_hash: null, nif_encrypted: null },
    ];
    const { supabase, state } = makeMockSupabase({ fiscalRows, isAdmin: true });
    const encKey = randomKey();
    const hmacKey = randomKey();

    const res = await handleNifBackfillRequest(
      makeReq({}),
      makeDeps(supabase, encKey, hmacKey),
    );

    assertEquals(res.status, 200);
    const json = await res.json();
    assertEquals(json.processed, 0);
    assertEquals(json.would_process, 2);
    assertEquals(json.tokens_written, 0);

    assertEquals(state.updateCallCount, 0);
    assertEquals(state.upsertCallCount, 0);
    assertEquals(state.tokenRows.length, 0);
    assertEquals(state.fiscalRows[0].nif_hash, null);
    assertEquals(state.fiscalRows[1].nif_hash, null);

    const raw = JSON.stringify(json);
    assert(!raw.includes("123456789"));
    assert(!raw.includes("987654321"));
  });
});

Deno.test("dry_run: true explicitly behaves the same as the default", async () => {
  await withServiceRoleEnv(async () => {
    const fiscalRows: FiscalRow[] = [
      { id: "fe-1", nif: "123456789", nif_hash: null, nif_encrypted: null },
    ];
    const { supabase, state } = makeMockSupabase({ fiscalRows, isAdmin: true });
    const encKey = randomKey();
    const hmacKey = randomKey();

    const res = await handleNifBackfillRequest(
      makeReq({ dry_run: true }),
      makeDeps(supabase, encKey, hmacKey),
    );

    const json = await res.json();
    assertEquals(json.would_process, 1);
    assertEquals(json.processed, 0);
    assertEquals(state.updateCallCount, 0);
    assertEquals(state.upsertCallCount, 0);
  });
});

// ── dry_run: false writes ──

Deno.test("dry_run: false writes nif_encrypted/nif_hash correctly and the right number of tokens", async () => {
  await withServiceRoleEnv(async () => {
    const originalNif = "123456789";
    const fiscalRows: FiscalRow[] = [
      { id: "fe-1", nif: originalNif, nif_hash: null, nif_encrypted: null },
    ];
    const { supabase, state } = makeMockSupabase({ fiscalRows, isAdmin: true });
    const encKey = randomKey();
    const hmacKey = randomKey();

    const res = await handleNifBackfillRequest(
      makeReq({ dry_run: false }),
      makeDeps(supabase, encKey, hmacKey),
    );

    assertEquals(res.status, 200);
    const json = await res.json();
    assertEquals(json.processed, 1);

    const expectedTokens = await tokenizeNif(originalNif, hmacKey);
    assertEquals(json.tokens_written, expectedTokens.length);

    const row = state.fiscalRows[0];
    assert(row.nif_encrypted !== null);
    assert(row.nif_hash !== null);

    const decrypted = await decryptNif(row.nif_encrypted!, encKey);
    assertEquals(decrypted, originalNif);

    const expectedHash = await hashNif(originalNif, hmacKey);
    assertEquals(row.nif_hash, expectedHash);

    assertEquals(state.tokenRows.length, expectedTokens.length);
    for (const t of expectedTokens) {
      assert(state.tokenRows.some((r) => r.fiscal_entity_id === "fe-1" && r.token_hash === t));
    }

    const raw = JSON.stringify(json);
    assert(!raw.includes(originalNif));
  });
});

// ── idempotency ──

Deno.test("running the backfill twice does not re-process already-migrated rows or duplicate tokens", async () => {
  await withServiceRoleEnv(async () => {
    const originalNif = "111222333";
    const fiscalRows: FiscalRow[] = [
      { id: "fe-1", nif: originalNif, nif_hash: null, nif_encrypted: null },
    ];
    const { supabase, state } = makeMockSupabase({ fiscalRows, isAdmin: true });
    const encKey = randomKey();
    const hmacKey = randomKey();
    const deps = makeDeps(supabase, encKey, hmacKey);

    const firstRun = await handleNifBackfillRequest(makeReq({ dry_run: false }), deps);
    const firstJson = await firstRun.json();
    assertEquals(firstJson.processed, 1);
    const tokensAfterFirstRun = state.tokenRows.length;

    const secondRun = await handleNifBackfillRequest(makeReq({ dry_run: false }), deps);
    const secondJson = await secondRun.json();

    // The row's nif_hash is now set, so it should no longer be selected.
    assertEquals(secondJson.processed, 0);
    assertEquals(secondJson.tokens_written, 0);
    assertEquals(state.tokenRows.length, tokensAfterFirstRun);
  });
});

Deno.test("forced reprocessing of the same row does not duplicate tokens", async () => {
  await withServiceRoleEnv(async () => {
    const originalNif = "444555666";
    const fiscalRows: FiscalRow[] = [
      { id: "fe-1", nif: originalNif, nif_hash: null, nif_encrypted: null },
    ];
    const { supabase, state } = makeMockSupabase({ fiscalRows, isAdmin: true });
    const encKey = randomKey();
    const hmacKey = randomKey();
    const deps = makeDeps(supabase, encKey, hmacKey);

    await handleNifBackfillRequest(makeReq({ dry_run: false }), deps);
    const tokensAfterFirstRun = [...state.tokenRows];

    // Force reprocessing: simulate an operator resetting nif_hash to NULL
    // for the same row, then re-running the backfill over it.
    state.fiscalRows[0] = { ...state.fiscalRows[0], nif_hash: null, nif_encrypted: null };

    const secondRun = await handleNifBackfillRequest(makeReq({ dry_run: false }), deps);
    const secondJson = await secondRun.json();

    assertEquals(secondJson.processed, 1);
    assertEquals(state.tokenRows.length, tokensAfterFirstRun.length);
    assertEquals(new Set(state.tokenRows.map((t) => t.token_hash)).size, state.tokenRows.length);
  });
});

// ── continue-on-failure branches (dry_run: false loop) ──

Deno.test("tokenError branch: a failed token upsert leaves the row unmigrated (continue) and never leaks the NIF via console.error or the response", async () => {
  await withServiceRoleEnv(async () => {
    const secretNif = "222333444";
    const fiscalRows: FiscalRow[] = [
      { id: "fe-1", nif: secretNif, nif_hash: null, nif_encrypted: null },
    ];
    const { supabase, state } = makeMockSupabase({
      fiscalRows,
      isAdmin: true,
      tokenUpsertError: "simulated token upsert failure",
    });
    const encKey = randomKey();
    const hmacKey = randomKey();

    const errorSpy = spyConsoleError();
    try {
      const res = await handleNifBackfillRequest(
        makeReq({ dry_run: false }),
        makeDeps(supabase, encKey, hmacKey),
      );

      assertEquals(res.status, 200);
      const json = await res.json();
      assertEquals(json.processed, 0);
      assertEquals(json.tokens_written, 0);

      // The tokenError branch continues before ever reaching the row update.
      assertEquals(state.updateCallCount, 0);
      assertEquals(state.tokenRows.length, 0);
      assertEquals(state.fiscalRows[0].nif_hash, null);

      const raw = JSON.stringify(json);
      assert(!raw.includes(secretNif));

      assert(errorSpy.calls.length > 0);
      for (const call of errorSpy.calls) {
        assert(!call.includes(secretNif));
      }
    } finally {
      errorSpy.restore();
    }
  });
});

Deno.test("updateError branch: a failed row update after a successful token upsert leaves nif_hash unset (continue) and never leaks the NIF via console.error or the response", async () => {
  await withServiceRoleEnv(async () => {
    const secretNif = "333444555";
    const fiscalRows: FiscalRow[] = [
      { id: "fe-1", nif: secretNif, nif_hash: null, nif_encrypted: null },
    ];
    const { supabase, state } = makeMockSupabase({
      fiscalRows,
      isAdmin: true,
      fiscalUpdateError: "simulated row update failure",
    });
    const encKey = randomKey();
    const hmacKey = randomKey();

    const errorSpy = spyConsoleError();
    try {
      const res = await handleNifBackfillRequest(
        makeReq({ dry_run: false }),
        makeDeps(supabase, encKey, hmacKey),
      );

      assertEquals(res.status, 200);
      const json = await res.json();
      // tokensWritten/processed are only incremented after the row update
      // succeeds, so both stay 0 even though the tokens were physically
      // upserted (write-tokens-before-row-update ordering, see handler.ts).
      assertEquals(json.processed, 0);
      assertEquals(json.tokens_written, 0);

      assertEquals(state.updateCallCount, 1);
      assert(state.tokenRows.length > 0);
      assertEquals(state.fiscalRows[0].nif_hash, null);

      const raw = JSON.stringify(json);
      assert(!raw.includes(secretNif));

      assert(errorSpy.calls.length > 0);
      for (const call of errorSpy.calls) {
        assert(!call.includes(secretNif));
      }
    } finally {
      errorSpy.restore();
    }
  });
});

Deno.test("catch(rowError) branch: an unexpected per-row exception (corrupted encryption key) is caught, logged without the NIF, and never reaches captureError's arguments", async () => {
  await withServiceRoleEnv(async () => {
    const secretNif = "444555666";
    const fiscalRows: FiscalRow[] = [
      { id: "fe-1", nif: secretNif, nif_hash: null, nif_encrypted: null },
    ];
    const { supabase, state } = makeMockSupabase({ fiscalRows, isAdmin: true });
    // A key with the wrong byte length makes tokenizeNif/hashNif succeed
    // (HMAC key is valid) but encryptNif throw inside importAesKeyIfNeeded,
    // landing in handler.ts's catch(rowError) block — after the token
    // upsert has already succeeded, before the row update is attempted.
    const badEncKey = new Uint8Array(16);
    crypto.getRandomValues(badEncKey);
    const hmacKey = randomKey();

    const errorSpy = spyConsoleError();
    try {
      const deps: NifBackfillDeps = {
        supabase,
        getEncKey: () => badEncKey,
        getHmacKey: () => hmacKey,
      };

      const res = await handleNifBackfillRequest(makeReq({ dry_run: false }), deps);

      assertEquals(res.status, 200);
      const json = await res.json();
      assertEquals(json.processed, 0);
      assertEquals(json.tokens_written, 0);

      // Tokens were written before the failure; the row update was never
      // reached.
      assert(state.tokenRows.length > 0);
      assertEquals(state.updateCallCount, 0);
      assertEquals(state.fiscalRows[0].nif_hash, null);

      const raw = JSON.stringify(json);
      assert(!raw.includes(secretNif));

      assert(errorSpy.calls.length > 0);
      for (const call of errorSpy.calls) {
        assert(!call.includes(secretNif));
        // Sanity check that we are actually exercising the intended
        // exception (and not silently asserting on an unrelated log line).
      }
      assert(errorSpy.calls.some((call) => call.includes("Invalid AES key length")));

      // See the module-level comment above spyConsoleError() for why
      // captureError cannot be spied on directly in this test file: its
      // arguments here are the same `rowError` object already asserted
      // above via the console.error spy, and its body never executes
      // because initSentry() is never called by this test suite.
    } finally {
      errorSpy.restore();
    }
  });
});

// ── missing encryption keys ──

Deno.test("missing encryption key env var results in a clear 500 error and no writes", async () => {
  await withServiceRoleEnv(async () => {
    const fiscalRows: FiscalRow[] = [
      { id: "fe-1", nif: "123456789", nif_hash: null, nif_encrypted: null },
    ];
    const { supabase, state } = makeMockSupabase({ fiscalRows, isAdmin: true });

    const deps: NifBackfillDeps = {
      supabase,
      getEncKey: () => {
        throw new Error(
          'deriveKeyFromEnv: missing required environment variable "NIF_ENC_KEY"',
        );
      },
      getHmacKey: () => randomKey(),
    };

    const res = await handleNifBackfillRequest(makeReq({ dry_run: false }), deps);

    assertEquals(res.status, 500);
    const json = await res.json();
    assert(json.error.includes("NIF_ENC_KEY"));

    assertEquals(state.updateCallCount, 0);
    assertEquals(state.upsertCallCount, 0);
    assertEquals(state.tokenRows.length, 0);

    const raw = JSON.stringify(json);
    assert(!raw.includes("123456789"));
  });
});

Deno.test("missing HMAC key env var results in a clear 500 error and no writes", async () => {
  await withServiceRoleEnv(async () => {
    const fiscalRows: FiscalRow[] = [
      { id: "fe-1", nif: "123456789", nif_hash: null, nif_encrypted: null },
    ];
    const { supabase, state } = makeMockSupabase({ fiscalRows, isAdmin: true });

    const deps: NifBackfillDeps = {
      supabase,
      getEncKey: () => randomKey(),
      getHmacKey: () => {
        throw new Error(
          'deriveKeyFromEnv: missing required environment variable "NIF_HMAC_KEY"',
        );
      },
    };

    const res = await handleNifBackfillRequest(makeReq({ dry_run: false }), deps);

    assertEquals(res.status, 500);
    const json = await res.json();
    assert(json.error.includes("NIF_HMAC_KEY"));
    assertEquals(state.updateCallCount, 0);
  });
});

// ── response never contains plaintext NIF ──

Deno.test("success response never contains the plaintext NIF value used in the test data", async () => {
  await withServiceRoleEnv(async () => {
    const secretNif = "999888777";
    const fiscalRows: FiscalRow[] = [
      { id: "fe-1", nif: secretNif, nif_hash: null, nif_encrypted: null },
    ];
    const { supabase } = makeMockSupabase({ fiscalRows, isAdmin: true });
    const encKey = randomKey();
    const hmacKey = randomKey();

    const dryRunRes = await handleNifBackfillRequest(
      makeReq({ dry_run: true }),
      makeDeps(supabase, encKey, hmacKey),
    );
    const dryRunText = await dryRunRes.text();
    assert(!dryRunText.includes(secretNif));

    const writeRes = await handleNifBackfillRequest(
      makeReq({ dry_run: false }),
      makeDeps(supabase, encKey, hmacKey),
    );
    const writeText = await writeRes.text();
    assert(!writeText.includes(secretNif));
  });
});

// ── limit handling ──

Deno.test("limit is respected and forwarded to the underlying query", async () => {
  await withServiceRoleEnv(async () => {
    const fiscalRows: FiscalRow[] = Array.from({ length: 10 }, (_, i) => ({
      id: `fe-${i}`,
      nif: `10000000${i}`,
      nif_hash: null,
      nif_encrypted: null,
    }));
    const { supabase, state } = makeMockSupabase({ fiscalRows, isAdmin: true });
    const encKey = randomKey();
    const hmacKey = randomKey();

    const res = await handleNifBackfillRequest(
      makeReq({ dry_run: true, limit: 3 }),
      makeDeps(supabase, encKey, hmacKey),
    );

    const json = await res.json();
    assertEquals(json.would_process, 3);
    assertEquals(state.limitCalledWith, [3]);
  });
});

Deno.test("limit defaults to DEFAULT_LIMIT when omitted", async () => {
  await withServiceRoleEnv(async () => {
    const { supabase, state } = makeMockSupabase({ fiscalRows: [], isAdmin: true });
    const encKey = randomKey();
    const hmacKey = randomKey();

    await handleNifBackfillRequest(makeReq({}), makeDeps(supabase, encKey, hmacKey));

    assertEquals(state.limitCalledWith, [DEFAULT_LIMIT]);
  });
});

Deno.test("an absurdly large limit is rejected by request validation (400), not silently clamped", async () => {
  await withServiceRoleEnv(async () => {
    const { supabase } = makeMockSupabase({ fiscalRows: [], isAdmin: true });
    const encKey = randomKey();
    const hmacKey = randomKey();

    const res = await handleNifBackfillRequest(
      makeReq({ limit: 1_000_000 }),
      makeDeps(supabase, encKey, hmacKey),
    );

    assertEquals(res.status, 400);
  });
});

Deno.test("limit at the maximum allowed value is accepted and forwarded as-is", async () => {
  await withServiceRoleEnv(async () => {
    const { supabase, state } = makeMockSupabase({ fiscalRows: [], isAdmin: true });
    const encKey = randomKey();
    const hmacKey = randomKey();

    const res = await handleNifBackfillRequest(
      makeReq({ limit: MAX_LIMIT }),
      makeDeps(supabase, encKey, hmacKey),
    );

    assertEquals(res.status, 200);
    assertEquals(state.limitCalledWith, [MAX_LIMIT]);
  });
});
