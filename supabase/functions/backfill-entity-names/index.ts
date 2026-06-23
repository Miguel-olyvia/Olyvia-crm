import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";
import { z } from "npm:zod";
import { resolveCallerIdentity, requireAdminRole, authErrorResponse } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const requestSchema = z.object({
  dry_run: z.boolean().optional(),
  limit: z.number().optional(),
});

/**
 * Backfill Entity Names
 * 
 * Populates first_name and last_name on anew_entities where they are NULL.
 * 1. For entities with leads: extracts from field_values
 * 2. For entities without leads: splits display_name
 * 
 * POST /backfill-entity-names
 * Body: { dry_run?: boolean, limit?: number }
 * 
 * Requires admin role (system_admin or super_admin).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── Auth: require admin role ──
    let caller;
    try {
      caller = await resolveCallerIdentity(req, supabase);
    } catch (e) {
      return authErrorResponse(e, corsHeaders);
    }

    const isAdmin = await requireAdminRole(supabase, caller);
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Admin role required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawBody = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const parsed = requestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.issues }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { dry_run, limit } = parsed.data;
    const dryRun = dry_run ?? false;
    const batchLimit = limit ?? 500;

    // Fetch entities missing first_name
    const { data: entities, error } = await supabase
      .from("anew_entities")
      .select("id, display_name, type")
      .is("first_name", null)
      .limit(batchLimit);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!entities || entities.length === 0) {
      return new Response(JSON.stringify({ message: "No entities to backfill", updated: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const entityIds = entities.map(e => e.id);

    // Get leads for these entities to extract names from field_values
    const { data: leads } = await supabase
      .from("anew_leads")
      .select("entity_id, field_values")
      .in("entity_id", entityIds);

    // Build a map of entity_id -> best field_values
    const leadMap = new Map<string, Record<string, any>>();
    (leads || []).forEach((l: any) => {
      if (l.entity_id && l.field_values && !leadMap.has(l.entity_id)) {
        leadMap.set(l.entity_id, l.field_values);
      }
    });

    const nameAliasesFirst = ["first_name", "po_nome", "nome", "name", "firstName"];
    const nameAliasesLast = ["last_name", "po_apelido", "apelido", "surname", "lastName"];

    let updated = 0;
    const results: Array<{ id: string; first_name: string | null; last_name: string | null; source: string }> = [];

    for (const entity of entities) {
      let firstName: string | null = null;
      let lastName: string | null = null;
      let source = "display_name_split";

      const fv = leadMap.get(entity.id);
      if (fv) {
        // Try to extract from field_values
        for (const alias of nameAliasesFirst) {
          if (fv[alias] && typeof fv[alias] === "string" && fv[alias].trim()) {
            firstName = fv[alias].trim();
            break;
          }
        }
        for (const alias of nameAliasesLast) {
          if (fv[alias] && typeof fv[alias] === "string" && fv[alias].trim()) {
            lastName = fv[alias].trim();
            break;
          }
        }
        if (firstName || lastName) source = "lead_field_values";
      }

      // Fallback: split display_name
      if (!firstName && !lastName && entity.display_name) {
        const dn = entity.display_name.trim();
        // Skip generic names
        if (dn && dn !== "Lead" && !dn.startsWith("Lead -") && !dn.startsWith("Lead sem nome")) {
          const parts = dn.split(/\s+/);
          firstName = parts[0] || null;
          lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;
        }
      }

      if (firstName || lastName) {
        results.push({ id: entity.id, first_name: firstName, last_name: lastName, source });

        if (!dryRun) {
          const updateData: Record<string, any> = {};
          if (firstName) updateData.first_name = firstName;
          if (lastName) updateData.last_name = lastName;

          const { error: updateError } = await supabase
            .from("anew_entities")
            .update(updateData)
            .eq("id", entity.id);

          if (!updateError) updated++;
          else console.error(`Failed to update entity ${entity.id}:`, updateError);
        } else {
          updated++;
        }
      }
    }

    console.log(`Backfill complete: ${updated} entities ${dryRun ? "would be" : ""} updated`);

    return new Response(
      JSON.stringify({
        success: true,
        dry_run: dryRun,
        total_checked: entities.length,
        updated,
        sample: results.slice(0, 20),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in backfill-entity-names:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
