import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "npm:zod";
import { resolveSmtpForAuthenticatedUser, sendEmailViaSMTP, sanitizeSmtpError, smtpNotFoundMessage } from "../_shared/smtp.ts";
import { validateOrgScope } from "../_shared/auth.ts";

const requestSchema = z.object({
  document_type: z.enum(["proposal", "contract", "quote"]),
  document_id: z.string(),
  organization_id: z.string(),
  login_url: z.string().optional(),
  force_new_password: z.boolean().optional(),
});

import { corsHeadersExtended as corsHeaders } from "../_shared/cors.ts";

function generateTempPassword(length = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let result = "";
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  for (let i = 0; i < length; i++) {
    result += chars[arr[i] % chars.length];
  }
  return result;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });
    }

    // Get caller's anew_user
    const { data: callerAnew } = await supabase
      .from("anew_users")
      .select("id, name")
      .eq("auth_user_id", caller.id)
      .maybeSingle();

    const body = await req.json();
    const parsedBody = requestSchema.safeParse(body);
    if (!parsedBody.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsedBody.error.issues }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { document_type, document_id, organization_id, login_url, force_new_password } = parsedBody.data;

    // ── Scope check: verify caller belongs to the target organization ──
    if (!callerAnew) {
      return new Response(JSON.stringify({ error: "Utilizador não encontrado no sistema" }), { status: 403, headers: corsHeaders });
    }
    const callerIdentity = { authUid: caller.id, anewUserId: callerAnew.id, isServiceRole: false };
    const hasAccess = await validateOrgScope(supabase, callerIdentity, organization_id);
    if (!hasAccess) {
      return new Response(JSON.stringify({ error: "Sem permissão para aceder a esta organização" }), { status: 403, headers: corsHeaders });
    }

    // 1. Get document and its entity
    let entityId: string | null = null;
    let documentTitle = "";

    if (document_type === "proposal") {
      const { data: proposal } = await supabase
        .from("proposals")
        .select("id, title, entity_id, deal_id, client_id")
        .eq("id", document_id)
        .maybeSingle();

      if (!proposal) {
        return new Response(JSON.stringify({ error: "Proposta não encontrada" }), { status: 404, headers: corsHeaders });
      }
      documentTitle = proposal.title;
      entityId = proposal.entity_id || null;

      // Get entity from deal
      if (!entityId && proposal.deal_id) {
        const { data: deal } = await supabase
          .from("deals")
          .select("entity_id, contact_id, client_id")
          .eq("id", proposal.deal_id)
          .maybeSingle();
        entityId = deal?.entity_id || null;
        // fallback to contact/client entity
        if (!entityId && deal?.contact_id) {
          const { data: contact } = await supabase.from("anew_contacts").select("entity_id").eq("id", deal.contact_id).maybeSingle();
          entityId = contact?.entity_id || null;
        }
        if (!entityId && deal?.client_id) {
          const { data: client } = await supabase.from("anew_clients").select("entity_id").eq("id", deal.client_id).maybeSingle();
          entityId = client?.entity_id || null;
        }
      }
      // fallback to proposal client
      if (!entityId && proposal.client_id) {
        const { data: client } = await supabase.from("anew_clients").select("entity_id").eq("id", proposal.client_id).maybeSingle();
        entityId = client?.entity_id || null;
      }
    } else if (document_type === "quote") {
      const { data: quote } = await supabase
        .from("quotes")
        .select("id, quote_number, title, entity_id, cliente_id, deal_id")
        .eq("id", document_id)
        .maybeSingle();

      if (!quote) {
        return new Response(JSON.stringify({ error: "Orçamento não encontrado" }), { status: 404, headers: corsHeaders });
      }
      documentTitle = quote.title || quote.quote_number || "Orçamento";
      entityId = quote.entity_id || null;

      // fallback to cliente_id (anew_clients)
      if (!entityId && quote.cliente_id) {
        const { data: client } = await supabase.from("anew_clients").select("entity_id").eq("id", quote.cliente_id).maybeSingle();
        entityId = client?.entity_id || null;
      }
      // fallback to deal
      if (!entityId && quote.deal_id) {
        const { data: deal } = await supabase.from("deals").select("entity_id, contact_id, client_id").eq("id", quote.deal_id).maybeSingle();
        entityId = deal?.entity_id || null;
        if (!entityId && deal?.contact_id) {
          const { data: contact } = await supabase.from("anew_contacts").select("entity_id").eq("id", deal.contact_id).maybeSingle();
          entityId = contact?.entity_id || null;
        }
        if (!entityId && deal?.client_id) {
          const { data: client } = await supabase.from("anew_clients").select("entity_id").eq("id", deal.client_id).maybeSingle();
          entityId = client?.entity_id || null;
        }
      }
    } else {
      const { data: contract } = await supabase
        .from("client_contracts")
        .select("id, contract_number, entity_id, client_id")
        .eq("id", document_id)
        .maybeSingle();

      if (!contract) {
        return new Response(JSON.stringify({ error: "Contrato não encontrado" }), { status: 404, headers: corsHeaders });
      }
      documentTitle = contract.contract_number || "Contrato";
      entityId = contract.entity_id || null;

      if (!entityId && contract.client_id) {
        const { data: client } = await supabase.from("anew_clients").select("entity_id").eq("id", contract.client_id).maybeSingle();
        entityId = client?.entity_id || null;
      }
    }

    if (!entityId) {
      return new Response(JSON.stringify({ error: "Não foi possível identificar o contacto/cliente associado a este documento." }), { status: 400, headers: corsHeaders });
    }

    // 2. Get entity email — usa limit(1) em vez de maybeSingle() para tolerar
    // duplicados de is_primary (caso existam várias linhas marcadas como primary,
    // maybeSingle devolve erro e perderíamos o email). Fallback: qualquer email da entity.
    let email: string | undefined;
    {
      const { data: primaryEmails } = await supabase
        .from("anew_entity_emails")
        .select("email, is_primary, created_at")
        .eq("entity_id", entityId)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1);
      email = primaryEmails?.[0]?.email;
    }
    if (!email) {
      return new Response(JSON.stringify({ error: "Este contacto não tem email. Preencha o email para criar acesso ao portal." }), { status: 400, headers: corsHeaders });
    }

    // Get entity name
    const { data: entity } = await supabase
      .from("anew_entities")
      .select("display_name, first_name")
      .eq("id", entityId)
      .maybeSingle();
    const contactName = entity?.first_name || entity?.display_name || "Cliente";

    // Get organization name
    const { data: org } = await supabase
      .from("anew_organizations")
      .select("name")
      .eq("id", organization_id)
      .maybeSingle();
    const orgName = org?.name || "a empresa";

    // Get client role ID
    const { data: clientRole } = await supabase
      .from("anew_roles")
      .select("id")
      .eq("code", "client")
      .maybeSingle();

    if (!clientRole) {
      return new Response(JSON.stringify({ error: "Role 'client' não encontrado no sistema" }), { status: 500, headers: corsHeaders });
    }

    // 3. Pre-check: block if email already belongs to a CRM user (any role != client)
    //    by looking up `anew_users` BEFORE scanning auth.users. Avoids a 50-page scan
    //    on the common rejection case.
    {
      const { data: crmAnewUser } = await supabase
        .from("anew_users")
        .select("id, auth_user_id")
        .ilike("email", email)
        .maybeSingle();

      if (crmAnewUser?.auth_user_id) {
        const { data: crmRoles } = await supabase
          .from("anew_memberships")
          .select("anew_roles!inner(code)")
          .eq("user_id", crmAnewUser.id)
          .eq("status", "active");
        const hasCrmRole = (crmRoles || []).some(
          (m: any) => m.anew_roles?.code && m.anew_roles.code !== "client"
        );
        if (hasCrmRole) {
          return new Response(
            JSON.stringify({ error: "portal_email_is_crm_user" }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // 4. Check if user already exists with this email (paginate to avoid 50-user cap)
    let existingUser: any = null;
    {
      let page = 1;
      const perPage = 1000;
      while (page <= 50) {
        const { data: pageData, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage });
        if (listErr) { console.error("listUsers error:", listErr); break; }
        const found = pageData?.users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
        if (found) { existingUser = found; break; }
        if (!pageData?.users || pageData.users.length < perPage) break;
        page++;
      }
    }

    let authUserId: string;
    let isNewAccount = false;
    let tempPassword = "";
    let existingPortalUser: any = null;

    if (existingUser) {
      // ============================================================
      // SECURITY: prevent mixing CRM accounts with Portal accounts,
      // and prevent the same auth user being bound to a different
      // entity within the SAME organization. Cross-org reuse of the
      // same auth_user_id is ALLOWED (one login, multiple memberships).
      // ============================================================

      // Lookup anew_users for existingUser
      let { data: existingAnewUser } = await supabase
        .from("anew_users")
        .select("id")
        .eq("auth_user_id", existingUser.id)
        .maybeSingle();

      // 1b. Auth user without anew_users profile → lazy-create.
      //     The trigger on_auth_user_created only fires on INSERT to auth.users,
      //     so legacy auth users (or trigger failures) may lack a profile.
      //     `anew_users.auth_user_id` is UNIQUE → safe ON CONFLICT.
      if (!existingAnewUser) {
        const { data: lazyAnew, error: lazyErr } = await supabase
          .from("anew_users")
          .insert({
            auth_user_id: existingUser.id,
            email,
            name: contactName || email,
          })
          .select("id")
          .maybeSingle();

        if (lazyErr && !/duplicate|unique/i.test(lazyErr.message || "")) {
          console.error("Lazy anew_users insert failed:", lazyErr);
          return new Response(
            JSON.stringify({ error: "Falha ao registar perfil interno. Tente novamente." }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (lazyAnew) {
          existingAnewUser = lazyAnew;
        } else {
          // Race with trigger or duplicate — refetch
          const { data: refetched } = await supabase
            .from("anew_users")
            .select("id")
            .eq("auth_user_id", existingUser.id)
            .maybeSingle();
          existingAnewUser = refetched;
        }
        if (!existingAnewUser) {
          return new Response(
            JSON.stringify({ error: "Falha ao registar perfil interno (sem resultado)." }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // 1a. Block CRM accounts: any active role != 'client' anywhere
      const { data: existingMemberships } = await supabase
        .from("anew_memberships")
        .select("role_id, anew_roles!inner(code)")
        .eq("user_id", existingAnewUser.id)
        .eq("status", "active");

      const hasCrmRole = (existingMemberships || []).some(
        (m: any) => m.anew_roles?.code && m.anew_roles.code !== "client"
      );
      if (hasCrmRole) {
        return new Response(
          JSON.stringify({ error: "portal_email_is_crm_user" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 1c. Same org + different entity → block. Cross-org reuse allowed.
      const { data: sameOrgOtherEntity } = await supabase
        .from("client_portal_users")
        .select("id, entity_id")
        .eq("auth_user_id", existingUser.id)
        .eq("organization_id", organization_id)
        .neq("entity_id", entityId)
        .limit(1);

      if (sameOrgOtherEntity && sameOrgOtherEntity.length > 0) {
        return new Response(
          JSON.stringify({ error: "portal_email_used_by_other_entity" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }


      authUserId = existingUser.id;

      const { data: portalUserRecords } = await supabase
        .from("client_portal_users")
        .select("id, first_login")
        .eq("auth_user_id", authUserId)
        .eq("organization_id", organization_id)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false })
        .limit(1);
        
      const portalUserRecord = portalUserRecords?.[0];

      existingPortalUser = portalUserRecord;
      const shouldIssueCredentials = !!force_new_password || !existingPortalUser || !!existingPortalUser.first_login;

      if (shouldIssueCredentials) {
        tempPassword = generateTempPassword();
        isNewAccount = !existingPortalUser;

        const { error: updateErr } = await supabase.auth.admin.updateUserById(authUserId, {
          password: tempPassword,
        });

        if (updateErr) {
          console.error("Error setting portal password:", updateErr);
          return new Response(JSON.stringify({ error: `Erro ao definir password: ${updateErr.message}` }), { status: 500, headers: corsHeaders });
        }
      }

      // Check if already has client membership
      const { data: anewUser } = await supabase
        .from("anew_users")
        .select("id")
        .eq("auth_user_id", authUserId)
        .maybeSingle();

      if (anewUser) {
        const { data: existingMembership } = await supabase
          .from("anew_memberships")
          .select("id")
          .eq("user_id", anewUser.id)
          .eq("organization_id", organization_id)
          .eq("role_id", clientRole.id)
          .eq("status", "active")
          .maybeSingle();

        if (!existingMembership) {
          await supabase.from("anew_memberships").insert({
            user_id: anewUser.id,
            organization_id,
            role_id: clientRole.id,
            status: "active",
            relationship_type: "member",
          });
        }
      }
    } else {
      // Create new auth user
      isNewAccount = true;
      tempPassword = generateTempPassword();

      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: entity?.display_name || contactName },
      });

      if (createError || !newUser?.user) {
        console.error("Error creating user:", createError);
        return new Response(JSON.stringify({ error: `Erro ao criar conta: ${createError?.message || "unknown"}` }), { status: 500, headers: corsHeaders });
      }

      authUserId = newUser.user.id;

      // Wait for trigger to create anew_user, then add membership
      let anewUser = null;
      for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(1.5, i)));
        const { data } = await supabase
          .from("anew_users")
          .select("id")
          .eq("auth_user_id", authUserId)
          .maybeSingle();
        if (data) {
          anewUser = data;
          break;
        }
      }

      if (!anewUser) {
        // M12 — rollback: delete the orphan auth user to avoid inconsistent state
        try {
          await supabase.auth.admin.deleteUser(authUserId);
        } catch (rollbackErr) {
          console.error("Failed to rollback auth user after anew_users trigger timeout:", rollbackErr);
        }
        return new Response(JSON.stringify({ error: "Falha ao registar o utilizador no sistema. Tente novamente." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (anewUser) {
        await supabase.from("anew_memberships").insert({
          user_id: anewUser.id,
          organization_id,
          role_id: clientRole.id,
          status: "active",
          relationship_type: "member",
        });
      }
    }

    // 4. Create/update client_portal_users record
    const portalUserPayload: any = {
      auth_user_id: authUserId,
      entity_id: entityId,
      organization_id,
      created_by: callerAnew?.id || null,
      portal_status: "sent",
      first_login: !!tempPassword,
    };

    if (document_type === "proposal") {
      portalUserPayload.proposal_id = document_id;
    } else if (document_type === "quote") {
      portalUserPayload.quote_id = document_id;
    } else {
      portalUserPayload.contract_id = document_id;
    }

    // Find contact and client IDs
    const { data: contactRecord } = await supabase
      .from("anew_contacts")
      .select("id")
      .eq("entity_id", entityId)
      .eq("organization_id", organization_id)
      .maybeSingle();
    if (contactRecord) portalUserPayload.contact_id = contactRecord.id;

    const { data: clientRecord } = await supabase
      .from("anew_clients")
      .select("id")
      .eq("entity_id", entityId)
      .eq("organization_id", organization_id)
      .maybeSingle();
    if (clientRecord) portalUserPayload.client_id = clientRecord.id;

    // Upsert portal user
    let portalUserId: string | null = null;
    if (existingPortalUser) {
      const docUpdate = document_type === "proposal"
        ? { proposal_id: document_id }
        : document_type === "quote"
          ? { quote_id: document_id }
          : { contract_id: document_id };

      const portalUpdatePayload: any = {
        portal_status: "sent",
        updated_at: new Date().toISOString(),
        ...docUpdate,
      };

      if (tempPassword) {
        portalUpdatePayload.first_login = true;
      }

      await supabase
        .from("client_portal_users")
        .update(portalUpdatePayload)
        .eq("id", existingPortalUser.id);
      portalUserId = existingPortalUser.id;
    } else {
      const { data: insertedPortalUser } = await supabase
        .from("client_portal_users")
        .insert(portalUserPayload)
        .select("id")
        .maybeSingle();
      portalUserId = insertedPortalUser?.id || null;
    }

    // Publish document visibility for portal (required by RLS portal_user_can_see_document)
    if (portalUserId) {
      try {
        // Re-activate if previously revoked, or insert fresh
        const { data: existingDoc } = await supabase
          .from("client_portal_documents")
          .select("id")
          .eq("portal_user_id", portalUserId)
          .eq("document_type", document_type)
          .eq("document_id", document_id)
          .maybeSingle();

        if (existingDoc) {
          await supabase
            .from("client_portal_documents")
            .update({
              is_visible: true,
              revoked_at: null,
              revoked_by: null,
              published_at: new Date().toISOString(),
              published_by: callerAnew?.id || null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingDoc.id);
        } else {
          await supabase.from("client_portal_documents").insert({
            portal_user_id: portalUserId,
            organization_id,
            entity_id: entityId,
            document_type,
            document_id,
            is_visible: true,
            published_by: callerAnew?.id || null,
          });
        }
      } catch (e) {
        console.error("Error publishing document to portal:", e);
      }
    }

    // Record in proposal_sends / quote_sends / contract_sends for history tracking
    try {
      const sendRecord = {
        organization_id: organization_id,
        sent_by: callerAnew?.id ?? null,
        recipient_email: email || "",
        recipient_name: contactName,
        subject: `Enviado para Portal Cliente`,
        channel: "portal",
        status: "sent",
      };

      if (document_type === "proposal") {
        await supabase.from("proposal_sends").insert({ ...sendRecord, proposal_id: document_id });
      } else if (document_type === "quote") {
        await supabase.from("quote_sends").insert({ ...sendRecord, quote_id: document_id });
      } else if (document_type === "contract") {
        await supabase.from("contract_sends").insert({ ...sendRecord, contract_id: document_id });
      }
    } catch (e) {
      console.error("Error recording send history:", e);
    }

    // 5. Resolve SMTP and send email
    const resolvedSmtp = await resolveSmtpForAuthenticatedUser(supabase, {
      authUserId: caller.id,
      organizationId: organization_id,
    });
    const hasCredentials = !!tempPassword;
    const fallbackSiteUrl = Deno.env.get("SITE_URL")?.replace(/\/$/, "") || "https://olyvia.lovable.app";
    const finalLoginUrl = body.login_url || `${fallbackSiteUrl}/auth`;

    if (!resolvedSmtp) {
      const safeMessage = smtpNotFoundMessage();
      console.warn("Portal access created without SMTP", { organization_id, auth_user_id: caller.id, reason: safeMessage });
      return new Response(JSON.stringify({ 
        success: true,
        is_new_account: isNewAccount,
        email,
        temp_password: hasCredentials ? tempPassword : undefined,
        login_url: finalLoginUrl,
        message: hasCredentials
          ? `Acesso criado para ${email}. ${safeMessage}`
          : `Acesso atualizado para ${email}. ${safeMessage}`,
        smtp_status: "not_found",
        smtp_warning: safeMessage,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const smtpConfig = resolvedSmtp.smtp;
    const callerName = callerAnew?.name || caller.email || "A equipa";
    const docLabel = document_type === "proposal" ? "proposta" : document_type === "quote" ? "orçamento" : "contrato";

    let emailSubject: string;
    let emailHtml: string;

    if (hasCredentials) {
      emailSubject = `Acesso ao Portal — ${orgName}`;
      emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Olá, ${contactName}!</h2>
          <p>Foi-lhe criado um acesso ao portal de <strong>${orgName}</strong>.</p>
          <p>Tem uma <strong>${docLabel}</strong> disponível para consulta: <em>${documentTitle}</em></p>
          
          <div style="background: #f5f5f5; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0 0 8px;"><strong>Aceda ao portal:</strong></p>
            <p style="margin: 0 0 4px;">🔗 <a href="${finalLoginUrl}" style="color: #2563eb;">${finalLoginUrl}</a></p>
            <p style="margin: 0 0 4px;">📧 <strong>Email:</strong> ${email}</p>
            <p style="margin: 0;">🔑 <strong>Password temporária:</strong> ${tempPassword}</p>
          </div>
          
          <p style="color: #666; font-size: 14px;">⚠️ Recomendamos que altere a password no primeiro acesso.</p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 13px;">Enviado por ${callerName} — ${orgName}</p>
        </div>
      `;
    } else {
      emailSubject = `Nova ${docLabel} disponível — ${orgName}`;
      emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Olá, ${contactName}!</h2>
          <p>Tem uma nova <strong>${docLabel}</strong> disponível no seu portal: <em>${documentTitle}</em></p>
          <p>Aceda em: <a href="${finalLoginUrl}" style="color: #2563eb;">${finalLoginUrl}</a></p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 13px;">Enviado por ${callerName} — ${orgName}</p>
        </div>
      `;
    }

    let emailSent = false;
    let emailError = "";
    try {
      await sendEmailViaSMTP(smtpConfig, { to: email, subject: emailSubject, html: emailHtml });
      emailSent = true;
      console.log("Portal access email sent", resolvedSmtp.metadata);
    } catch (smtpErr: any) {
      emailError = sanitizeSmtpError(smtpErr);
      console.error("SMTP send failed (portal access created successfully):", { ...resolvedSmtp.metadata, error: emailError });
    }

    const response: any = {
      success: true,
      is_new_account: isNewAccount,
      email,
      login_url: finalLoginUrl,
    };
    if (hasCredentials) {
      response.temp_password = tempPassword;
    }

    if (emailSent) {
      response.smtp_status = "sent";
      response.smtp_source = resolvedSmtp.source;
      response.message = hasCredentials
        ? `Credenciais e email enviados para ${email}`
        : `Email enviado para ${email}`;
    } else {
      response.smtp_status = "send_failed";
      response.message = hasCredentials
        ? `Acesso criado para ${email}. O email de notificação não foi enviado (erro SMTP).`
        : `Acesso atualizado para ${email}. O email de notificação não foi enviado (erro SMTP).`;
      response.smtp_warning = emailError;
      response.smtp_error_safe = emailError;
    }

    return new Response(JSON.stringify(response), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    const safeError = sanitizeSmtpError(err);
    console.error("create-client-portal-access error:", safeError);
    return new Response(JSON.stringify({ error: safeError }), { status: 500, headers: corsHeaders });
  }
});
