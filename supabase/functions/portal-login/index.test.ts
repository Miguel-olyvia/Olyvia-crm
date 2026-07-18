/**
 * portal-login — new-device-alert matching-logic regression test.
 *
 * BACKGROUND (feature added this session, RGPD Art. 32 audit-trail part 3):
 *   After recording a login attempt, index.ts checks whether a *successful*
 *   login came from an IP/user-agent combination the account has never used
 *   before, and if so inserts a `new_device_login` notification. The lookup
 *   block (index.ts, step "3a"):
 *
 *     const { data: priorSuccesses } = await supabase
 *       .from("auth_login_attempts")
 *       .select("ip_address, user_agent")
 *       .eq("auth_user_id", authUserId)
 *       .eq("success", true)
 *       .lt("created_at", attemptTimestamp)
 *       .order("created_at", { ascending: false })
 *       .limit(200);
 *
 *     const isKnownDevice = (priorSuccesses || []).some((row) =>
 *       row.ip_address === clientIp && row.user_agent === userAgent
 *     );
 *
 *   The comment above that block explains WHY the ip/user-agent match is
 *   done in application code instead of a PostgREST `.or(...)` filter:
 *   `ip_address`/`user_agent` are attacker-controlled request headers that
 *   frequently contain commas/parentheses (standard User-Agent strings),
 *   which would corrupt `.or("col.eq.value,...")` filter syntax if
 *   interpolated directly.
 *
 *   A regression here would mean either: (a) a known device wrongly
 *   flagged as new (spamming the user with false "new access" alerts), or
 *   (b) — the more dangerous direction — a genuinely new device wrongly
 *   classified as known (silently suppressing the security alert this
 *   feature exists to send), or (c) the query itself losing the
 *   `auth_user_id` / `success` / `created_at` scoping and comparing a
 *   user's login against another user's history, or against the row just
 *   inserted for the current attempt.
 *
 * WHY THIS TEST DOES NOT IMPORT index.ts:
 *   Like suggest-schedule-assignee/index.ts, portal-login/index.ts has NOT
 *   been refactored into a handler.ts with injectable dependencies — all
 *   logic (rate-limit lookup, the GoTrue password-grant fetch, the attempt
 *   insert, this new-device check, and the lockout ban) lives directly
 *   inside the top-level `serve(async (req) => {...})` callback, reading
 *   `Deno.env.get(...)` and calling a real `fetch(...)` against GoTrue.
 *   Importing index.ts would execute `serve(...)` at module load time and
 *   require real Supabase/GoTrue credentials and network access.
 *
 *   Per the task scope, this session does NOT refactor index.ts (or the
 *   login flow itself) to make it importable. Instead, following the same
 *   fallback pattern already used in suggest-schedule-assignee/index.test.ts
 *   (see its header) and update-lead/index.test.ts's "L4" tests, this file
 *   replicates the exact query-building + matching block from index.ts's
 *   step "3a" (at the time of writing) as a small local function, and
 *   exercises it against a mock Supabase query builder that performs REAL
 *   filtering based on the `.eq()`/`.lt()` calls the replicated function
 *   actually issues — so if the `auth_user_id`/`success`/`created_at`
 *   filters or the ip/user-agent predicate are ever weakened in index.ts,
 *   and this replica is kept in sync, the test fails.
 *
 *   CAVEAT: because this is a replica and not an import, it can silently
 *   drift from index.ts if index.ts is edited without updating this file.
 *   That drift risk is the direct, accepted cost of not having a
 *   handler.ts here (same tradeoff already accepted for
 *   suggest-schedule-assignee/index.test.ts).
 *
 * WHAT WOULD MAKE THIS FULLY AIRTIGHT (out of scope for this fix):
 *   Extract a `handler.ts` from `supabase/functions/portal-login/index.ts`
 *   (or, at minimum, extract just the new-device check into an exported
 *   `checkIsKnownDevice(supabase, { authUserId, clientIp, userAgent,
 *   beforeTimestamp })` helper in a sibling module), so this test could
 *   import the real function directly instead of a hand-kept-in-sync copy.
 */

