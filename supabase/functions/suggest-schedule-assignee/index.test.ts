/**
 * suggest-schedule-assignee — cross-org isolation regression test.
 *
 * BACKGROUND (bug fixed this session, commit e8bcafea):
 *   The campaign-specific AI scheduling rules lookup filtered
 *   `lead_ai_scheduling_rules` by `campaign_id` only:
 *
 *     .from("lead_ai_scheduling_rules")
 *       .select("*")
 *       .eq("campaign_id", campaign_id)
 *       .eq("is_active", true)
 *       ...
 *
 *   campaign_id is caller-supplied (request body) and is NOT itself scoped
 *   to organization_id anywhere else in the request. Any authenticated
 *   caller who passed validateOrgScope for THEIR OWN organization_id could
 *   still supply (or guess) a campaign_id belonging to a DIFFERENT
 *   organization and receive that other organization's scheduling
 *   rules/AI prompt config (buffer minutes, visit caps, `ai_system_prompt`,
 *   `ai_considerations` — potentially containing business-sensitive
 *   instructions) in the response, purely because campaign_id resolves the
 *   row on its own.
 *
 *   Fix: the query now also filters `.eq("organization_id", organization_id)`,
 *   so a campaign_id that does not belong to the caller's own
 *   organization_id can never match, even if guessed/reused correctly.
 *
 * WHY THIS TEST DOES NOT IMPORT index.ts:
 *   Unlike nif-reveal/handler.ts, fiscal-entity-resolve/handler.ts, or
 *   update-lead's tested helpers, suggest-schedule-assignee/index.ts has
 *   NOT been refactored into a separate handler.ts with injectable
 *   dependencies — all logic (auth, rate limiting, the AI gateway call,
 *   and this query) lives directly inside the top-level `serve(async (req)
 *   => {...})` callback in index.ts. Importing index.ts would execute
 *   `serve(...)` at module load time (real Deno.serve, real
 *   Deno.env.get(...)! non-null assertions that throw without real env
 *   vars, no way to inject a mock Supabase client), which is exactly what
 *   the repo's established handler.ts pattern exists to avoid.
 *
 *   Per the task scope, this session does NOT refactor index.ts to extract
 *   a handler.ts — that is a larger, separate change. To make this a real,
 *   running regression test without that refactor, this file follows the
 *   same fallback pattern already used in
 *   supabase/functions/update-lead/index.test.ts (see its "L4" tests): it
 *   replicates the exact query-building block from index.ts (lines ~112-130
 *   at the time of writing) as a small local function, and exercises it
 *   against a mock Supabase query builder that performs REAL filtering
 *   based on the `.eq()`/`.is()` calls the replicated function actually
 *   issues — so if the `.eq("organization_id", ...)` filter is ever removed
 *   from index.ts, and this replicated copy is kept in sync, the test fails.
 *
 *   CAVEAT: because this is a replica and not an import, it can silently
 *   drift from index.ts if index.ts is edited without updating this file.
 *   That drift risk is the direct cost of not having a handler.ts here.
 *
 * WHAT WOULD MAKE THIS FULLY AIRTIGHT (out of scope for this fix):
 *   Extract a `handler.ts` from `suggest-schedule-assignee/index.ts`,
 *   following the nif-reveal / fiscal-entity-resolve pattern:
 *     - export a `handleSuggestScheduleAssigneeRequest(req, deps)` function
 *       taking an injected Supabase client (or client factory) and any other
 *       env-derived config (AI_GATEWAY_API_KEY, rate-limit client) as `deps`;
 *     - keep `index.ts` as a 5-10 line file that only builds real deps and
 *       calls `Deno.serve` with the handler;
 *     - then this file could import handler.ts directly (no Deno.serve, no
 *       real env vars, no network) and drive a true end-to-end cross-org
 *       scenario through the *actual* code path: 2 organizations
 *       (org-A, org-B), 2 campaigns (one per org) with distinct
 *       `lead_ai_scheduling_rules` rows, 2 callers (one per org) each
 *       correctly scoped to their own organization_id via
 *       resolveCallerIdentity/validateOrgScope, then assert that a request
 *       from the org-A caller with org-B's campaign_id returns org-A's
 *       fallback rules (org-level/template) and NEVER org-B's row/prompt,
 *       and symmetrically for the org-B caller. See the `ignore`d test
 *       below for that exact scenario, left pending until the refactor.
 */

