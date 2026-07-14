/**
 * auto-schedule — cross-org isolation regression test (PENDING, see below).
 *
 * CONTEXT
 * -------
 * This session fixed 7 "manual scoping gaps" in supabase/functions/auto-schedule/index.ts
 * where organization_id filtering had to be added/hardened on several queries
 * (schedule_resources, schedule_boards, auto_schedule_rules, campaigns,
 * get_resource_available_slots RPC, schedule_items / schedule_item_assignees
 * inserts) so that a request scoped to organization A can never read or write
 * data belonging to organization B.
 *
 * WHY THIS TEST IS `ignore: true` INSTEAD OF RUNNABLE
 * ----------------------------------------------------
 * Every other testable Edge Function in this repo (nif-reveal, nif-backfill,
 * nif-write-proxy, fiscal-entity-resolve, search-entities, update-lead) follows
 * the "extract handler.ts, inject dependencies" pattern:
 *   - index.ts only wires `Deno.serve(...)` to a handler function.
 *   - handler.ts exports the pure request-handling logic (e.g.
 *     `handleXRequest(req, deps)`), accepting an injected `deps` object
 *     (a fake/mock Supabase client, key providers, etc.) instead of calling
 *     `createClient(...)` and reading `Deno.env` directly.
 *   - Tests import handler.ts directly, so `Deno.serve` is never invoked and
 *     no real Supabase server/credentials are needed.
 *
 * supabase/functions/auto-schedule/index.ts does NOT follow this pattern yet:
 * the entire request-handling logic (auth resolution, Zod parsing, and the
 * `processScheduleRequest` / `findNearestAvailableSlot` / `findAvailableSlot`
 * helpers) lives directly inside the single `Deno.serve(async (req) => {...})`
 * callback in index.ts, with `createClient(...)` constructed inline from
 * `Deno.env.get(...)`. There is no separately exported handler function that
 * accepts an injectable `deps` argument, so this test file cannot construct a
 * mock Supabase client and drive the real request-handling code without
 * either:
 *   (a) running a live Supabase instance with real cross-org fixture data, or
 *   (b) refactoring index.ts to extract a handler.ts (out of scope for this
 *       task — the task explicitly says not to refactor auto-schedule just to
 *       make it testable).
 *
 * WHAT WOULD MAKE THIS RUNNABLE
 * -----------------------------
 * Extract a `handler.ts` from `supabase/functions/auto-schedule/index.ts`,
 * mirroring nif-reveal/handler.ts:
 *   1. Move the auth resolution (API key / JWT / internal-trusted), Zod
 *      parsing, and `processScheduleRequest` (+ its private helpers
 *      `resolveBusinessUserId`, `findNearestAvailableSlot`, `findAvailableSlot`)
 *      out of the `Deno.serve` callback into `handler.ts`.
 *   2. Export a `handleAutoScheduleRequest(req, deps)` function where `deps`
 *      contains at least: an injectable Supabase-like client (`from`, `rpc`,
 *      `auth.getUser`) and the service-role key value (for the
 *      `insert-lead`-trusted internal-call check).
 *   3. `index.ts` keeps only `Deno.serve((req) => handleAutoScheduleRequest(req, { supabaseAdmin, ... }))`.
 *   4. This file would then build two in-memory mock Supabase clients (or one
 *      client with an in-memory table keyed by organization_id), seed:
 *        - Org A: schedule_board A1, schedule_resource A-Res1 (is_active),
 *          auto_schedule_rule scoped to Org A.
 *        - Org B: schedule_board B1, schedule_resource B-Res1 (is_active),
 *          auto_schedule_rule scoped to Org B.
 *      and two callers: userA (JWT resolving organization_id = Org A) and
 *      userB (JWT resolving organization_id = Org B).
 *
 * THE REGRESSION SCENARIO THIS TEST WOULD PROVE (once runnable)
 * ---------------------------------------------------------------
 * 1. userA calls the function with `auto_assign: true` and no explicit
 *    `board_id`/`preferred_resource_ids`. Assert:
 *      - the `schedule_resources` query used to find candidate resources is
 *        filtered by `organization_id = Org A` (Org B's resource A-Res1 is
 *        never returned/considered/assigned).
 *      - the `schedule_boards` default-board lookup only returns Org A's
 *        board, never Org B's board.
 *      - the `auto_schedule_rules` lookup only matches rules where
 *        `organization_id` is null (global) or equals Org A, never a rule
 *        scoped to Org B.
 *      - the created `schedule_items` row has `organization_id = Org A`.
 * 2. Symmetrically, userB's request must never see/use Org A's resources,
 *    boards, or rules, and the created item must carry `organization_id = Org B`.
 * 3. A request with `use_proximity: true` follows the same assertions for
 *    `findNearestAvailableSlot`'s resource query (also `organization_id`-scoped).
 * 4. `campaign_id` cross-org check: if userA supplies a `campaign_id` that
 *    belongs to Org B, the campaign lookup (filtered by
 *    `organization_id = effectiveCompanyId`) must return no row, and the
 *    request must fail with "Scheduling is not enabled for this campaign"
 *    (or an analogous not-found outcome) — Org A must never read Org B's
 *    campaign flags.
 * 5. GET `?action=nearest_resources` and the default GET (available slots)
 *    paths: assert the `schedule_resources` / ownership check queries are
 *    filtered by `organization_id = companyId`, so userA can never fetch
 *    slots for a `resource_id` owned by Org B (expect 404 "Resource not
 *    found", not data leakage).
 *
 * Until the handler.ts extraction happens, this test is registered with
 * `ignore: true` so it shows up (skipped) in `deno test` output as a visible
 * reminder of the missing regression coverage, instead of being silently
 * absent from the suite.
 */

import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test({
  name:
    "auto-schedule: organization A cannot read or write organization B's resources/boards/rules/items (PENDING — requires handler.ts extraction, see file header)",
  ignore: true,
  fn() {
    // Intentionally left unimplemented. See the file-level comment above for:
    //   - why this cannot be driven against the current index.ts as-is,
    //   - the exact refactor (handler.ts extraction) that would unblock it,
    //   - the full two-organization / two-user scenario this test would assert.
    assert(true);
  },
});
