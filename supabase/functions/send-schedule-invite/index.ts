import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { resolveSmtpForAuthenticatedUser, sendEmailViaSMTP, sanitizeSmtpError } from "../_shared/smtp.ts";
import { resolveCallerIdentity, validateOrgScope, authErrorResponse } from "../_shared/auth.ts";
import { isNotificationEnabled } from "../_shared/notificationSettings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ... keep existing code (interfaces SmtpConfig, InviteRequest, getSmtpConfig, sendEmailViaSMTP, getUsersFromEntity, generateInviteEmailHtml)

interface InviteRequest {
  schedule_item_id: string;
  invitees: Array<{
    type: 'user' | 'user_group' | 'company' | 'business_unit' | 'business_area';
    id: string;
  }>;
  organization_id: string;
}

async function getUsersFromEntity(supabase: any, type: string, id: string): Promise<Array<{ id: string; email: string; full_name: string }>> {
  const users: Array<{ id: string; email: string; full_name: string }> = [];

  switch (type) {
    case 'user': {
      const { data: anewUser } = await supabase
        .from('anew_users')
        .select('id, auth_user_id, first_name, last_name')
        .eq('auth_user_id', id)
        .single();
      
      if (anewUser) {
        const { data: authUser } = await supabase.auth.admin.getUserById(anewUser.auth_user_id);
        if (authUser?.user?.email) {
          const fullName = `${anewUser.first_name || ''} ${anewUser.last_name || ''}`.trim() || 'Utilizador';
          users.push({ id: anewUser.auth_user_id, email: authUser.user.email, full_name: fullName });
        }
      }
      break;
    }
    
    case 'company': {
      const { data: memberships } = await supabase
        .from('anew_memberships')
        .select('user_id')
        .eq('organization_id', id)
        .eq('status', 'active');
      
      if (memberships) {
        for (const m of memberships) {
          const { data: anewUser } = await supabase
            .from('anew_users')
            .select('auth_user_id, first_name, last_name')
            .eq('id', m.user_id)
            .single();
          
          if (anewUser?.auth_user_id) {
            const memberUsers = await getUsersFromEntity(supabase, 'user', anewUser.auth_user_id);
            users.push(...memberUsers);
          }
        }
      }
      break;
    }
    
    case 'business_unit':
    case 'business_area': {
      const areaUsers = await getUsersFromEntity(supabase, 'company', id);
      users.push(...areaUsers);
      break;
    }
  }

  return users.filter((user, index, self) =>
    index === self.findIndex((u) => u.id === user.id)
  );
}

