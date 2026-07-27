import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod";

import { getCorsHeaders } from "../_shared/cors.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { deriveKeyFromEnv, encryptNif, hashNif, normalizeNif } from "../_shared/nifCrypto.ts";
import { withRetryResult } from "../_shared/retry.ts";
import { checkRateLimit, getClientIp, rateLimitResponse, recordRateLimitAttempt } from "../_shared/rateLimit.ts";

initSentry();

interface RegisterCompanyRequest {
  email: string;
  password: string;
  full_name: string;
  company_name: string;
  vat: string;
  country: string;
}

const requestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  full_name: z.string(),
  company_name: z.string(),
  vat: z.string().max(20).optional(),
  country: z.string().min(2).max(3),
});

async function createOrganizationEntity(supabaseAdmin: any, displayName: string, createdBy: string) {
  const { data, error } = await supabaseAdmin
    .from("anew_entities")
    .insert({ display_name: displayName, type: "organization", status: "active", created_by: createdBy })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

/** Result of resolving/creating the company's fiscal entity: its id plus the
 * HMAC-SHA256 hash already computed for it, so callers can propagate the
 * hash onward (e.g. into anew_organizations.metadata) without ever handling
 * or re-deriving the plaintext VAT again. */
interface CompanyFiscalEntityResolution {
  fiscalEntityId: string;
  nifHash: string;
}

/**
 * Resolves-or-creates the fiscal_entities row for the company's VAT/NIF via
 * the resolve_fiscal_entity RPC — the same atomic, encryption-aware path
 * used by the fiscal-entity-resolve Edge Function. This is a public
 * self-registration endpoint, so unlike that function (which forwards an
 * authenticated caller's identity), here the encryption/hash derivation runs
 * inline using the service-role client already held by this function.
 *
 * Never writes `nif` in clear without also computing `nif_encrypted` /
 * `nif_hash`, and never resolves/dedups by comparing the clear `nif` column
 * — resolution happens by (nif_hash, country_code) inside the RPC.
 *
 * Returns null when `vat` is empty/absent (VAT is optional on this
 * endpoint), in which case no fiscal_entities row is created at all.
 */
async function resolveOrCreateCompanyFiscalEntity(
  supabaseAdmin: any,
  vat: string | undefined,
  country: string,
  companyName: string,
  createdBy: string,
): Promise<CompanyFiscalEntityResolution | null> {
  const normalizedNif = normalizeNif(vat || "");
  if (normalizedNif === "") return null;

  const encKey = deriveKeyFromEnv("NIF_ENC_KEY", "AES-GCM");
  const hmacKey = deriveKeyFromEnv("NIF_HMAC_KEY", "HMAC");

  const [nifEncrypted, nifHash] = await Promise.all([
    encryptNif(normalizedNif, encKey),
    hashNif(normalizedNif, hmacKey),
  ]);

  const { data, error } = await withRetryResult(() => supabaseAdmin.rpc("resolve_fiscal_entity", {
    p_nif: normalizedNif,
    p_nif_hash: nifHash,
    p_nif_encrypted: nifEncrypted,
    p_country_code: country,
    p_commercial_name: companyName,
    p_entity_type: "company",
    p_created_by: createdBy,
  }));

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.fiscal_entity_id) {
    throw new Error("resolve_fiscal_entity returned no row");
  }
  return { fiscalEntityId: row.fiscal_entity_id as string, nifHash };
}

/**
 * Resolves the anew_entity (organization) already linked to a fiscal entity,
 * if exactly one exists — used to detect "this company already registered
 * under this VAT" without ever comparing the clear `nif` column.
 */
async function resolveCompanyEntityByFiscalEntityId(supabaseAdmin: any, fiscalEntityId: string) {
  const { data: links, error: linkError } = await supabaseAdmin
    .from("anew_entity_fiscal_entities")
    .select("entity_id")
    .eq("fiscal_entity_id", fiscalEntityId)
    .limit(2);

  if (linkError) throw linkError;
  return links?.length === 1 ? links[0].entity_id : null;
}

async function linkCompanyFiscalEntity(supabaseAdmin: any, entityId: string, fiscalEntityId: string, createdBy: string) {
  await supabaseAdmin.from("anew_entity_fiscal_entities").delete().eq("entity_id", entityId);
  await supabaseAdmin.from("anew_entity_fiscal_entities").insert({ entity_id: entityId, fiscal_entity_id: fiscalEntityId, is_primary: true, created_by: createdBy });
}

