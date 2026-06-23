import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { requireServiceRole } from "../_shared/auth.ts";
import { z } from "npm:zod";

const requestSchema = z.object({
  entity_type: z.string(),
  entity_id: z.string(),
  new_phase: z.string(),
  organization_id: z.string().optional(),
  triggered_by: z.string().optional(),
});
import { isNotificationEnabled } from "../_shared/notificationSettings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!requireServiceRole(req)) {
    return new Response(
      JSON.stringify({ error: "This endpoint is for internal use only" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request", details: parsed.error.issues }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { entity_type, entity_id, new_phase, organization_id, triggered_by } = parsed.data;
    console.log("Template trigger:", { entity_type, entity_id, new_phase, organization_id, triggered_by });

    const { data: templates } = await supabase
      .from("email_templates")
      .select("*")
      .eq("module", entity_type)
      .eq("trigger_phase", new_phase)
      .eq("is_active", true)
      .in("trigger_type", ["automatic", "semi_automatic"]);

    if (!templates || templates.length === 0) {
      return new Response(JSON.stringify({ triggered: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const entityData = await resolveEntityData(supabase, entity_type, entity_id, organization_id, triggered_by);
    const recipientEmail = entityData.client_email || entityData.lead_email || "";

    if (!recipientEmail) {
      console.log("No recipient email found, skipping template triggers");
      return new Response(JSON.stringify({ triggered: 0, reason: "no_recipient_email" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /** Helper: insert notification only if enabled */
    async function maybeNotify(type: string, payload: Record<string, any>) {
      const enabled = await isNotificationEnabled(supabase, organization_id, type);
      if (!enabled) return;
      await supabase.from("notifications").insert({
        user_id: triggered_by,
        type,
        kind: "notification",
        ...payload,
      });
    }

    let triggered = 0;

    for (const template of templates) {
      const customMap: Record<string, string> = {};
      const customs = Array.isArray(template.custom_variables) ? template.custom_variables : [];
      for (const v of customs) {
        if (v && typeof v.key === "string") customMap[v.key] = typeof v.example === "string" ? v.example : "";
      }
      const mergedData = { ...customMap, ...entityData };
      const subject = replaceVars(template.subject, mergedData);
      const body = replaceVars(template.body_html, mergedData);
      const delayHours = template.trigger_delay_hours || 0;

      if (template.trigger_type === "automatic") {
        if (delayHours > 0) {
          await supabase.from("scheduled_emails").insert({
            template_id: template.id,
            entity_type,
            entity_id,
            to_email: recipientEmail,
            subject,
            body_html: body,
            user_id: triggered_by,
            organization_id,
            scheduled_for: new Date(Date.now() + delayHours * 3600000).toISOString(),
          });
          triggered++;
        } else {
          try {
            const sendResponse = await fetch(
              `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                },
                body: JSON.stringify({
                  user_id: triggered_by,
                  organization_id,
                  to: recipientEmail,
                  subject,
                  html: body,
                }),
              }
            );
            const result = await sendResponse.json();
            if (result.error) {
              await maybeNotify("email_error", {
                title: "❌ Email automático não enviado",
                message: `Não foi possível enviar "${subject}" — ${result.error}`,
                data: { template_id: template.id, entity_type, entity_id },
              });
            } else {
              await maybeNotify("email_sent", {
                title: "✉️ Email automático enviado",
                message: `"${subject}" → ${recipientEmail}`,
                data: { template_id: template.id, entity_type, entity_id },
              });
            }
            triggered++;
          } catch (err: any) {
            console.error("Error sending automatic email:", err);
            await maybeNotify("email_error", {
              title: "❌ Email automático falhou",
              message: `Erro ao enviar "${subject}" — SMTP não configurado`,
              data: { template_id: template.id, entity_type, entity_id },
            });
          }
        }
      } else if (template.trigger_type === "semi_automatic") {
        if (delayHours > 0) {
          await supabase.from("scheduled_emails").insert({
            template_id: template.id,
            entity_type,
            entity_id,
            to_email: recipientEmail,
            subject,
            body_html: body,
            user_id: triggered_by,
            organization_id,
            scheduled_for: new Date(Date.now() + delayHours * 3600000).toISOString(),
            status: "pending",
          });
        }
        const clientName = entityData.client_name || entityData.lead_name || recipientEmail;
        await maybeNotify("email_suggestion", {
          title: `📧 Template "${template.name}" sugerido`,
          message: `Para ${clientName} — clique para enviar`,
          link: `/${entity_type}`,
          data: {
            template_id: template.id,
            entity_type,
            entity_id,
            pre_filled_subject: subject,
            pre_filled_body: body,
            recipient_email: recipientEmail,
            recipient_name: clientName,
          },
        });
        triggered++;
      }
    }

    return new Response(
      JSON.stringify({ triggered }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in trigger-email-template:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function replaceVars(text: string, data: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => data[key] || match);
}

async function resolveEntityData(
  supabase: any,
  entityType: string,
  entityId: string,
  organizationId: string,
  triggeredBy: string
): Promise<Record<string, string>> {
  const vars: Record<string, string> = {};

  if (organizationId) {
    const { data: org } = await supabase.from("anew_organizations").select("name, email, phone").eq("id", organizationId).maybeSingle();
    if (org) {
      vars.company_name = org.name || "";
      vars.company_email = org.email || "";
      vars.company_phone = org.phone || "";
    }
  }

  if (triggeredBy) {
    const { data: user } = await supabase.from("anew_users").select("display_name").eq("auth_user_id", triggeredBy).maybeSingle();
    if (user) vars.commercial_name = user.display_name || "";
    const { data: authUser } = await supabase.auth.admin.getUserById(triggeredBy);
    if (authUser?.user) vars.commercial_email = authUser.user.email || "";
  }

  async function resolveEntity(eId: string) {
    const [entityRes, emailRes, phoneRes] = await Promise.all([
      supabase.from("anew_entities").select("display_name, first_name").eq("id", eId).single(),
      supabase.from("anew_entity_emails").select("email").eq("entity_id", eId).eq("is_primary", true).maybeSingle(),
      supabase.from("anew_entity_phones").select("phone_number").eq("entity_id", eId).eq("is_primary", true).maybeSingle(),
    ]);
    return {
      name: entityRes.data?.display_name || "",
      firstName: entityRes.data?.first_name || "",
      email: emailRes.data?.email || "",
      phone: phoneRes.data?.phone_number || "",
    };
  }

  if (entityType === "leads") {
    const { data: lead } = await supabase.from("anew_leads").select("*").eq("id", entityId).single();
    if (lead) {
      if (lead.entity_id) {
        const ent = await resolveEntity(lead.entity_id);
        vars.lead_name = ent.name; vars.lead_email = ent.email; vars.lead_phone = ent.phone;
        vars.client_name = ent.name; vars.client_email = ent.email;
      } else {
        const fv = (lead.field_values || {}) as Record<string, string>;
        vars.lead_name = `${fv.first_name || fv.nome || ""} ${fv.last_name || fv.apelido || ""}`.trim();
        vars.lead_email = fv.email || ""; vars.lead_phone = fv.phone || fv.telefone || "";
        vars.client_name = vars.lead_name; vars.client_email = vars.lead_email;
      }
      vars.lead_source = lead.source || "";
    }
  } else if (entityType === "proposals") {
    const { data: p } = await supabase.from("proposals").select("*").eq("id", entityId).single();
    if (p) {
      vars.proposal_title = p.title || "";
      vars.proposal_value = p.value ? `€${Number(p.value).toLocaleString("pt-PT")}` : "";
      vars.proposal_number = p.proposal_number || p.id.slice(0, 8);
      vars.proposal_link = p.public_url || `${Deno.env.get("SUPABASE_URL")?.replace('.supabase.co', '')}/public-proposal/${p.id}`;
      vars.valid_until = p.valid_until || "";
      if (p.entity_id) {
        const ent = await resolveEntity(p.entity_id);
        vars.client_name = ent.name; vars.client_email = ent.email;
      }
    }
  } else if (entityType === "quotes") {
    const { data: q } = await supabase.from("quotes").select("*").eq("id", entityId).single();
    if (q) {
      vars.quote_number = q.quote_number || "";
      vars.quote_value = q.total ? `€${Number(q.total).toLocaleString("pt-PT")}` : "";
      vars.quote_title = `Orçamento ${q.quote_number || q.id.slice(0, 8)}`;
      const entityId2 = (q as any).entity_id || null;
      if (entityId2) {
        const ent = await resolveEntity(entityId2);
        vars.client_name = ent.name; vars.client_email = ent.email;
      } else if (q.cliente_id) {
        const { data: cl } = await supabase.from("anew_clients").select("entity_id").eq("id", q.cliente_id).maybeSingle();
        if (cl?.entity_id) {
          const ent = await resolveEntity(cl.entity_id);
          vars.client_name = ent.name; vars.client_email = ent.email;
        }
      }
    }
  } else if (entityType === "contracts") {
    const { data: c } = await supabase.from("client_contracts").select("*").eq("id", entityId).single();
    if (c) {
      vars.contract_number = c.contract_number || "";
      vars.contract_value = c.total_value ? `€${Number(c.total_value).toLocaleString("pt-PT")}` : "";
      vars.contract_start = c.start_date || ""; vars.contract_end = c.end_date || "";
      if (c.entity_id) {
        const ent = await resolveEntity(c.entity_id);
        vars.client_name = ent.name; vars.client_email = ent.email;
      }
    }
  }

  return vars;
}
