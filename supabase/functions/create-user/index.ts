import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod";

const requestSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  full_name: z.string().optional(),
  name: z.string().optional(),
  phone: z.string().nullable().optional(),
  memberships: z.array(z.unknown()).optional(),
  membership: z.unknown().optional(),
  template_id: z.string().nullable().optional(),
  custom_attributes: z.record(z.unknown()).nullable().optional(),
  position: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  nif: z.string().nullable().optional(),
  nif_country: z.string().nullable().optional(),
  fiscal: z.record(z.unknown()).nullable().optional(),
  addresses: z.array(z.unknown()).nullable().optional(),
  additional_emails: z
    .array(
      z.object({
        email: z.string(),
        email_type: z.string().optional(),
        is_primary: z.boolean().optional(),
      }),
    )
    .optional(),
  additional_phones: z.array(z.unknown()).optional(),
});

import { corsHeaders } from "../_shared/cors.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";

initSentry();

// Unified admin check via anew_memberships + anew_roles
async function resolveCallerAdmin(supabase: any, authUserId: string) {
  // Get anew_users.id from auth UUID
  const { data: anewUser, error: userError } = await supabase
    .from("anew_users")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (userError || !anewUser) {
    return { anewUserId: null, roleCodes: [], orgIds: [] };
  }

  // Get active memberships with role_id and organization_id
  const { data: memberships, error: membError } = await supabase
    .from("anew_memberships")
    .select("organization_id, role_id")
    .eq("user_id", anewUser.id)
    .eq("status", "active");

  if (membError) {
    console.error("Error fetching memberships:", membError);
    return { anewUserId: anewUser.id, roleCodes: [], orgIds: [] };
  }

  const roleIds = [...new Set((memberships || []).map((m: any) => m.role_id).filter(Boolean))];
  const orgIds = [...new Set((memberships || []).map((m: any) => m.organization_id).filter(Boolean))];

  // Fetch role codes separately to avoid join issues
  let roleCodes: string[] = [];
  if (roleIds.length > 0) {
    const { data: roles, error: rolesError } = await supabase
      .from("anew_roles")
      .select("code")
      .in("id", roleIds);

    if (rolesError) {
      console.error("Error fetching roles:", rolesError);
    } else {
      roleCodes = (roles || []).map((r: any) => r.code).filter(Boolean);
    }
  }

  console.log("Resolved caller roles:", roleCodes, "orgs:", orgIds.length);

  return { anewUserId: anewUser.id, roleCodes, orgIds };
}

function isAdmin(roleCodes: string[]) {
  return roleCodes.some((code) => ["system_admin", "super_admin", "org_admin"].includes(code));
}