import {
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

interface LoginAttemptRow {
  auth_user_id: string | null;
  success: boolean;
  created_at: string;
  ip_address: string;
  user_agent: string;
}

interface EqCall {
  op: "eq" | "lt";
  column: string;
  value: unknown;
}

/**
 * Mock query builder for `auth_login_attempts`. Performs REAL filtering
 * based on the `.eq()`/`.lt()` calls it actually receives (not a hardcoded
 * scenario), so removing/weakening a filter in the code under test changes
 * what the final `.limit()` resolves to — the same way it would change a
 * real Postgres query's result set.
 */
function makeMockSupabase(rows: LoginAttemptRow[]) {
  const calls: EqCall[] = [];

  const matches = () =>
    rows.filter((row) =>
      calls.every((call) => {
        const rowValue = (row as unknown as Record<string, unknown>)[call.column];
        if (call.op === "eq") return rowValue === call.value;
        // "lt" — the only lt() used in this block compares ISO timestamp strings.
        return typeof rowValue === "string" && typeof call.value === "string" &&
          rowValue < call.value;
      })
    );

  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      calls.push({ op: "eq", column, value });
      return builder;
    },
    lt: (column: string, value: unknown) => {
      calls.push({ op: "lt", column, value });
      return builder;
    },
    order: () => builder,
    limit: async (_n: number) => ({ data: matches(), error: null }),
  };

  // deno-lint-ignore no-explicit-any
  const supabase: any = {
    from: (table: string) => {
      if (table !== "auth_login_attempts") {
        throw new Error(`Unexpected table in mock: ${table}`);
      }
      return builder;
    },
  };

  return { supabase, calls };
}

/**
 * Replicates supabase/functions/portal-login/index.ts, step "3a" (the
 * prior-successful-logins lookup + ip/user-agent match). Keep this in sync
 * with index.ts if that block changes.
 */
async function checkIsKnownDevice(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  authUserId: string,
  attemptTimestamp: string,
  clientIp: string,
  userAgent: string,
): Promise<boolean> {
  const { data: priorSuccesses } = await supabase
    .from("auth_login_attempts")
    .select("ip_address, user_agent")
    .eq("auth_user_id", authUserId)
    .eq("success", true)
    .lt("created_at", attemptTimestamp)
    .order("created_at", { ascending: false })
    .limit(200);

  return (priorSuccesses || []).some((row: { ip_address: string; user_agent: string }) =>
    row.ip_address === clientIp && row.user_agent === userAgent
  );
}

/**
 * Replicates supabase/functions/portal-login/index.ts's `buildCorsHeaders()`
 * (including its `LOCAL_DEV_ORIGIN_PATTERN` companion). Keep this in sync
 * with index.ts if that logic changes. See the file-level comment above for
 * why index.ts itself isn't imported directly (it calls `serve(...)` at
 * module load and needs real Supabase/GoTrue env + network access).
 *
 * This covers the CORS regression fixed in this session: local dev origins
 * (e.g. http://localhost:5173) were always falling back to PRODUCTION_ORIGIN,
 * which the browser then rejects because it doesn't match the request's
 * actual Origin — breaking login from any non-production environment
 * (local dev, e2e, CI).
 */
const PRODUCTION_ORIGIN_REPLICA = "https://app.olyvia.pt";
const VERCEL_PREVIEW_ORIGIN_PATTERN_REPLICA =
  /^https:\/\/olyvia-crm-git-[a-z0-9-]+-bmgest\.vercel\.app$/;
const LOCAL_DEV_ORIGIN_PATTERN_REPLICA =
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function buildCorsHeadersReplica(
  requestOrigin: string | null,
  allowedOriginEnv?: string,
): Record<string, string> {
  const allowed = [PRODUCTION_ORIGIN_REPLICA, allowedOriginEnv].filter(
    (origin): origin is string => Boolean(origin),
  );
  const matched = requestOrigin &&
      (allowed.includes(requestOrigin) ||
        VERCEL_PREVIEW_ORIGIN_PATTERN_REPLICA.test(requestOrigin) ||
        LOCAL_DEV_ORIGIN_PATTERN_REPLICA.test(requestOrigin))
    ? requestOrigin
    : PRODUCTION_ORIGIN_REPLICA;

  return {
    "Access-Control-Allow-Origin": matched,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    Vary: "Origin",
  };
}

Deno.test("CORS: a local dev origin (http://localhost:5173) is reflected back, not forced to PRODUCTION_ORIGIN", () => {
  const headers = buildCorsHeadersReplica("http://localhost:5173");
  assertEquals(headers["Access-Control-Allow-Origin"], "http://localhost:5173");
});

