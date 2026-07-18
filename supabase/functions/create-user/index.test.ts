/**
 * create-user — regression test for the cross-org membership scope check.
 *
 * ── The bug this guards against ─────────────────────────────────────────
 * `index.ts` lets a non-`system_admin` caller (a `super_admin`/`org_admin`)
 * create a new user with arbitrary `memberships[].organization_id` values.
 * Before the fix, an org_admin of Organization A could send a request body
 * containing `memberships: [{ organization_id: <ORG_B_ID>, role_id: ... }]`
 * and the function would happily create the user with a membership in
 * Organization B — an org the caller has no administrative rights over.
 *
 * The fix (see index.ts, "Scope check" comment above the
 * `organization_out_of_scope` branch) rejects the request with 403 unless
 * every `organization_id` requested in `memberships`/`membership` is also
 * present in `caller.orgIds` (the set of orgs the caller has an active
 * membership in), UNLESS the caller holds the `system_admin` role, which is
 * intentionally exempt (system_admin is expected to manage all orgs).
 *
 * ── The regression scenario this test documents ─────────────────────────
 * 1. Organization A exists, with `org_admin` User A1 as an active member.
 * 2. Organization B exists, with its own users, entirely unrelated to A1.
 * 3. User A1 authenticates and calls create-user with:
 *      { email, password, name, memberships: [{ organization_id: ORG_B, role_id }] }
 *    i.e. requesting a membership in Org B, an org A1 does not administer.
 * 4. Expected (post-fix) result: HTTP 403,
 *      { error: "organization_out_of_scope", message: "..." }
 *    and — critically — no row is written to auth.users, anew_users, or
 *    anew_memberships for Org B. The new user must never come into
 *    existence as a side effect of a rejected cross-org request.
 * 5. Control case: User A1 calls create-user with
 *      { memberships: [{ organization_id: ORG_A, role_id }] }
 *    (a membership scoped to their own org). Expected: 200, user created,
 *    with exactly one anew_memberships row, scoped to ORG_A only.
 * 6. Control case: a `system_admin` caller (any org) requests a membership
 *    in ORG_B. Expected: 200 — system_admin is exempt from the org-scope
 *    check by design.
 *
 * ── Why this test is `Deno.test.ignore` instead of a running test ───────
 * Every other testable Edge Function in this repo (nif-reveal,
 * fiscal-entity-resolve, update-lead's pure helpers, nif-write-proxy,
 * nif-backfill) follows an "extract logic, inject dependencies" pattern:
 * the request-handling logic lives in a standalone `handler.ts` exporting a
 * function that takes an explicit `deps` object (mock-able Supabase client,
 * mock-able crypto/key providers, etc.), and `index.ts` is reduced to a thin
 * `Deno.serve(...)` wrapper that constructs the real deps and calls the
 * handler. That separation is what lets `index.test.ts` import the handler
 * directly and drive it with in-memory fakes, with no real network/DB and
 * no `Deno.serve` ever starting.
 *
 * `create-user/index.ts` has NOT been refactored to that pattern yet: all
 * of the logic above (auth check, admin/role resolution, the org-scope
 * check itself, address/fiscal/email/phone normalization, the two-step
 * auth-user + RPC finalize writes) lives directly inside a single
 * `Deno.serve(async (req) => { ... })` callback in index.ts, with no
 * exported, dependency-injectable entry point to import from a test file.
 *
 * Per this task's explicit instructions, that refactor is OUT OF SCOPE for
 * this change — extracting a handler.ts here would itself be a behavior-
 * risking edit to security-sensitive code, and should go through its own
 * reviewed, test-first change rather than being smuggled in as a side
 * effect of "just adding a test".
 *
 * ── What would make this test runnable (for whoever picks this up) ─────
 * 1. Extract `supabase/functions/create-user/handler.ts` exporting e.g.
 *      export interface CreateUserDeps {
 *        supabaseClient: SupabaseLike; // whatever minimal shape is used
 *        // ... any other externally-provided collaborators
 *      }
 *      export async function handleCreateUserRequest(
 *        req: Request,
 *        deps: CreateUserDeps,
 *      ): Promise<Response> { ... }
 *    moving the current Deno.serve body into that function, with
 *    `supabaseClient` (and anything else that talks to Supabase/network)
 *    passed in via `deps` instead of constructed inline.
 * 2. Reduce `index.ts` to:
 *      Deno.serve((req) => handleCreateUserRequest(req, { supabaseClient }));
 * 3. In this test file, replace the `Deno.test.ignore` calls below with
 *    real `Deno.test(...)` calls that:
 *      - build a mock `supabaseClient` whose `.auth.getUser()` resolves to
 *        User A1, whose `anew_memberships`/`anew_roles` queries resolve
 *        A1's org_admin role scoped to Org A only, and whose
 *        `.auth.admin.createUser()` / `rpc("rpc_finalize_user_profile_full")`
 *        calls are spies that record whether they were invoked;
 *      - call `handleCreateUserRequest(req, { supabaseClient: mock })` with
 *        a JSON body requesting a membership in Org B;
 *      - assert the response status is 403 with
 *        `error === "organization_out_of_scope"`;
 *      - assert the `createUser`/`rpc_finalize_user_profile_full` spies were
 *        NEVER called (no auth user, no anew_users/anew_memberships row was
 *        created as a side effect of the rejected request);
 *      - add the Org A control case (200, exactly one membership row
 *        scoped to Org A) and the system_admin exemption control case (200,
 *        cross-org membership allowed) described above.
 */