import {
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

interface AISchedulingRuleRow {
  campaign_id: string | null;
  organization_id: string | null;
  is_active: boolean;
  priority: number;
  ai_system_prompt: string | null;
}

interface EqCall {
  column: string;
  value: unknown;
}

/**
 * Mock query builder for `lead_ai_scheduling_rules`. Performs REAL filtering
 * based on the `.eq()`/`.is()` calls it actually receives (not a hardcoded
 * scenario), so removing a filter from the code under test changes what
 * `.single()` resolves to — the same way a removed `.eq()` would change what
 * a real Postgres query returns.
 */
function makeMockSupabase(rows: AISchedulingRuleRow[]) {
  const eqCalls: EqCall[] = [];

  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      eqCalls.push({ column, value });
      return builder;
    },
    is: (column: string, value: unknown) => {
      eqCalls.push({ column, value });
      return builder;
    },
    order: () => builder,
    limit: () => builder,
    single: async () => {
      const matches = rows.filter((row) =>
        eqCalls.every((call) => {
          const rowValue = (row as unknown as Record<string, unknown>)[call.column];
          return rowValue === call.value;
        })
      );
      if (matches.length === 0) {
        return { data: null, error: { message: "no rows" } };
      }
      return { data: matches[0], error: null };
    },
  };

  // deno-lint-ignore no-explicit-any
  const supabase: any = {
    from: (table: string) => {
      if (table !== "lead_ai_scheduling_rules") {
        throw new Error(`Unexpected table in mock: ${table}`);
      }
      return builder;
    },
  };

  return { supabase, eqCalls };
}

/**
 * Replicates supabase/functions/suggest-schedule-assignee/index.ts,
 * "First try campaign-specific rules" block (the exact query the
 * cross-org fix touched). Keep this in sync with index.ts if that block
 * changes.
 */
// deno-lint-ignore no-explicit-any
async function loadCampaignSpecificRules(
  supabase: any,
  organization_id: string,
  campaign_id: string,
): Promise<AISchedulingRuleRow | null> {
  const { data } = await supabase
    .from("lead_ai_scheduling_rules")
    .select("*")
    .eq("campaign_id", campaign_id)
    .eq("organization_id", organization_id) // <-- the cross-org fix (e8bcafea)
    .eq("is_active", true)
    .order("priority", { ascending: false })
    .limit(1)
    .single();

  return data ?? null;
}

const SHARED_CAMPAIGN_ID = "campaign-shared-guess"; // same campaign_id string, reused across orgs on purpose
const ORG_A = "org-A";
const ORG_B = "org-B";

Deno.test("cross-org isolation: org-A caller with a campaign_id that also exists under org-B only ever gets org-A's rules", async () => {
  const rows: AISchedulingRuleRow[] = [
    {
      campaign_id: SHARED_CAMPAIGN_ID,
      organization_id: ORG_A,
      is_active: true,
      priority: 1,
      ai_system_prompt: "ORG-A confidential scheduling prompt",
    },
    {
      campaign_id: SHARED_CAMPAIGN_ID,
      organization_id: ORG_B,
      is_active: true,
      priority: 1,
      ai_system_prompt: "ORG-B confidential scheduling prompt",
    },
  ];
  const { supabase } = makeMockSupabase(rows);

  const result = await loadCampaignSpecificRules(
    supabase,
    ORG_A,
    SHARED_CAMPAIGN_ID,
  );

  assertEquals(result?.organization_id, ORG_A);
  assertEquals(result?.ai_system_prompt, "ORG-A confidential scheduling prompt");
  assertNotEquals(result?.ai_system_prompt, "ORG-B confidential scheduling prompt");
});

