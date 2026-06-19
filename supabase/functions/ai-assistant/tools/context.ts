// Fase 4 — get_current_context
// Retorna utilizador, organização, membership activa, now/today (UTC).

import type { Handler, ToolDef, ToolResult } from "../shared/types.ts";

export const getCurrentContextDef: ToolDef = {
  type: "function",
  function: {
    name: "get_current_context",
    description:
      "Devolve o contexto actual: utilizador (anew_users.id), organização e membership activa, além de now/today (UTC).",
    parameters: { type: "object", properties: {} },
  },
};

const get_current_context: Handler = async (ctx): Promise<ToolResult> => {
  const supabase = ctx.supabase;

  if (!ctx.businessUserId || !ctx.organizationId) {
    return { success: false, message: "contexto incompleto" };
  }

  const [{ data: user }, { data: org }, { data: membership }] = await Promise.all([
    supabase
      .from("anew_users")
      .select("id, name")
      .eq("id", ctx.businessUserId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("anew_organizations")
      .select("id, name")
      .eq("id", ctx.organizationId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("anew_memberships")
      .select("status, role_id")
      .eq("user_id", ctx.businessUserId)
      .eq("organization_id", ctx.organizationId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
  ]);

  if (!user || !org) {
    return { success: false, message: "contexto incompleto" };
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  return {
    success: true,
    data: {
      user: { id: user.id, name: user.name },
      organization: { id: org.id, name: org.name },
      membership: membership ? { status: membership.status, role_id: membership.role_id } : null,
      now: now.toISOString(),
      today,
    },
  };
};

export const handlers: Record<string, Handler> = {
  get_current_context,
};