Deno.test.ignore(
  "create-user — org_admin cannot create a user with a membership in an org they do not administer (403 organization_out_of_scope, no rows written)",
  () => {
    // Intentionally left unimplemented — see file header for the exact
    // scenario and the handler.ts extraction required to make this runnable.
  },
);

Deno.test.ignore(
  "create-user — org_admin CAN create a user scoped to their own organization (200, single membership row for that org)",
  () => {
    // Control case — see file header.
  },
);

Deno.test.ignore(
  "create-user — system_admin is exempt from the org-scope check and MAY create cross-org memberships (200)",
  () => {
    // Control case — see file header.
  },
);

/**
 * ── Granular `users.create` permission authorization path ───────────────
 *
 * Added alongside the fix that stopped `index.ts` from gating user creation
 * behind ONLY the hardcoded `["system_admin", "super_admin", "org_admin"]`
 * role-code allowlist (see `isAdmin`/`callerHasCreateUserPermission` in
 * index.ts). A caller whose role is none of those three codes, but whose
 * role has been explicitly granted the `users.create` permission via
 * `anew_role_permissions` (checked server-side through the same
 * `has_anew_permission(_auth_uid, _permission_code)` RPC used by
 * execute-workflow and other Edge Functions), is now also authorized.
 *
 * Critically, this new path does NOT bypass the organization scope check:
 * that check gates on `caller.roleCodes.includes("system_admin")` and
 * `caller.orgIds`, neither of which depends on which authorization path
 * (role-code vs. granular permission) let the caller through. So a
 * `users.create`-permitted caller is scoped exactly like an org_admin —
 * limited to `caller.orgIds` — never wider.
 *
 * These are left as `Deno.test.ignore` for the same reason as the three
 * cases above: `create-user/index.ts` has not been refactored to the
 * injectable `handler.ts` pattern yet, so there is no dependency-injectable
 * entry point to drive with mocks. See the file header's "What would make
 * this test runnable" section — the same `handler.ts` extraction unblocks
 * these two cases as well, plus a mocked `has_anew_permission` RPC response.
 */

Deno.test.ignore(
  "create-user — a caller with only a custom role (no admin role-code) that has been granted `users.create` CAN create a user scoped to an org they belong to (200)",
  () => {
    // Scenario: caller's only active membership is a custom role (e.g.
    // `testescope_base_role`) in Org A, and that role has been granted the
    // `users.create` permission via anew_role_permissions. Requested
    // membership is scoped to Org A (== caller.orgIds). Mock
    // `has_anew_permission` to return true for this caller + "users.create".
    // Expected: 200, user created with a single membership row in Org A.
  },
);

Deno.test.ignore(
  "create-user — a `users.create`-permitted caller is still rejected (403 organization_out_of_scope) when requesting a membership outside their own orgs",
  () => {
    // Same caller/permission setup as above, but the request's
    // memberships[].organization_id targets Org B, which is NOT in
    // caller.orgIds. Expected: 403 organization_out_of_scope, and no rows
    // written to auth.users/anew_users/anew_memberships — proving the
    // granular-permission path never grants broader scope than org_admin
    // already has.
  },
);