Deno.test("cross-org isolation: org-B caller with the same shared campaign_id only ever gets org-B's rules (symmetric check)", async () => {
  const rows: AISchedulingRuleRow[] = [
    {
      campaign_id: SHARED_CAMPAIGN_ID,
      organization_id: ORG_A,
      is_active: true,
      priority: 1,
      ai_system_prompt: "ORG-A confidential scheduling prompt",
    },
    {
      campaign_id: SHARED_CAMPAIGN_ID,
      organization_id: ORG_B,
      is_active: true,
      priority: 1,
      ai_system_prompt: "ORG-B confidential scheduling prompt",
    },
  ];
  const { supabase } = makeMockSupabase(rows);

  const result = await loadCampaignSpecificRules(
    supabase,
    ORG_B,
    SHARED_CAMPAIGN_ID,
  );

  assertEquals(result?.organization_id, ORG_B);
  assertEquals(result?.ai_system_prompt, "ORG-B confidential scheduling prompt");
  assertNotEquals(result?.ai_system_prompt, "ORG-A confidential scheduling prompt");
});

Deno.test("cross-org isolation: guessing another org's campaign_id with your own organization_id resolves to nothing (no fallback leak)", async () => {
  // Only org-B has a row for this campaign_id. org-A caller guesses the
  // campaign_id but still sends their own organization_id (as the real
  // caller flow forces via validateOrgScope) — must not match anything.
  const rows: AISchedulingRuleRow[] = [
    {
      campaign_id: SHARED_CAMPAIGN_ID,
      organization_id: ORG_B,
      is_active: true,
      priority: 1,
      ai_system_prompt: "ORG-B confidential scheduling prompt",
    },
  ];
  const { supabase } = makeMockSupabase(rows);

  const result = await loadCampaignSpecificRules(
    supabase,
    ORG_A,
    SHARED_CAMPAIGN_ID,
  );

  assertEquals(result, null);
});

Deno.test("regression guard: the query issues an organization_id filter alongside campaign_id (fails if the fix is reverted)", async () => {
  const rows: AISchedulingRuleRow[] = [
    {
      campaign_id: SHARED_CAMPAIGN_ID,
      organization_id: ORG_A,
      is_active: true,
      priority: 1,
      ai_system_prompt: "ORG-A confidential scheduling prompt",
    },
  ];
  const { supabase, eqCalls } = makeMockSupabase(rows);

  await loadCampaignSpecificRules(supabase, ORG_A, SHARED_CAMPAIGN_ID);

  const hasCampaignFilter = eqCalls.some(
    (c) => c.column === "campaign_id" && c.value === SHARED_CAMPAIGN_ID,
  );
  const hasOrgFilter = eqCalls.some(
    (c) => c.column === "organization_id" && c.value === ORG_A,
  );
  assertEquals(hasCampaignFilter, true);
  assertEquals(hasOrgFilter, true);
});

// ── Pending: true end-to-end cross-org test (needs handler.ts extraction) ──

Deno.test({
  name:
    "PENDING (requires handler.ts extraction) — full request-level cross-org isolation: " +
    "2 organizations, 2 users, 2 campaigns; org-A user's request (own JWT, own organization_id, " +
    "org-B's campaign_id) must never return org-B's schedule_resources, anew_memberships, " +
    "schedule_items, or lead_ai_scheduling_rules content, and vice-versa for the org-B user. " +
    "Currently not runnable: suggest-schedule-assignee/index.ts has no handler.ts, so the real " +
    "request handling logic (auth, org-scope validation, all Supabase reads, the AI gateway call) " +
    "cannot be invoked in a test process without executing Deno.serve and requiring real env vars " +
    "(SUPABASE_URL, SUPABASE_ANON_KEY/SERVICE_ROLE_KEY, AI_GATEWAY_API_KEY) and a real Supabase client. " +
    "To unpend: extract a `handleSuggestScheduleAssigneeRequest(req, deps)` from index.ts " +
    "(same pattern as nif-reveal/handler.ts and fiscal-entity-resolve/handler.ts), injecting the " +
    "Supabase client(s) and AI_GATEWAY_API_KEY via `deps`, then drive this scenario through that " +
    "function with two independent mock Supabase clients/datasets (one per org) and two distinct " +
    "caller identities.",
  ignore: true,
  fn: () => {
    // Intentionally left unimplemented — see the `name` above for the full
    // scenario this test would cover once handler.ts exists.
  },
});