Deno.test("CORS: a local dev origin on a different port (http://localhost:8080) is also reflected back", () => {
  const headers = buildCorsHeadersReplica("http://localhost:8080");
  assertEquals(headers["Access-Control-Allow-Origin"], "http://localhost:8080");
});

Deno.test("CORS: a 127.0.0.1 origin with a port is reflected back", () => {
  const headers = buildCorsHeadersReplica("http://127.0.0.1:4173");
  assertEquals(headers["Access-Control-Allow-Origin"], "http://127.0.0.1:4173");
});

Deno.test("CORS: a bare localhost origin with no port is reflected back", () => {
  const headers = buildCorsHeadersReplica("http://localhost");
  assertEquals(headers["Access-Control-Allow-Origin"], "http://localhost");
});

Deno.test("CORS: an arbitrary non-local, non-production origin still falls back to PRODUCTION_ORIGIN (policy stays closed)", () => {
  const headers = buildCorsHeadersReplica("https://evil.example.com");
  assertEquals(headers["Access-Control-Allow-Origin"], PRODUCTION_ORIGIN_REPLICA);
});

Deno.test("CORS: a lookalike host that merely contains 'localhost' as a suffix/subdomain is rejected (anchored pattern holds)", () => {
  const headers = buildCorsHeadersReplica("https://localhost.evil.com");
  assertEquals(headers["Access-Control-Allow-Origin"], PRODUCTION_ORIGIN_REPLICA);
});

Deno.test("CORS: a lookalike host with 'localhost' as a prefix is rejected (anchored pattern holds)", () => {
  const headers = buildCorsHeadersReplica("https://evil-localhost.com");
  assertEquals(headers["Access-Control-Allow-Origin"], PRODUCTION_ORIGIN_REPLICA);
});

Deno.test("CORS: the exact production origin is still reflected back (existing behavior preserved)", () => {
  const headers = buildCorsHeadersReplica("https://app.olyvia.pt");
  assertEquals(headers["Access-Control-Allow-Origin"], PRODUCTION_ORIGIN_REPLICA);
});

Deno.test("CORS: a Vercel preview origin matching the anchored pattern is still reflected back (existing behavior preserved)", () => {
  const headers = buildCorsHeadersReplica(
    "https://olyvia-crm-git-development-bmgest.vercel.app",
  );
  assertEquals(
    headers["Access-Control-Allow-Origin"],
    "https://olyvia-crm-git-development-bmgest.vercel.app",
  );
});

Deno.test("CORS: the ALLOWED_ORIGIN env-configured test origin is still reflected back (existing behavior preserved)", () => {
  const headers = buildCorsHeadersReplica(
    "http://custom-test-origin.example",
    "http://custom-test-origin.example",
  );
  assertEquals(
    headers["Access-Control-Allow-Origin"],
    "http://custom-test-origin.example",
  );
});

Deno.test("CORS: a null/missing Origin header falls back to PRODUCTION_ORIGIN", () => {
  const headers = buildCorsHeadersReplica(null);
  assertEquals(headers["Access-Control-Allow-Origin"], PRODUCTION_ORIGIN_REPLICA);
});

const USER_A = "user-a";
const USER_B = "user-b";
const NOW = "2026-07-17T12:00:00.000Z";
const EARLIER = "2026-07-01T09:00:00.000Z";

Deno.test("new-device check: a prior successful login from the exact same ip/user-agent marks the device as known (no alert)", async () => {
  const rows: LoginAttemptRow[] = [
    {
      auth_user_id: USER_A,
      success: true,
      created_at: EARLIER,
      ip_address: "203.0.113.10",
      user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    },
  ];
  const { supabase } = makeMockSupabase(rows);

  const isKnownDevice = await checkIsKnownDevice(
    supabase,
    USER_A,
    NOW,
    "203.0.113.10",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  );

  assertEquals(isKnownDevice, true);
});

Deno.test("new-device check: a new ip address (same user-agent, no prior match) is flagged as a new device (alert fires)", async () => {
  const rows: LoginAttemptRow[] = [
    {
      auth_user_id: USER_A,
      success: true,
      created_at: EARLIER,
      ip_address: "203.0.113.10",
      user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    },
  ];
  const { supabase } = makeMockSupabase(rows);

  const isKnownDevice = await checkIsKnownDevice(
    supabase,
    USER_A,
    NOW,
    "198.51.100.77", // different IP
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  );

  assertEquals(isKnownDevice, false);
});