// IP-based rate limit: max 3 registration attempts per IP per hour. Persistent (DB-backed).
const RATE_LIMIT_BUCKET = "register-company";
const RATE_LIMIT_MAX_ATTEMPTS = 3;
const RATE_LIMIT_WINDOW_MINUTES = 60;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Rate limiting — applied to POST only (OPTIONS already returned above). Persistent, DB-backed.
    const ip = getClientIp(req);
    const rateLimit = await checkRateLimit(supabaseAdmin, {
      bucket: RATE_LIMIT_BUCKET,
      identifier: ip,
      maxAttempts: RATE_LIMIT_MAX_ATTEMPTS,
      windowMinutes: RATE_LIMIT_WINDOW_MINUTES,
    });
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit, corsHeaders);
    }
    await recordRateLimitAttempt(supabaseAdmin, RATE_LIMIT_BUCKET, ip);

    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.issues }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { email, password, full_name, company_name, vat, country } = parsed.data;

    console.log(`Checking for duplicates - Email: ${email}, VAT: ${vat}, Company: ${company_name}`);

    // Check if email, VAT, or company name already exist. Deliberately collapsed
    // into a single generic response below (no field, no distinct message) —
    // returning which specific field collided lets an attacker enumerate real
    // accounts/companies one guess at a time.
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const emailExists = existingUsers?.users?.some(
      (user) => user.email?.toLowerCase() === email.toLowerCase()
    );

    const { data: existingVatOrgs } = await supabaseAdmin
      .from("anew_organizations")
      .select("id, name, metadata")
      .eq("type", "company");

    const vatExists = existingVatOrgs?.some((org: any) => {
      const meta = org.metadata as any;
      return meta?.vat === vat;
    });

    const { data: existingName } = await supabaseAdmin
      .from("anew_organizations")
      .select("id")
      .ilike("name", company_name)
      .eq("type", "company")
      .maybeSingle();

    if (emailExists || vatExists || existingName) {
      return new Response(
        JSON.stringify({ success: false, message: "Não foi possível concluir o registo com os dados fornecidos." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("All duplicate checks passed, proceeding with registration");

    // Step 1: Create auth user
    const { data: userData, error: userError } = await withRetryResult(() => supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    }));

    if (userError) {
      console.error("Error creating user:", userError);
      return new Response(
        JSON.stringify({ error: userError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authUserId = userData.user.id;

    try {
      // Step 2: Create anew_users entry
      const { data: anewUser, error: anewUserError } = await withRetryResult(() => supabaseAdmin
        .from("anew_users")
        .insert({
          auth_user_id: authUserId,
          name: full_name,
          email,
          status: "active",
        })
        .select("id")
        .single());

      if (anewUserError) {
        console.error("Error creating anew_users:", anewUserError);
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
        return new Response(
          JSON.stringify({ error: anewUserError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Step 3: Create root organization (type=root)
      const rootOrgName = `${full_name} Organization`;
      const rootEntityId = await createOrganizationEntity(supabaseAdmin, rootOrgName, anewUser.id);
      const { data: rootOrg, error: rootOrgError } = await supabaseAdmin
        .from("anew_organizations")
        .insert({
          name: rootOrgName,
          type: "root",
          status: "active",
          created_by: anewUser.id,
          entity_id: rootEntityId,
        })
        .select("id")
        .single();

      if (rootOrgError) {
        console.error("Error creating root org:", rootOrgError);
        await supabaseAdmin.from("anew_entities").delete().eq("id", rootEntityId);
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
        return new Response(
          JSON.stringify({ error: rootOrgError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let fiscalEntityResolution: CompanyFiscalEntityResolution | null = null;
      try {
        fiscalEntityResolution = await resolveOrCreateCompanyFiscalEntity(supabaseAdmin, vat, country, company_name, anewUser.id);
      } catch (fiscalError: unknown) {
        console.error("Error resolving company fiscal entity:", fiscalError);
        await supabaseAdmin.from("anew_organizations").delete().eq("id", rootOrg.id);
        await supabaseAdmin.from("anew_entities").delete().eq("id", rootEntityId);
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
        const message = fiscalError instanceof Error ? fiscalError.message : "Failed to resolve fiscal entity";
        return new Response(
          JSON.stringify({ error: message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const existingCompanyEntityId = fiscalEntityResolution
        ? await resolveCompanyEntityByFiscalEntityId(supabaseAdmin, fiscalEntityResolution.fiscalEntityId)
        : null;
      const companyEntityId = existingCompanyEntityId || await createOrganizationEntity(supabaseAdmin, company_name, anewUser.id);

      // Step 4: Create company organization (type=company)
      //
      // entity_id is always pre-resolved above, so the anew_organizations
      // BEFORE INSERT trigger (ensure_organization_entity_identity) never
      // runs its entity-resolution branch for this insert. metadata.nif_hash
      // is still included defensively: the trigger only ever matches
      // fiscal_entities by nif_hash (never the plaintext vat/nif keys), so
      // if entity_id were ever left unset by a future change, resolution
      // would still work — and would never fall back to a plaintext compare.
      const { data: companyOrg, error: companyOrgError } = await supabaseAdmin
        .from("anew_organizations")
        .insert({
          name: company_name,
          type: "company",
          status: "active",
          created_by: anewUser.id,
          entity_id: companyEntityId,
          metadata: fiscalEntityResolution
            ? { vat, country, nif_hash: fiscalEntityResolution.nifHash }
            : { vat, country },
        })
        .select("id")
        .single();

      if (companyOrgError) {
        console.error("Error creating company org:", companyOrgError);
        await supabaseAdmin.from("anew_organizations").delete().eq("id", rootOrg.id);
        if (!existingCompanyEntityId) await supabaseAdmin.from("anew_entities").delete().eq("id", companyEntityId);
        await supabaseAdmin.from("anew_entities").delete().eq("id", rootEntityId);
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
        return new Response(
          JSON.stringify({ error: companyOrgError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (fiscalEntityResolution) {
        await linkCompanyFiscalEntity(supabaseAdmin, companyEntityId, fiscalEntityResolution.fiscalEntityId, anewUser.id);
      }

      // Step 5: Create hierarchy (root → company)
      const { error: hierarchyError } = await supabaseAdmin
        .from("anew_hierarchy")
        .insert({
          parent_org_id: rootOrg.id,
          child_org_id: companyOrg.id,
          relationship_type: "subsidiary",
          is_primary: true,
          created_by: anewUser.id,
        });

      if (hierarchyError) {
        console.error("Error creating hierarchy:", hierarchyError);
        // Non-critical, continue
      }

      // Step 6: Get or create super_admin role
      let superAdminRoleId: string;
      const { data: existingRole } = await supabaseAdmin
        .from("anew_roles")
        .select("id")
        .eq("code", "super_admin")
        .maybeSingle();

      if (existingRole) {
        superAdminRoleId = existingRole.id;
      } else {
        const { data: newRole, error: roleError } = await supabaseAdmin
          .from("anew_roles")
          .insert({
            code: "super_admin",
            name: "Super Admin",
            description: "Full organizational access",
            is_system: true,
            organization_id: null,
          })
          .select("id")
          .single();

        if (roleError) {
          console.error("Error creating super_admin role:", roleError);
          // Fallback: try to find any admin role
          const { data: fallbackRole } = await supabaseAdmin
            .from("anew_roles")
            .select("id")
            .in("code", ["super_admin", "org_admin"])
            .limit(1)
            .maybeSingle();

          superAdminRoleId = fallbackRole?.id || "";
        } else {
          superAdminRoleId = newRole.id;
        }
      }

      // Step 7: Create membership (user → root org, role=super_admin)
      if (superAdminRoleId) {
        const { error: membershipError } = await withRetryResult(() => supabaseAdmin
          .from("anew_memberships")
          .insert({
            user_id: anewUser.id,
            organization_id: rootOrg.id,
            role_id: superAdminRoleId,
            status: "active",
            relationship_type: "member",
            join_method: "registration",
            created_by: anewUser.id,
          }));

        if (membershipError) {
          console.error("Error creating membership:", membershipError);
        }
      }

      console.log("Registration completed successfully!");

      return new Response(
        JSON.stringify({
          success: true,
          user: { id: authUserId, email },
          root_org: { id: rootOrg.id, name: rootOrgName },
          company: { id: companyOrg.id, name: company_name },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } catch (innerError) {
      console.error("Inner error:", innerError);
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
      throw innerError;
    }

  } catch (error: unknown) {
    console.error("Unexpected error:", error);
    await captureError(error, { function: "register-company" });
    // This is a public, unauthenticated endpoint: never return the raw
    // exception text, which may contain internal Postgres/Supabase details.
    // The real error is already logged above and sent to Sentry for debugging.
    return new Response(
      JSON.stringify({ error: "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
