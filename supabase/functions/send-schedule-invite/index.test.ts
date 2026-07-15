/**
 * send-schedule-invite — cross-org isolation regression test (PENDING).
 *
 * BUG THAT WAS FIXED THIS SESSION (index.ts):
 *   For invitee.type in {"company", "business_unit", "business_area"},
 *   `invitee.id` is an *organization id* chosen client-side (e.g. from a
 *   dropdown). Before the fix, this id was never re-validated to be within
 *   the caller's own scope: the handler resolved and notified/emailed every
 *   member of whatever organization id was supplied, using a residual
 *   service-role client (`supabaseAdmin`) to look up those members via
 *   `supabase.auth.admin.getUserById`. A caller from Org A could therefore
 *   invite invitee.id = <Org B's id> and cause the function to email/notify
 *   Org B members about an Org A schedule item — a cross-org data leak.
 *
 *   The fix added, right before `getUsersFromEntity` is called:
 *
 *     if (invitee.type === "company" || invitee.type === "business_unit" || invitee.type === "business_area") {
 *       const inviteeOrgInScope = await validateOrgScope(supabaseClient, caller, invitee.id);
 *       if (!inviteeOrgInScope) {
 *         results.push({ invitee_id: invitee.id, status: "error", error: "Organization out of scope" });
 *         continue;
 *       }
 *     }
 *
 * WHAT THIS TEST WOULD PROVE (once runnable — see "BLOCKED" below):
 *
 *   Scenario — 2 orgs, 2 users, isolation must hold:
 *     - Org A ("org-a") has caller-user "user-a", who is the creator of
 *       schedule_item "item-1" (belongs to org-a).
 *     - Org B ("org-b") has member-user "user-b", who has NO membership,
 *       role, or relationship with org-a.
 *     - user-a calls send-schedule-invite for "item-1" with
 *       organization_id="org-a" and invitees=[{ type: "company", id: "org-b" }].
 *     - Expected (post-fix) behavior:
 *         1. validateOrgScope(supabaseClient, callerA, "org-b") resolves to
 *            false, because get_user_visible_org_ids(user-a) does not
 *            include "org-b".
 *         2. The handler pushes
 *            { invitee_id: "org-b", status: "error", error: "Organization out of scope" }
 *            to `results` and `continue`s — it must NOT reach
 *            `getUsersFromEntity(supabaseAdmin, "company", "org-b")`.
 *         3. No row is inserted into `notifications` for user-b.
 *         4. No email is sent to user-b (sendEmailViaSMTP is never invoked
 *            with user-b's address).
 *     - Control case (must still work): the same call with
 *       invitees=[{ type: "company", id: "org-a" }] (in-scope org) succeeds,
 *       resolves org-a's members via getUsersFromEntity, and DOES create
 *       notifications/emails for user-a's own org.
 *
 * BLOCKED — cannot be executed against this file as currently structured:
 *
 *   Unlike nif-reveal/handler.ts, fiscal-entity-resolve/handler.ts and
 *   nif-write-proxy/handler.ts, send-schedule-invite/index.ts has NOT been
 *   refactored to the "extract handler, inject dependencies" pattern:
 *     - The request-handling logic lives in a local `const handler = async
 *       (req) => {...}` that is NEVER exported from index.ts.
 *     - Both Supabase clients (`supabaseClient`, the anon/RLS-scoped client,
 *       and `supabaseAdmin`, the service-role client used only for
 *       `auth.admin.getUserById`) are constructed inline via `createClient(...)`
 *       reading `Deno.env.get(...)` directly, with no injection seam.
 *     - The file ends with `serve(handler)` (Deno std http server), a
 *       top-level side effect that binds a listener as soon as the module is
 *       imported.
 *
 *   Importing index.ts from a test would therefore either fail to resolve
 *   `handler` at all (it is not exported) or, if it were exported, would
 *   start a real HTTP listener and require live `SUPABASE_URL` /
 *   `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` credentials — exactly
 *   what the handler.ts pattern in this repo exists to avoid.
 *
 *   TO MAKE THIS TEST RUNNABLE (out of scope for this task — refactor only,
 *   no behavior change):
 *     1. Extract the body of `const handler = async (req) => {...}` into a
 *        new `send-schedule-invite/handler.ts`, exporting an async function
 *        e.g. `handleSendScheduleInviteRequest(req, deps)` where `deps` is a
 *        `SendScheduleInviteDeps` interface holding:
 *          - `supabaseClient: any`  (caller-scoped client; used for identity,
 *            validateOrgScope, schedule_items/schedule_invitations/
 *            notifications reads/writes, resolveSmtpForAuthenticatedUser)
 *          - `supabaseAdmin: any`   (service-role client; used only inside
 *            getUsersFromEntity for auth.admin.getUserById)
 *          - optionally `sendEmail` as an injectable function wrapping
 *            sendEmailViaSMTP, so email dispatch can be asserted without a
 *            real SMTP server.
 *     2. Keep `index.ts` as thin Deno.serve wiring that builds the two real
 *        clients from env vars and calls `handleSendScheduleInviteRequest`,
 *        mirroring nif-reveal/index.ts.
 *     3. Once handler.ts exists, replace the `Deno.test(..., { ignore: true })`
 *        entries below with real assertions using a mock `supabaseClient`
 *        (whose `rpc("get_user_visible_org_ids", ...)` returns only
 *        `["org-a"]` for user-a) and a mock `supabaseAdmin`, following the
 *        mock-builder style used in nif-reveal/index.test.ts.
 *
 *   Until that refactor happens, this file documents the required coverage
 *   and fails loudly (via `ignore: true` skip reporting) as a reminder in
 *   `deno test` output, rather than silently having no regression test at
 *   all for a cross-org data leak that was just fixed.
 */

import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test({
  name:
    "PENDING (needs handler.ts extraction) — invitee.type=company with an out-of-scope organization id must be rejected with 'Organization out of scope' and must never resolve/notify that org's members",
  ignore: true,
  fn() {
    // See file header for the full scenario this test would assert:
    //   1. validateOrgScope(supabaseClient, callerFromOrgA, "org-b") === false
    //   2. results contains { invitee_id: "org-b", status: "error", error: "Organization out of scope" }
    //   3. getUsersFromEntity(supabaseAdmin, "company", "org-b") is never called
    //   4. no notifications row / email is produced for org-b's members
    assert(true, "placeholder — unskip once handler.ts is extracted (see file header)");
  },
});

Deno.test({
  name:
    "PENDING (needs handler.ts extraction) — invitee.type=company with the caller's own in-scope organization id still succeeds and resolves that org's members",
  ignore: true,
  fn() {
    // Control case: same request shape, but invitee.id === the caller's own
    // organization_id ("org-a"). validateOrgScope must return true and the
    // existing invite/notify/email flow for org-a's members must proceed
    // unchanged (no regression from the new scope check).
    assert(true, "placeholder — unskip once handler.ts is extracted (see file header)");
  },
});