Deno.test("new-device check: a new user-agent (same ip, no prior match) is flagged as a new device (alert fires)", async () => {
  const rows: LoginAttemptRow[] = [
    {
      auth_user_id: USER_A,
      success: true,
      created_at: EARLIER,
      ip_address: "203.0.113.10",
      user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    },
  ];
  const { supabase } = makeMockSupabase(rows);

  const isKnownDevice = await checkIsKnownDevice(
    supabase,
    USER_A,
    NOW,
    "203.0.113.10",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", // different UA
  );

  assertEquals(isKnownDevice, false);
});

Deno.test("new-device check: a user's very first successful login (no prior rows at all) is flagged as a new device (alert fires)", async () => {
  const { supabase } = makeMockSupabase([]);

  const isKnownDevice = await checkIsKnownDevice(
    supabase,
    USER_A,
    NOW,
    "203.0.113.10",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  );

  assertEquals(isKnownDevice, false);
});

Deno.test("new-device check: another user's matching ip/user-agent history never counts as this user's known device (auth_user_id filter holds)", async () => {
  const rows: LoginAttemptRow[] = [
    {
      auth_user_id: USER_B, // different user, same ip/UA
      success: true,
      created_at: EARLIER,
      ip_address: "203.0.113.10",
      user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    },
  ];
  const { supabase } = makeMockSupabase(rows);

  const isKnownDevice = await checkIsKnownDevice(
    supabase,
    USER_A,
    NOW,
    "203.0.113.10",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  );

  assertEquals(isKnownDevice, false);
});

Deno.test("new-device check: a FAILED prior login from the same ip/user-agent never counts as a known device (success filter holds)", async () => {
  const rows: LoginAttemptRow[] = [
    {
      auth_user_id: USER_A,
      success: false, // failed attempt, not a successful login
      created_at: EARLIER,
      ip_address: "203.0.113.10",
      user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    },
  ];
  const { supabase } = makeMockSupabase(rows);

  const isKnownDevice = await checkIsKnownDevice(
    supabase,
    USER_A,
    NOW,
    "203.0.113.10",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  );

  assertEquals(isKnownDevice, false);
});

Deno.test("new-device check: the row being inserted for the CURRENT attempt (created_at == attemptTimestamp) is excluded, never self-matching (created_at < filter holds)", async () => {
  // Only row present has created_at === attemptTimestamp (i.e. it IS the
  // current attempt's own row, already committed by the time this lookup
  // could theoretically run). It must be excluded by the `lt` filter, so a
  // brand-new device is still correctly flagged as new, not accidentally
  // "known" via self-match.
  const rows: LoginAttemptRow[] = [
    {
      auth_user_id: USER_A,
      success: true,
      created_at: NOW,
      ip_address: "203.0.113.10",
      user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    },
  ];
  const { supabase } = makeMockSupabase(rows);

  const isKnownDevice = await checkIsKnownDevice(
    supabase,
    USER_A,
    NOW,
    "203.0.113.10",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  );

  assertEquals(isKnownDevice, false);
});

Deno.test("regression guard: the lookup issues auth_user_id/success/created_at filters alongside the query (fails if any is removed)", async () => {
  const rows: LoginAttemptRow[] = [
    {
      auth_user_id: USER_A,
      success: true,
      created_at: EARLIER,
      ip_address: "203.0.113.10",
      user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    },
  ];
  const { supabase, calls } = makeMockSupabase(rows);

  await checkIsKnownDevice(
    supabase,
    USER_A,
    NOW,
    "203.0.113.10",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  );

  const hasAuthUserFilter = calls.some(
    (c) => c.op === "eq" && c.column === "auth_user_id" && c.value === USER_A,
  );
  const hasSuccessFilter = calls.some(
    (c) => c.op === "eq" && c.column === "success" && c.value === true,
  );
  const hasCreatedAtFilter = calls.some(
    (c) => c.op === "lt" && c.column === "created_at" && c.value === NOW,
  );

  assertEquals(hasAuthUserFilter, true);
  assertEquals(hasSuccessFilter, true);
  assertEquals(hasCreatedAtFilter, true);
  assertNotEquals(calls.length, 0);
});
