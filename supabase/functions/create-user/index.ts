import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod";

const requestSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  full_name: z.string().optional(),
  name: z.string().optional(),
  phone: z.string().optional(),
  memberships: z.array(z.unknown()).optional(),
  membership: z.unknown().optional(),
  template_id: z.string().optional(),
  custom_attributes: z.record(z.unknown()).optional(),
  position: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  nif: z.string().optional(),
  nif_country: z.string().optional(),
  fiscal: z.record(z.unknown()).optional(),
  addresses: z.array(z.unknown()).optional(),
  additional_emails: z.array(z.string()).optional(),
  additional_phones: z.array(z.unknown()).optional(),
});

import { corsHeaders } from "../_shared/cors.ts";

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

function isDuplicateKeyError(error: any) {
  return error?.code === "23505" || /duplicate key/i.test(error?.message || "");
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
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsedBody.error.issues }),
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

    // Create auth user — no email sent
    let authUserId: string;
    let authUserResponse: any = null;
    let isExistingAuthUser = false;

    const { data: createdAuthData, error: createError } = await supabaseClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: userName },
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

    // Reuse auto-created anew_users entry from auth trigger when available
    const anewUserData: any = {
      auth_user_id: authUserId,
      name: userName,
      email,
      status: "active",
      created_by: caller.anewUserId,
    };

    if (phone) anewUserData.phone = phone;
    if (template_id) anewUserData.template_id = template_id;
    if (custom_attributes) anewUserData.custom_attributes = custom_attributes;
    if (position) anewUserData.position = position;
    if (location) anewUserData.location = location;
    if (description) anewUserData.description = description;

    let anewUser: { id: string } | null = null;

    const { data: existingAnewUser, error: existingUserError } = await supabaseClient
      .from("anew_users")
      .select("id")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (existingUserError) {
      console.error("Error checking existing anew_users:", existingUserError);
      return new Response(JSON.stringify({ error: existingUserError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (existingAnewUser) {
      const { data: updatedAnewUser, error: updateAnewUserError } = await supabaseClient
        .from("anew_users")
        .update(anewUserData)
        .eq("id", existingAnewUser.id)
        .select("id")
        .single();

      if (updateAnewUserError) {
        console.error("Error updating anew_users:", updateAnewUserError);
        return new Response(JSON.stringify({ error: updateAnewUserError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      anewUser = updatedAnewUser;
    } else {
      const { data: insertedAnewUser, error: anewUserError } = await supabaseClient
        .from("anew_users")
        .insert(anewUserData)
        .select("id")
        .single();

      if (anewUserError) {
        if (isDuplicateKeyError(anewUserError)) {
          const { data: racedAnewUser, error: racedAnewUserError } = await supabaseClient
            .from("anew_users")
            .select("id")
            .eq("auth_user_id", authUserId)
            .maybeSingle();

          if (racedAnewUserError || !racedAnewUser) {
            console.error("Error resolving raced anew_users insert:", racedAnewUserError || anewUserError);
            return new Response(JSON.stringify({ error: anewUserError.message }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          anewUser = racedAnewUser;
        } else {
          console.error("Error creating anew_users:", anewUserError);
          return new Response(JSON.stringify({ error: anewUserError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        anewUser = insertedAnewUser;
      }
    }

    console.log("anew_users resolved:", anewUser.id);

    // Create anew_entity if not already linked
    const { data: currentAnewUser } = await supabaseClient
      .from("anew_users")
      .select("entity_id")
      .eq("id", anewUser.id)
      .single();

    let effectiveEntityId = currentAnewUser?.entity_id || null;

    if (!effectiveEntityId) {
      // Parse first/last name
      const nameParts = userName.trim().split(/\s+/);
      const firstName = nameParts[0] || userName;
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : null;

      const { data: newEntity, error: entityError } = await supabaseClient
        .from("anew_entities")
        .insert({
          type: "person",
          display_name: userName,
          first_name: firstName,
          last_name: lastName,
          status: "active",
          created_by: caller.anewUserId,
        })
        .select("id")
        .single();

      if (!entityError && newEntity) {
        // Create primary email for the entity
        await supabaseClient.from("anew_entity_emails").insert({
          entity_id: newEntity.id,
          email,
          email_type: "work",
          is_primary: true,
          is_verified: true,
          created_by: caller.anewUserId,
        });

        // Link entity to anew_users
        await supabaseClient.from("anew_users").update({ entity_id: newEntity.id }).eq("id", anewUser.id);
        effectiveEntityId = newEntity.id;

        console.log("Entity created and linked:", newEntity.id);
      } else if (entityError) {
        console.error("Error creating entity:", entityError);
      }
    }

    if (!effectiveEntityId) {
      return jsonError("entity_resolution_failed", "Could not resolve user entity.", 400);
    }

    // Create memberships from frontend data (supports both membership and memberships)
    const normalizedMemberships = normalizeMemberships(memberships, membership);

    if (normalizedMemberships.length > 0) {
      for (const m of normalizedMemberships) {
        const membershipRow = {
          user_id: anewUser.id,
          organization_id: m.organization_id,
          role_id: m.role_id,
          status: "active",
          relationship_type: m.relationship_type || "member",
          join_method: "admin_created",
          created_by: caller.anewUserId,
        };

        const { data: existingMembership } = await supabaseClient
          .from("anew_memberships")
          .select("id")
          .eq("user_id", membershipRow.user_id)
          .eq("organization_id", membershipRow.organization_id)
          .eq("role_id", membershipRow.role_id)
          .eq("status", "active")
          .maybeSingle();

        if (existingMembership) {
          console.log(`Membership already exists for org ${membershipRow.organization_id}, skipping`);
          continue;
        }

        const { error: membershipError } = await supabaseClient.from("anew_memberships").insert(membershipRow);

        if (membershipError) {
          if (isDuplicateKeyError(membershipError)) {
            console.log(`Membership raced for org ${membershipRow.organization_id}, skipping duplicate`);
            continue;
          }
          console.error("Error creating membership:", membershipError);
        } else {
          console.log(`Created membership for org ${membershipRow.organization_id}`);
        }
      }
      console.log(`Processed ${normalizedMemberships.length} memberships`);
    }

    // Handle NIF/fiscal entity if provided
    if (normalizedFiscal) {
      const { data: fiscalEntity, error: fiscalError } = await supabaseClient
        .from("fiscal_entities")
        .insert({
          nif: normalizedFiscal.nif,
          country_code: normalizedFiscal.country_code,
          commercial_name: normalizedFiscal.commercial_name || null,
          created_by: caller.anewUserId,
        })
        .select("id")
        .maybeSingle();

      if (!fiscalError && fiscalEntity) {
        await supabaseClient.from("anew_entity_fiscal_entities").insert({
          entity_id: effectiveEntityId,
          fiscal_entity_id: fiscalEntity.id,
          is_primary: true,
          valid_from: new Date().toISOString(),
          created_by: caller.anewUserId,
        });
      }
    }

    // Handle addresses if provided
    if (preparedAddresses.length > 0) {
      for (const addr of preparedAddresses) {
        const { data: newAddr, error: addrError } = await supabaseClient
          .from("anew_addresses")
          .insert({
            address_key: addr.address_key,
            street: addr.street,
            number: addr.number,
            postal_code: addr.postal_code,
            city: addr.city,
            district: addr.district || null,
            country: addr.country || "PT",
            floor: addr.floor || null,
            unit: addr.unit || null,
            extra: addr.extra || null,
            created_by: caller.anewUserId,
          })
          .select("id")
          .maybeSingle();

        if (!addrError && newAddr) {
          await supabaseClient.from("anew_entity_addresses").insert({
            entity_id: effectiveEntityId,
            address_id: newAddr.id,
            address_type: addr.address_type || "home",
            is_primary: addr.is_primary,
            valid_from: new Date().toISOString(),
            created_by: caller.anewUserId,
          });
        }
      }
    }

    // Handle additional emails
    if (preparedAdditionalEmails.length > 0) {
      await supabaseClient.from("anew_entity_emails").insert(preparedAdditionalEmails.map((e: any) => ({
        entity_id: effectiveEntityId,
        email: e.email,
        email_type: e.email_type || "work",
        is_primary: false,
        valid_from: new Date().toISOString(),
        created_by: caller.anewUserId,
      })));
    }

    // Handle additional phones
    if (preparedAdditionalPhones.length > 0) {
      await supabaseClient.from("anew_entity_phones").insert(preparedAdditionalPhones.map((p: any) => ({
        entity_id: effectiveEntityId,
        phone_number: p.phone_number,
        country_code: p.country_code || "+351",
        phone_type: p.phone_type || "mobile",
        is_primary: false,
        valid_from: new Date().toISOString(),
        created_by: caller.anewUserId,
      })));
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
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});