function normalizeMemberships(memberships: any, membership: any) {
  const rawMemberships = [
    ...(Array.isArray(memberships) ? memberships : []),
    ...(membership ? [membership] : []),
  ];

  const seen = new Set<string>();

  return rawMemberships
    .filter((m: any) => m?.organization_id && m?.role_id)
    .filter((m: any) => {
      const key = `${m.organization_id}::${m.role_id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function jsonError(error: string, message: string, status = 400) {
  return new Response(JSON.stringify({ error, message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeText(value: any) {
  return String(value || "").trim();
}

function buildAddressKey(addr: any) {
  return [addr.street, addr.number, addr.postal_code, addr.city, addr.country || "PT"]
    .map((part) => normalizeText(part).toLowerCase().replace(/\s+/g, " "))
    .join("|");
}

function validateRawMemberships(memberships: any, membership: any) {
  const raw = [...(Array.isArray(memberships) ? memberships : []), ...(membership ? [membership] : [])];
  return raw.some((m: any) => m?.organization_id && !m?.role_id)
    ? "Membership role is required when organization_id is provided."
    : null;
}

function prepareAddresses(addresses: any) {
  if (!addresses) return { addresses: [], error: null };
  if (!Array.isArray(addresses)) return { addresses: [], error: "Addresses must be an array." };

  const prepared: any[] = [];
  for (const addr of addresses) {
    const normalized = {
      ...addr,
      street: normalizeText(addr?.street),
      number: normalizeText(addr?.number),
      postal_code: normalizeText(addr?.postal_code),
      city: normalizeText(addr?.city),
      country: normalizeText(addr?.country) || "PT",
      floor: normalizeText(addr?.floor),
      unit: normalizeText(addr?.unit),
      district: normalizeText(addr?.district),
      extra: normalizeText(addr?.extra),
      address_type: normalizeText(addr?.address_type) || "home",
      is_primary: Boolean(addr?.is_primary),
    };
    const meaningful = [normalized.street, normalized.number, normalized.postal_code, normalized.city, normalized.floor, normalized.unit, normalized.district, normalized.extra];
    if (meaningful.every((value) => !value)) continue;
    if (!normalized.street || !normalized.number || !normalized.postal_code || !normalized.city) {
      return { addresses: [], error: "Address requires street, number, postal_code and city." };
    }
    prepared.push({ ...normalized, address_key: buildAddressKey(normalized) });
  }
  return { addresses: prepared, error: null };
}

function normalizeFiscal(body: any) {
  if (body.fiscal == null && !body.nif && !body.nif_country) return { fiscal: null, error: null };
  if (body.fiscal != null && typeof body.fiscal !== "object") return { fiscal: null, error: "Fiscal data must use fiscal.{nif,country_code} or nif/nif_country." };
  const fiscal = body.fiscal || {};
  const nif = normalizeText(fiscal.nif || body.nif);
  const country_code = normalizeText(fiscal.country_code || body.nif_country || "PT");
  if (!nif) return { fiscal: null, error: body.fiscal || body.nif_country ? "Fiscal data must include nif." : null };
  if (!country_code) return { fiscal: null, error: "Fiscal data must include country_code." };
  return { fiscal: { nif, country_code, commercial_name: normalizeText(fiscal.commercial_name) }, error: null };
}

function prepareAdditionalEmails(additionalEmails: any, primaryEmail: string) {
  if (!additionalEmails) return { emails: [], error: null };
  if (!Array.isArray(additionalEmails)) return { emails: [], error: "Additional emails must be an array." };
  const seen = new Set([primaryEmail.toLowerCase().trim()]);
  const emails: any[] = [];
  for (const item of additionalEmails) {
    const email = normalizeText(item?.email).toLowerCase();
    if (!email) continue;
    if (seen.has(email)) return { emails: [], error: "Additional emails cannot duplicate the primary email or each other." };
    seen.add(email);
    emails.push({ email, email_type: item?.email_type || "work", is_primary: false });
  }
  return { emails, error: null };
}

function prepareAdditionalPhones(additionalPhones: any, primaryPhone: string | null) {
  if (!additionalPhones) return { phones: [], error: null };
  if (!Array.isArray(additionalPhones)) return { phones: [], error: "Additional phones must be an array." };
  const seen = new Set<string>();
  const primaryKey = normalizeText(primaryPhone).replace(/\s+/g, "");
  if (primaryKey) seen.add(primaryKey);
  const phones: any[] = [];
  for (const item of additionalPhones) {
    const phone_number = normalizeText(item?.phone_number);
    if (!phone_number) continue;
    const country_code = normalizeText(item?.country_code) || "+351";
    const key = `${country_code}${phone_number}`.replace(/\s+/g, "");
    if (seen.has(key)) return { phones: [], error: "Additional phones cannot duplicate the primary phone or each other." };
    seen.add(key);
    phones.push({ phone_number, country_code, phone_type: item?.phone_type || "mobile", is_primary: false });
  }
  return { phones, error: null };
}

async function findAuthUserByEmail(supabaseClient: any, email: string) {
  const normalizedEmail = email.toLowerCase();
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabaseClient.auth.admin.listUsers({ page, perPage });

    if (error) {
      throw error;
    }

    const users = data?.users || [];
    const found = users.find((u: any) => u.email?.toLowerCase() === normalizedEmail);
    if (found) return found;

    if (users.length < perPage) return null;
    page += 1;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify requesting user is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user: requestingUser },
      error: authError,
    } = await supabaseClient.auth.getUser(token);

    if (authError || !requestingUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Admin check via Anew
    const caller = await resolveCallerAdmin(supabaseClient, requestingUser.id);

    if (!caller.anewUserId || !isAdmin(caller.roleCodes)) {
      console.error("User is not an admin. Roles:", caller.roleCodes);
      return new Response(JSON.stringify({ error: "Only admins can create users" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body - supports both legacy and new formats
    const body = await req.json();
    const parsedBody = requestSchema.safeParse(body);
    if (!parsedBody.success) {
      const firstIssue = parsedBody.error.issues[0];
      const issueDetail = firstIssue ? `${firstIssue.path.join(".")}: ${firstIssue.message}` : undefined;
      return new Response(
        JSON.stringify({
          error: issueDetail ? `Invalid request (${issueDetail})` : "Invalid request",
          details: parsedBody.error.issues,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const {
      email,
      password,
      full_name,
      name,
      phone,
      memberships,
      membership,
      template_id,
      custom_attributes,
      position,
      location,
      description,
      nif,
      nif_country,
      fiscal,
      addresses,
      additional_emails,
      additional_phones,
    } = parsedBody.data;

    const userName = name || full_name;

    if (!userName) {
      return new Response(JSON.stringify({ error: "Email, password and name are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const membershipValidationError = validateRawMemberships(memberships, membership);
    if (membershipValidationError) return jsonError("membership_role_required", membershipValidationError);

    // Defense-in-depth: client-side validation can be bypassed by calling this
    // function directly, so never allow a user to be created with zero
    // organization memberships. Checked here, before the auth user is created,
    // so a rejected request never leaves behind an orphaned auth.users row.
    if (normalizeMemberships(memberships, membership).length === 0) {
      return jsonError(
        "membership_required",
        "At least one valid organization membership is required to create a user.",
      );
    }

    const preparedAddressResult = prepareAddresses(addresses);
    if (preparedAddressResult.error) return jsonError("address_incomplete", preparedAddressResult.error);
    const preparedAddresses = preparedAddressResult.addresses;

    const fiscalResult = normalizeFiscal({ fiscal, nif, nif_country });
    if (fiscalResult.error) return jsonError("invalid_fiscal_data", fiscalResult.error);
    const normalizedFiscal = fiscalResult.fiscal;

    const emailResult = prepareAdditionalEmails(additional_emails, email);
    if (emailResult.error) return jsonError("duplicate_email", emailResult.error);
    const preparedAdditionalEmails = emailResult.emails;

    const phoneResult = prepareAdditionalPhones(additional_phones, phone || null);
    if (phoneResult.error) return jsonError("duplicate_phone", phoneResult.error);
    const preparedAdditionalPhones = phoneResult.phones;

    console.log("Creating user:", email, "by admin:", caller.anewUserId);

    // Set audit context for this transaction's writes. anew_users has no
    // organization_id column — org is resolved by fn_audit_anew_users() via a
    // JOIN to anew_memberships (see supabase/migrations/20260709010000_users_audit_triggers.sql).
    const { error: setAuditCtxError } = await supabaseClient.rpc("set_audit_context", {
      p_user_id: caller.anewUserId,
      p_source: "web_app",
    });
    if (setAuditCtxError) {
      console.error("Failed to set audit context:", setAuditCtxError);
      return new Response(JSON.stringify({ error: setAuditCtxError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create auth user — no email sent
    let authUserId: string;
    let authUserResponse: any = null;
    let isExistingAuthUser = false;

    // user_metadata.admin_created tells handle_new_user() (the AFTER INSERT
    // trigger on auth.users that bootstraps self-registered users) to skip
    // its own anew_users/anew_entities writes for this row. Without this,
    // that trigger silently pre-creates the row before
    // rpc_finalize_user_profile_full runs, which then finds an existing row
    // and takes its UPDATE-diff branch instead of INSERT — producing a
    // wrong, incomplete audit diff for a brand-new user.
    //
    // This must live in user_metadata (raw_user_meta_data), not app_metadata
    // (raw_app_meta_data): GoTrue's admin.createUser() persists app_metadata
    // via a separate follow-up UPDATE issued ~20ms after the initial INSERT,
    // so an AFTER INSERT trigger never sees it. user_metadata, in contrast,
    // is already present on the row at INSERT time — this same trigger's
    // existing `NEW.raw_user_meta_data->>'full_name'` read proves that.
    const { data: createdAuthData, error: createError } = await supabaseClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: userName, admin_created: true },
    });

    if (createError) {
      // If user already exists in auth, find them and proceed
      if (createError.message?.includes("already been registered") || createError.message?.includes("already exists")) {
        console.log("Auth user already exists, looking up:", email);
        const existingAuth = await findAuthUserByEmail(supabaseClient, email);

        if (!existingAuth) {
          return new Response(JSON.stringify({ error: "User already exists but could not be found" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        authUserId = existingAuth.id;
        authUserResponse = existingAuth;
        isExistingAuthUser = true;
        console.log("Found existing auth user:", authUserId);
      } else {
        console.error("Create user error:", createError);
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      authUserId = createdAuthData.user!.id;
      authUserResponse = createdAuthData.user;
      console.log("Auth user created:", authUserId);
    }

    // Create memberships payload from frontend data (supports both membership and memberships)
    const normalizedMemberships = normalizeMemberships(memberships, membership);

    // Establish AND finalize the anew_users row PLUS every optional
    // related-table write (entity, emails, memberships, fiscal, addresses,
    // additional phones) in a single RPC call. The Edge Function itself
    // never writes to any of these tables directly — it only knows how to
    // create the auth.users row (service-role Admin API, which cannot run
    // inside a plain SQL transaction/RPC). Everything else happens inside
    // rpc_finalize_user_profile_full under app.audit_bypass='on', so this
    // single user action produces exactly one entity_audit_log row,
    // regardless of how much optional related data was supplied.
    // See supabase/migrations/20260831010000_rpc_finalize_user_profile_full.sql.
    const { data: finalizedAnewUser, error: finalizeError } = await supabaseClient.rpc(
      "rpc_finalize_user_profile_full",
      {
        p_auth_user_id: authUserId,
        p_actor_id: caller.anewUserId,
        p_name: userName,
        p_email: email,
        p_phone: phone || null,
        p_status: "active",
        p_description: description || null,
        p_position: position || null,
        p_location: location || null,
        p_template_id: template_id || null,
        p_custom_attributes: custom_attributes || null,
        p_memberships: normalizedMemberships,
        p_fiscal: normalizedFiscal,
        p_addresses: preparedAddresses,
        p_additional_emails: preparedAdditionalEmails,
        p_additional_phones: preparedAdditionalPhones,
      },
    ).single();

    if (finalizeError || !finalizedAnewUser) {
      console.error("Error finalizing anew_users profile:", finalizeError);
      return new Response(JSON.stringify({ error: finalizeError?.message || "Failed to finalize user profile" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anewUser: { id: string } = { id: (finalizedAnewUser as any).id };

    console.log("anew_users resolved:", anewUser.id);

    // clear_audit_context failure must never mask the create's outcome. SET
    // LOCAL also clears automatically at transaction end regardless.
    const { error: clearCtxError } = await supabaseClient.rpc("clear_audit_context");
    if (clearCtxError) {
      console.error("Failed to clear audit context:", clearCtxError);
    }

    return new Response(
      JSON.stringify({
        user: authUserResponse ? { id: authUserResponse.id, email: authUserResponse.email } : { id: authUserId, email },
        anew_user_id: anewUser.id,
        existing_auth_user: isExistingAuthUser,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("Error in create-user function:", error);
    await captureError(error, { function: "create-user" });
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});