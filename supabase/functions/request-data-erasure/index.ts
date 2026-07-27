import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCallerIdentity, authErrorResponse, AuthError } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { z } from "npm:zod";
import { initSentry, captureError } from "../_shared/sentry.ts";

initSentry();

// RGPD Art. 17 — right to erasure. Step 1 of 2 (request only; no data is ever
// touched here). A pending row is filed in data_erasure_requests and every
// active super_admin for the entity's org (plus every system_admin) is
// notified. Execution only ever happens later, inside decide-data-erasure,
// and only after explicit approval.

const requestSchema = z.object({
  entity_id: z.string().uuid(),
  reason: z.string().min(10),
});

type SupabaseClientLike = any;

// anew_entity_org_links is populated for leads (via create_lead_entity_for_org
// / link_entity_to_org) but NOT for clients created through the client-creation
// path, which stamps organization_id directly onto anew_clients instead. Try
// the link table first (it can carry a more specific link than a client's own
// row), then fall back to whichever of anew_clients/anew_contacts/anew_leads
// actually has this entity_id.
async function resolveEntityOrganizationId(
  supabase: SupabaseClientLike,
  entityId: string
): Promise<string | null> {
  const { data: orgLink, error: orgLinkError } = await supabase
    .from("anew_entity_org_links")
    .select("organization_id, is_primary")
    .eq("entity_id", entityId)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (orgLinkError) {
    console.error("[request-data-erasure] org link lookup error:", orgLinkError);
    throw new Error("Failed to resolve entity organization");
  }

  if (orgLink) {
    return orgLink.organization_id as string;
  }

  for (const table of ["anew_clients", "anew_contacts", "anew_leads"]) {
    const { data: row, error } = await supabase
      .from(table)
      .select("organization_id")
      .eq("entity_id", entityId)
      .maybeSingle();

    if (error) {
      console.error(`[request-data-erasure] ${table} org lookup error:`, error);
      continue;
    }

    if (row?.organization_id) {
      return row.organization_id as string;
    }
  }

  return null;
}

serve(async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let caller;
  try {
    caller = await resolveCallerIdentity(req, supabase);
  } catch (e) {
    return authErrorResponse(e, corsHeaders);
  }

  if (caller.isServiceRole) {
    return new Response(
      JSON.stringify({ error: "User JWT required to request data erasure" }),
      { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid request", details: parsed.error.issues }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  const { entity_id, reason } = parsed.data;

  try {
    // ── 1. Visibility check — reuses the same predicate the RLS layer trusts ──
    const { data: canSee, error: visError } = await supabase.rpc("can_see_entity", {
      p_entity_id: entity_id,
      p_auth_uid: caller.authUid,
    });

    if (visError) {
      console.error("[request-data-erasure] can_see_entity error:", visError);
      throw new Error("Failed to verify entity visibility");
    }

    if (!canSee) {
      throw new AuthError("Entity not found or not visible to caller", 404);
    }

    // ── 2. Load the entity + its primary org (org_id resolved server-side) ──
    const { data: entity, error: entityError } = await supabase
      .from("anew_entities")
      .select("id, type, display_name, status")
      .eq("id", entity_id)
      .maybeSingle();

    if (entityError) {
      console.error("[request-data-erasure] entity lookup error:", entityError);
      throw new Error("Failed to look up entity");
    }

    if (!entity) {
      return new Response(
        JSON.stringify({ error: "Entity not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const organizationId = await resolveEntityOrganizationId(supabase, entity_id);

    if (!organizationId) {
      throw new AuthError("Entity has no organization link — cannot file erasure request", 409);
    }

    // ── 3. Insert pending request ──────────────────────────────────────────
    const { data: logEntry, error: insertError } = await supabase
      .from("data_erasure_requests")
      .insert({
        entity_id,
        entity_snapshot: {
          type: entity.type,
          display_name: entity.display_name,
          status: entity.status,
        },
        organization_id: organizationId,
        requested_by: caller.anewUserId,
        reason,
        status: "pending",
        requested_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[request-data-erasure] insert error:", insertError);
      if (insertError.code === "23505") {
        return new Response(
          JSON.stringify({ error: "There is already an open erasure request for this entity" }),
          { status: 409, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      throw new Error("Failed to create data erasure request");
    }

    const requestId: string = logEntry.id;

    // ── 4. Notify org super_admins + system_admins (best-effort, non-fatal) ──
    let adminUsers: Array<{ id: string; email: string; name: string }> = [];

    const { data: roleRows } = await supabase
      .from("anew_roles")
      .select("id")
      .eq("code", "super_admin");

    const roleIds = (roleRows || []).map((r: { id: string }) => r.id);

    if (roleIds.length > 0) {
      const { data: memberships } = await supabase
        .from("anew_memberships")
        .select("user_id")
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .in("role_id", roleIds);

      const userIds = (memberships || []).map((m: { user_id: string }) => m.user_id);

      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from("anew_users")
          .select("id, email, name")
          .in("id", userIds)
          .eq("status", "active");

        adminUsers = (users || []) as Array<{ id: string; email: string; name: string }>;
      }
    }

    const { data: callerUser } = await supabase
      .from("anew_users")
      .select("name")
      .eq("id", caller.anewUserId)
      .maybeSingle();

    const callerName = callerUser?.name ?? "Um utilizador interno";

    const emailPromises = adminUsers.map(async (admin) => {
      const html = buildNotificationEmailHtml({
        requestId,
        entityName: entity.display_name,
        reason,
        callerName,
        adminName: admin.name,
      });

      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            to: admin.email,
            subject: `[Olyvia] Pedido de Eliminação de Dados (RGPD Art. 17)`,
            html,
            user_id: admin.id,
            organization_id: organizationId,
          }),
        });
        const result = await resp.json();
        if (result.error) {
          console.error("[request-data-erasure] email failed for", admin.email, result.error);
        }
      } catch (emailErr) {
        console.error("[request-data-erasure] email dispatch error:", emailErr);
      }
    });

    await Promise.all(emailPromises);

    return new Response(
      JSON.stringify({ request_id: requestId, status: "pending" }),
      { status: 201, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return authErrorResponse(err, corsHeaders);
    }
    console.error("[request-data-erasure] unexpected error:", err);
    await captureError(err, { function: "request-data-erasure" });
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});

interface NotificationEmailParams {
  requestId: string;
  entityName: string;
  reason: string;
  callerName: string;
  adminName: string;
}

function buildNotificationEmailHtml(p: NotificationEmailParams): string {
  return `
<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8"><title>Pedido de Eliminação de Dados</title></head>
<body style="font-family: sans-serif; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #dc2626;">Pedido de Eliminação de Dados (RGPD Art. 17)</h2>
  <p>Caro(a) ${escapeHtml(p.adminName)},</p>
  <p>
    <strong>${escapeHtml(p.callerName)}</strong> submeteu um pedido de eliminação/anonimização
    de dados para o titular <strong>${escapeHtml(p.entityName)}</strong>.
  </p>
  <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
    <tr>
      <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">ID do Pedido</td>
      <td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(p.requestId)}</td>
    </tr>
    <tr>
      <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Motivo</td>
      <td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(p.reason)}</td>
    </tr>
  </table>
  <p>Este pedido requer aprovação explícita de um administrador antes de qualquer eliminação ou anonimização ser executada. Use o painel Olyvia para aprovar ou rejeitar.</p>
  <p style="font-size: 12px; color: #6b7280;">
    Esta é uma notificação de segurança automática. Não reencaminhe este email.
    ID do Pedido: ${escapeHtml(p.requestId)}
  </p>
</body>
</html>`.trim();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
