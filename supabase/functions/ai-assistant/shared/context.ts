// buildExecCtx — does NOT consume the request body.
// Body is parsed exactly once in index.ts and organizationId is passed in.
// Logic moved verbatim from index.ts (Fase 0A.1 + 0A scope check).

import { createClient } from "npm:@supabase/supabase-js@2.45.0";
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
  // Auditoria Administração F6: get_user_context junta as permissões de TODAS as associações (de qualquer
  // organização, incluindo papéis de cliente). As tools agem na organização ativa, por isso as permissões são as que
  // has_anew_permission_in_org_or_ancestor confirma NESSA organização (fn_ai_permissoes_na_org, migração
  // 20270112410000). Falha fechado.
  const { data: orgPermissions, error: permErr } = await supabase.rpc("fn_ai_permissoes_na_org", {
    _auth_uid: caller.authUid,
    _organization_id: organizationId,
  });
  if (permErr || !Array.isArray(orgPermissions)) {
    console.error("AI assistant: fn_ai_permissoes_na_org failed", permErr);
    return { ok: false, status: 500, body: { error: "failed to resolve user permissions" } };
  }
  const permissions: string[] = orgPermissions as string[];
  // is_system_admin from get_user_context() is already the canonical, correctly
  // scoped global-admin flag (system_admin only) — do not re-widen it to include
  // super_admin, which is a tenant-scoped role and must not bypass permission checks.
  const isSystemAdmin: boolean = uctx.is_system_admin === true;
  const businessUserId: string = uctx.business_user_id || caller.anewUserId;

  // Cliente com o JWT do chamador: as verificações de âmbito (shared/scope.ts) usam a RLS e as funções de âmbito
  // (crm_scope_keys, can_access_contact_row, ...) tal como o ecrã. Só leitura; o trabalho continua com a service_role.
  const authHeader = req.headers.get("Authorization") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const userSupabase = authHeader && supabaseUrl && anonKey
    ? createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    : undefined;

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
    authHeader,
    userSupabase,
  };

  return { ok: true, ctx };
}