function generateInviteEmailHtml(
  recipientName: string,
  scheduleItem: any,
  inviterName: string,
  respondUrl: string
): string {
  const startDate = new Date(scheduleItem.start_datetime);
  const endDate = new Date(scheduleItem.end_datetime);
  
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('pt-PT', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
    .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
    .event-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea; }
    .detail-row { margin: 10px 0; }
    .label { font-weight: bold; color: #667eea; }
    .buttons { text-align: center; margin-top: 30px; }
    .btn { display: inline-block; padding: 12px 30px; margin: 5px; border-radius: 6px; text-decoration: none; font-weight: bold; }
    .btn-accept { background: #10b981; color: white; }
    .btn-decline { background: #ef4444; color: white; }
    .btn-tentative { background: #f59e0b; color: white; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📅 Convite para Agendamento</h1>
  </div>
  <div class="content">
    <p>Olá <strong>${recipientName}</strong>,</p>
    <p><strong>${inviterName}</strong> convidou-o(a) para o seguinte evento:</p>
    
    <div class="event-details">
      <div class="detail-row"><span class="label">📌 Evento:</span> ${scheduleItem.title}</div>
      <div class="detail-row"><span class="label">📅 Início:</span> ${formatDate(startDate)}</div>
      <div class="detail-row"><span class="label">📅 Fim:</span> ${formatDate(endDate)}</div>
      ${scheduleItem.location ? `<div class="detail-row"><span class="label">📍 Local:</span> ${scheduleItem.location}</div>` : ''}
      ${scheduleItem.description ? `<div class="detail-row"><span class="label">📝 Descrição:</span> ${scheduleItem.description}</div>` : ''}
    </div>
    
    <div class="buttons">
      <a href="${respondUrl}?response=accepted" class="btn btn-accept">✓ Aceitar</a>
      <a href="${respondUrl}?response=tentative" class="btn btn-tentative">? Talvez</a>
      <a href="${respondUrl}?response=declined" class="btn btn-decline">✗ Recusar</a>
    </div>
  </div>
  <div class="footer">
    <p>Este email foi enviado automaticamente. Por favor não responda diretamente.</p>
  </div>
</body>
</html>
  `;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const caller = await resolveCallerIdentity(req, supabaseClient);

    const { schedule_item_id, invitees, organization_id }: InviteRequest = await req.json();

    if (!schedule_item_id || !invitees?.length || !organization_id) {
      throw new Error("Missing required fields: schedule_item_id, invitees, organization_id");
    }

    const hasAccess = await validateOrgScope(supabaseClient, caller, organization_id);
    if (!hasAccess) {
      return new Response(
        JSON.stringify({ error: "Access denied to this organization" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { data: scheduleItem, error: itemError } = await supabaseClient
      .from("schedule_items")
      .select("*, created_by")
      .eq("id", schedule_item_id)
      .single();

    if (itemError || !scheduleItem) {
      throw new Error("Schedule item not found");
    }

    const { data: inviterUser } = await supabaseClient
      .from("anew_users")
      .select("first_name, last_name")
      .eq("id", scheduleItem.created_by)
      .single();

    const inviterName = inviterUser ? `${inviterUser.first_name || ''} ${inviterUser.last_name || ''}`.trim() || "Sistema" : "Sistema";

    const resolvedSmtp = await resolveSmtpForAuthenticatedUser(supabaseClient, {
      authUserId: caller.authUid,
      organizationId: organization_id,
    });
    const smtpConfig = resolvedSmtp?.smtp || null;

    // Check if schedule_invite notifications are enabled for this org
    const notifEnabled = await isNotificationEnabled(supabaseClient, organization_id, "schedule_invite");

    const results: Array<{ invitee_id: string; status: string; error?: string }> = [];
    const baseUrl = Deno.env.get("SITE_URL") || "https://olyvia.app";

    for (const invitee of invitees) {
      try {
        const { data: invitation, error: inviteError } = await supabaseClient
          .from("schedule_invitations")
          .insert({
            schedule_item_id,
            invitee_type: invitee.type,
            invitee_id: invitee.id,
            invited_by: scheduleItem.created_by,
          })
          .select()
          .single();

        if (inviteError) throw inviteError;

        const users = await getUsersFromEntity(supabaseClient, invitee.type, invitee.id);

        for (const user of users) {
          // Create in-app notification only if enabled
          if (notifEnabled) {
            await supabaseClient.from("notifications").insert({
              user_id: user.id,
              type: "schedule_invite",
              kind: "notification",
              title: "Novo Convite de Agendamento",
              message: `${inviterName} convidou-o para "${scheduleItem.title}"`,
              link: `/scheduling?invitation=${invitation.id}`,
              data: {
                invitation_id: invitation.id,
                schedule_item_id,
                inviter_name: inviterName,
              },
            });
          }

          // Send email if SMTP is configured
          if (smtpConfig && user.email) {
            try {
              const respondUrl = `${baseUrl}/scheduling?respond=${invitation.id}`;
              const html = generateInviteEmailHtml(user.full_name, scheduleItem, inviterName, respondUrl);

              await sendEmailViaSMTP(smtpConfig, { to: user.email, subject: `Convite: ${scheduleItem.title}`, html });

              await supabaseClient
                .from("schedule_invitations")
                .update({ email_sent: true, email_sent_at: new Date().toISOString() })
                .eq("id", invitation.id);
            } catch (emailError: any) {
              console.error(`Failed to send email to ${user.email}:`, sanitizeSmtpError(emailError));
            }
          }
        }

        results.push({ invitee_id: invitee.id, status: "success" });
      } catch (inviteErr: any) {
        results.push({ invitee_id: invitee.id, status: "error", error: inviteErr.message });
      }
    }

    console.log("Invitations sent:", { results, smtp: resolvedSmtp?.metadata || null });

    return new Response(
      JSON.stringify({ success: true, results }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    let authResp: Response | null = null;
    try { authResp = authErrorResponse(error, corsHeaders); } catch (_) { authResp = null; }
    if (authResp) return authResp;
    const safeError = sanitizeSmtpError(error);
    console.error("Error sending invites:", safeError);
    return new Response(
      JSON.stringify({ error: safeError }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
