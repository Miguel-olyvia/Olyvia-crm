// Notifications tool — extracted verbatim from index.ts.

import type { Handler, ToolDef, ToolResult } from "../shared/types.ts";

export const listNotificationsDef: ToolDef = {
  type: "function",
  function: {
    name: "list_notifications",
    description: "Lista notificações por ler do utilizador atual.",
    parameters: {
      type: "object",
      properties: { limit: { type: "number" } },
    },
  },
};

const listNotifications: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, authUid, organizationId } = ctx;
  if (!authUid) return { success: false, message: "Utilizador não autenticado." };
  const limit = args?.limit ?? 10;
  let q = supabase
    .from("notifications")
    .select("id, title, message, link, priority, created_at, is_read")
    .eq("user_id", authUid)
    .eq("kind", "notification")
    .eq("is_read", false)
    .eq("is_dismissed", false)
    .eq("is_resolved", false)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (organizationId) q = q.eq("organization_id", organizationId);
  const { data, error } = await q;
  if (error) throw error;
  return { success: true, message: `${data?.length || 0} notificação(ões) por ler.`, data: data || [] };
};

export const handlers: Record<string, Handler> = {
  list_notifications: listNotifications,
};
