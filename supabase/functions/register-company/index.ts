import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RegisterCompanyRequest {
  email: string;
  password: string;
  full_name: string;
  company_name: string;
  vat: string;
  country: string;
}

async function createOrganizationEntity(supabaseAdmin: any, displayName: string, createdBy: string) {
  const { data, error } = await supabaseAdmin
    .from("anew_entities")
    .insert({ display_name: displayName, type: "organization", status: "active", created_by: createdBy })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

async function resolveCompanyEntityByVat(supabaseAdmin: any, vat: string, country: string) {
  const { data: fiscalEntities, error: fiscalError } = await supabaseAdmin
    .from("fiscal_entities")
    .select("id")
    .eq("nif", vat)
    .eq("country_code", country)
    .limit(2);

  if (fiscalError) throw fiscalError;
  if (!fiscalEntities || fiscalEntities.length !== 1) return null;

  const { data: links, error: linkError } = await supabaseAdmin
    .from("anew_entity_fiscal_entities")
    .select("entity_id")
    .eq("fiscal_entity_id", fiscalEntities[0].id)
    .limit(2);

  if (linkError) throw linkError;
  return links?.length === 1 ? links[0].entity_id : null;
}

async function upsertCompanyFiscalEntity(supabaseAdmin: any, entityId: string, vat: string, country: string, companyName: string, createdBy: string) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("fiscal_entities")
    .select("id")
    .eq("nif", vat)
    .eq("country_code", country)
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;

  let fiscalEntityId = existing?.id;
  if (fiscalEntityId) {
    await supabaseAdmin.from("fiscal_entities").update({ commercial_name: companyName, updated_at: new Date().toISOString() }).eq("id", fiscalEntityId);
  } else {
    const { data: created, error } = await supabaseAdmin
      .from("fiscal_entities")
      .insert({ nif: vat, commercial_name: companyName, country_code: country, created_by: createdBy })
      .select("id")
      .single();
    if (error) throw error;
    fiscalEntityId = created.id;
  }

  await supabaseAdmin.from("anew_entity_fiscal_entities").delete().eq("entity_id", entityId);
  await supabaseAdmin.from("anew_entity_fiscal_entities").insert({ entity_id: entityId, fiscal_entity_id: fiscalEntityId, is_primary: true, created_by: createdBy });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body: RegisterCompanyRequest = await req.json();
    const { email, password, full_name, company_name, vat, country } = body;

    if (!email || !password || !full_name || !company_name || !vat || !country) {
      return new Response(
        JSON.stringify({ success: false, field: "general", message: "Campos obrigatórios em falta" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Checking for duplicates - Email: ${email}, VAT: ${vat}, Company: ${company_name}`);

    // Check if email already exists in auth.users
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const emailExists = existingUsers?.users?.some(
      (user) => user.email?.toLowerCase() === email.toLowerCase()
    );

    if (emailExists) {
      return new Response(
        JSON.stringify({ success: false, field: "email", message: "Já existe uma conta com este email" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if VAT already exists in anew_organizations metadata
    const { data: existingVatOrgs } = await supabaseAdmin
      .from("anew_organizations")
      .select("id, name, metadata")
      .eq("type", "company");

    const vatExists = existingVatOrgs?.some((org: any) => {
      const meta = org.metadata as any;
      return meta?.vat === vat;
    });

    if (vatExists) {
      return new Response(
        JSON.stringify({ success: false, field: "vat", message: "Já existe uma empresa registada com este NIF/VAT" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if company name already exists
    const { data: existingName } = await supabaseAdmin
      .from("anew_organizations")
      .select("id")
      .ilike("name", company_name)
      .eq("type", "company")
      .maybeSingle();

    if (existingName) {
      return new Response(
        JSON.stringify({ success: false, field: "company_name", message: "Já existe uma empresa registada com este nome" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("All duplicate checks passed, proceeding with registration");

    // Step 1: Create auth user
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

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
      const { data: anewUser, error: anewUserError } = await supabaseAdmin
        .from("anew_users")
        .insert({
          auth_user_id: authUserId,
          name: full_name,
          email,
          status: "active",
        })
        .select("id")
        .single();

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

      const existingCompanyEntityId = await resolveCompanyEntityByVat(supabaseAdmin, vat, country);
      const companyEntityId = existingCompanyEntityId || await createOrganizationEntity(supabaseAdmin, company_name, anewUser.id);

      // Step 4: Create company organization (type=company)
      const { data: companyOrg, error: companyOrgError } = await supabaseAdmin
        .from("anew_organizations")
        .insert({
          name: company_name,
          type: "company",
          status: "active",
          created_by: anewUser.id,
          entity_id: companyEntityId,
          metadata: { vat, country },
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

      await upsertCompanyFiscalEntity(supabaseAdmin, companyEntityId, vat, country, company_name, anewUser.id);

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
        const { error: membershipError } = await supabaseAdmin
          .from("anew_memberships")
          .insert({
            user_id: anewUser.id,
            organization_id: rootOrg.id,
            role_id: superAdminRoleId,
            status: "active",
            relationship_type: "member",
            join_method: "registration",
            created_by: anewUser.id,
          });

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
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
