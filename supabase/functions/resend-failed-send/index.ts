import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";
import { getServiceRoleKey } from "../_shared/auth.ts";
import { getCorsHeadersExtended } from "../_shared/cors.ts";
import { sendSmsNow } from "../_shared/sendSms.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";

initSentry();

/**
 * Resend Failed Send API (Regra 11)
 *
 * AUTHENTICATED endpoint — real user JWT required. Reuses the exact
 * subject/body stored on the failed email_logs/sms_logs row (no
 * editing before resend, by explicit decision) and inserts a fresh log
 * row with the new attempt's outcome, leaving the original failed row
 * untouched as history.
 *
 * Destinatário: o contacto principal ATUAL da ficha ligada ao registo, mas
 * só quando o destino guardado era comprovadamente dessa ficha (é um dos
 * emails/telefones dela). O entity_id dos logs nem sempre é o destinatário
 * (há emails a comerciais e SMS a técnicos ligados à ficha/lead do cliente);
 * nesses casos, e sem ficha, vai para o destino original.
 *
 * POST /resend-failed-send
 * Body: { type: 'email' | 'sms', log_id: string }
 * Returns: { success: true } | { error: string }
 */
// Ordem da regra de contactos: principal primeiro, depois o mais recente.
const CONTACT_ORDER = [
  ["is_primary", { ascending: false, nullsFirst: false }],
  ["created_at", { ascending: false }],
  ["id", { ascending: false }],
] as const;

/**
 * Email atual da ficha, se o email guardado for um dos dela; senão null.
 */
async function currentEmailForEntity(supabase: any, entityId: string | null, organizationId: string | null, storedEmail: string | null): Promise<string | null> {
  if (!entityId || !storedEmail) return null;
  const loadEmails = async (eId: string) => {
    let q = supabase.from("anew_entity_emails").select("email").eq("entity_id", eId);
    for (const [col, opts] of CONTACT_ORDER) q = q.order(col, opts);
    return await q;
  };
  let { data, error } = await loadEmails(entityId);
  // email_logs não tem entity_type: há registos cujo entity_id é o id de uma
  // lead. Sem emails nessa "ficha", tenta-se a ficha da lead (como no SMS).
  if (!error && !data?.length) {
    let lq = supabase.from("anew_leads").select("entity_id").eq("id", entityId);
    if (organizationId) lq = lq.eq("organization_id", organizationId);
    const { data: lead } = await lq.maybeSingle();
    if (lead?.entity_id) ({ data, error } = await loadEmails(lead.entity_id));
  }
  if (error || !data?.length) return null;
  const stored = storedEmail.trim().toLowerCase();
  const belongs = data.some((r: any) => (r.email || "").trim().toLowerCase() === stored);
  if (!belongs) return null;
  const current = (data[0].email || "").trim();
  return current || null;
}

// Só dígitos, últimos 9 (número nacional), para comparar "+351 912…" com "912…".
function phoneKey(raw: string | null | undefined): string {
  const digits = (raw || "").replace(/[^0-9]/g, "");
  return digits.slice(-9);
}

/**
 * Telefone atual da ficha da lead (sms_logs.entity_type = 'leads'), se o
 * telefone guardado for um dos dela; senão null.
 */
