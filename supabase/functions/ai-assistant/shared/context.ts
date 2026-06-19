// buildExecCtx — does NOT consume the request body.
// Body is parsed exactly once in index.ts and organizationId is passed in.
// Logic moved verbatim from index.ts (Fase 0A.1 + 0A scope check).

import { resolveCallerIdentity, AuthError } from "../../_shared/auth.ts";
import type { ExecCtx, Membership } from "./types.ts";

export type BuildCtxResult =
  | { ok: true; ctx: ExecCtx }
  | { ok: false; status: number; body: { error: string } };

export async function buildExecCtx(args: {
  req: Request;
  supabase: any;
  organizationId: string | null;
}): Promise<BuildCtxResult> {
  const { req, supabase, organizationId } = args;

  let caller;
  try {
    caller = await resolveCallerIdentity(req, supabase);
  } catch (e) {
    if (e instanceof AuthError) {
      return { ok: false, status: e.status, body: { error: e.message } };
    }
    throw e;
  }

  if (caller.isServiceRole) {
    return {
      ok: false,
      status: 403,
      body: { error: "service role not allowed on user-facing endpoint" },
    };
  }

  if (!organizationId) {
    return { ok: false, status: 400, body: { error: "organizationId is required" } };
  }

  // Scope check — RPC required by Fase 0A guardrail; no validateOrgScope fallback.
  const { data: visibleOrgIds, error: visErr } = await supabase.rpc("get_user_visible_org_ids", {
    _auth_uid: caller.authUid,
  });
  if (visErr || !Array.isArray(visibleOrgIds) || !visibleOrgIds.includes(organizationId)) {
    return { ok: false, status: 403, body: { error: "organization not in user scope" } };
  }

  // Canonical user context — drives permissions, memberships, isSystemAdmin.
  const { data: userContext, error: uctxErr } = await supabase.rpc("get_user_context", {
    _auth_user_id: caller.authUid,
  });
  if (uctxErr || !userContext || !Array.isArray((userContext as any).permissions)) {
    console.error("AI assistant: get_user_context failed", uctxErr);
    return { ok: false, status: 500, body: { error: "failed to resolve user context" } };
  }

  const uctx = userContext as any;
  const memberships: Membership[] = Array.isArray(uctx.memberships) ? uctx.memberships : [];
  const permissions: string[] = uctx.permissions;
  const isSystemAdmin: boolean =
    uctx.is_system_admin === true ||
    memberships.some((m) => m.role_code === "system_admin" || m.role_code === "super_admin");
  const businessUserId: string = uctx.business_user_id || caller.anewUserId;

  const ctx: ExecCtx = {
    supabase,
    authUid: caller.authUid,
    businessUserId,
    organizationId,
    visibleOrgIds,
    userContext: uctx,
    permissions,
    memberships,
    isSystemAdmin,
    authHeader: req.headers.get("Authorization") || "",
  };

  return { ok: true, ctx };
}