async function currentPhoneForLog(supabase: any, entityType: string | null, entityId: string | null, organizationId: string | null, storedPhone: string | null): Promise<string | null> {
  if (!entityId || !storedPhone) return null;
  let personEntityId: string | null = null;
  if (entityType === "leads") {
    let lq = supabase.from("anew_leads").select("entity_id").eq("id", entityId);
    if (organizationId) lq = lq.eq("organization_id", organizationId);
    const { data: lead } = await lq.maybeSingle();
    personEntityId = lead?.entity_id || null;
  }
  if (!personEntityId) return null;

  let q = supabase.from("anew_entity_phones").select("phone_number, country_code").eq("entity_id", personEntityId);
  for (const [col, opts] of CONTACT_ORDER) q = q.order(col, opts);
  const { data, error } = await q;
  if (error || !data?.length) return null;
  const storedKey = phoneKey(storedPhone);
  if (!storedKey || !data.some((r: any) => phoneKey(r.phone_number) === storedKey)) return null;

  const top = data[0];
  const num = (top.phone_number || "").replace(/\s+/g, "").replace(/^0+/, "");
  if (!num) return null;
  return num.startsWith("+") ? num : `${top.country_code || "+351"}${num}`;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeadersExtended(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceClient = createClient(supabaseUrl, getServiceRoleKey());

    // Resolve the caller's identity from their own token (never trust a
    // client-sent user id).
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await serviceClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: anewUser } = await serviceClient
      .from("anew_users")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (!anewUser) {
      return new Response(JSON.stringify({ error: "User profile not found" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { type, log_id } = await req.json();
    if (type !== "email" && type !== "sms") {
      return new Response(JSON.stringify({ error: "type must be 'email' or 'sms'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!log_id || typeof log_id !== "string") {
      return new Response(JSON.stringify({ error: "log_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (type === "email") {
      const { data: logRow } = await serviceClient
        .from("email_logs")
        .select("organization_id, user_id, entity_id, to_email, subject, body_html, smtp_id")
        .eq("id", log_id)
        .eq("status", "failed")
        .maybeSingle();

      if (!logRow) {
        return new Response(JSON.stringify({ error: "Registo não encontrado ou já não está falhado." }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Scope check: the caller must actually belong to the log's organization
      // — mirrors send-email's own membership check, done here up front since
      // this function calls send-email with service-role auth afterwards.
      if (logRow.organization_id) {
        const { data: membership } = await serviceClient
          .from("anew_memberships")
          .select("id")
          .eq("user_id", anewUser.id)
          .eq("organization_id", logRow.organization_id)
          .eq("status", "active")
          .maybeSingle();
        if (!membership) {
          return new Response(JSON.stringify({ error: "Sem permissão para reenviar este email." }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const toEmail = (await currentEmailForEntity(serviceClient, logRow.entity_id, logRow.organization_id, logRow.to_email)) || logRow.to_email;

      const sendResponse = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getServiceRoleKey()}` },
        body: JSON.stringify({
          organization_id: logRow.organization_id,
          user_id: logRow.user_id,
          entity_id: logRow.entity_id,
          smtp_id: logRow.smtp_id,
          to: toEmail,
          subject: logRow.subject,
          html: logRow.body_html,
        }),
      });
      const sendResult = await sendResponse.json();
      if (!sendResponse.ok || sendResult.error) {
        return new Response(JSON.stringify({ error: sendResult.error || `HTTP ${sendResponse.status}` }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // type === "sms"
    const { data: logRow } = await serviceClient
      .from("sms_logs")
      .select("organization_id, created_by, entity_type, entity_id, to_phone, message")
      .eq("id", log_id)
      .eq("status", "failed")
      .maybeSingle();

    if (!logRow) {
      return new Response(JSON.stringify({ error: "Registo não encontrado ou já não está falhado." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (logRow.organization_id) {
      const { data: membership } = await serviceClient
        .from("anew_memberships")
        .select("id")
        .eq("user_id", anewUser.id)
        .eq("organization_id", logRow.organization_id)
        .eq("status", "active")
        .maybeSingle();
      if (!membership) {
        return new Response(JSON.stringify({ error: "Sem permissão para reenviar este SMS." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const toPhone = (await currentPhoneForLog(
      serviceClient, logRow.entity_type, logRow.entity_id, logRow.organization_id, logRow.to_phone,
    )) || logRow.to_phone;

    const smsResult = await sendSmsNow({ toPhone, message: logRow.message });
    await serviceClient.from("sms_logs").insert({
      organization_id: logRow.organization_id,
      created_by: logRow.created_by,
      entity_type: logRow.entity_type,
      entity_id: logRow.entity_id,
      to_phone: toPhone,
      message: logRow.message,
      status: smsResult.ok ? "sent" : "failed",
      error_message: smsResult.ok ? null : smsResult.error,
      sent_at: smsResult.ok ? new Date().toISOString() : null,
    });

    if (!smsResult.ok) {
      return new Response(JSON.stringify({ error: smsResult.error }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in resend-failed-send:", error);
    await captureError(error, { function: "resend-failed-send" });
    return new Response(JSON.stringify({ error: "Erro interno." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
