import { createClient } from "npm:@supabase/supabase-js@2.80.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

import { resolveCallerIdentity } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  getEffectiveColumns,
  getExportDefinition,
  isSupportedExportModule,
  type ExportDefinition,
  type ExportModule,
} from "./exportConfig.ts";

const exportRequestSchema = z.object({
  module: z.string().min(1),
  organizationId: z.string().uuid(),
  includeSensitive: z.boolean().optional().default(false),
  filters: z.object({
    status: z.string().max(40).optional(),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }).optional().default({}),
});

const MAX_EXPORT_ROWS = 10_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type ScopeLevel = "NONE" | "OWNED" | "TEAM" | "ORG";

interface ExportRequest {
  module: ExportModule;
  organizationId: string;
  includeSensitive: boolean;
  filters: {
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  };
}

interface AuthorizationContext {
  scope: ScopeLevel;
  exportOrgIds: string[];
  scopedUserIds: string[];
  canIncludeSensitive: boolean;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function parseRequest(input: unknown): ExportRequest {
  if (!input || typeof input !== "object") throw new Error("INVALID_REQUEST");
  const body = input as Record<string, unknown>;
  const module = typeof body.module === "string" ? body.module : "";
  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";

  if (!isSupportedExportModule(module) || !UUID_PATTERN.test(organizationId)) {
    throw new Error("INVALID_REQUEST");
  }

  const filtersInput =
    body.filters && typeof body.filters === "object"
      ? (body.filters as Record<string, unknown>)
      : {};
  const filters: ExportRequest["filters"] = {};

  if (typeof filtersInput.status === "string" && filtersInput.status.length <= 40) {
    filters.status = filtersInput.status;
  }
  for (const key of ["dateFrom", "dateTo"] as const) {
    const value = filtersInput[key];
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      filters[key] = value;
    }
  }

  return {
    module,
    organizationId,
    includeSensitive: body.includeSensitive === true,
    filters,
  };
}

async function getGraph(admin: any) {
  const { data, error } = await admin
    .from("anew_hierarchy")
    .select("parent_org_id, child_org_id");
  if (error) throw error;
  return data || [];
}

function resolveDescendants(rootId: string, graph: any[]): string[] {
  const children = new Map<string, string[]>();
  for (const link of graph) {
    const list = children.get(link.parent_org_id) || [];
    list.push(link.child_org_id);
    children.set(link.parent_org_id, list);
  }
  const result = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of children.get(current) || []) {
      if (!result.has(child)) {
        result.add(child);
        queue.push(child);
      }
    }
  }
  return Array.from(result);
}

function resolveAncestors(orgId: string, graph: any[]): string[] {
  const parentByChild = new Map<string, string>();
  for (const link of graph) parentByChild.set(link.child_org_id, link.parent_org_id);
  const result = [orgId];
  let current = orgId;
  for (let depth = 0; depth < 20; depth += 1) {
    const parent = parentByChild.get(current);
    if (!parent || result.includes(parent)) break;
    result.push(parent);
    current = parent;
  }
  return result;
}

async function authorizeExport(
  admin: any,
  caller: { authUid: string; anewUserId: string },
  request: ExportRequest,
  definition: ExportDefinition,
): Promise<AuthorizationContext> {
  const [{ data: visibleOrgIds, error: visibleError }, graph] = await Promise.all([
    admin.rpc("get_user_visible_org_ids", { _auth_uid: caller.authUid }),
    getGraph(admin),
  ]);
  if (visibleError) throw visibleError;

  const visibleSet = new Set<string>((visibleOrgIds || []).map((value: unknown) => String(value)));
  if (!visibleSet.has(request.organizationId)) throw new Error("ORG_FORBIDDEN");

  const exportOrgIds = resolveDescendants(request.organizationId, graph).filter((id) =>
    visibleSet.has(id),
  );
  const ancestorIds = resolveAncestors(request.organizationId, graph);

  const { data: memberships, error: membershipError } = await admin
    .from("anew_memberships")
    .select("id, role_id, organization_id")
    .eq("user_id", caller.anewUserId)
    .eq("status", "active")
    .in("organization_id", ancestorIds);
  if (membershipError) throw membershipError;
  if (!memberships?.length) throw new Error("ORG_FORBIDDEN");

  const roleIds = Array.from(new Set(memberships.map((membership: any) => membership.role_id)));
  const membershipIds = memberships.map((membership: any) => membership.id);
  const [{ data: roles, error: rolesError }, { data: rolePermissions, error: permissionsError }] =
    await Promise.all([
      admin.from("anew_roles").select("id, code").in("id", roleIds),
      admin
        .from("anew_role_permissions")
        .select("role_id, permission_code")
        .in("role_id", roleIds),
    ]);
  if (rolesError) throw rolesError;
  if (permissionsError) throw permissionsError;

  const permissionSet = new Set(
    (rolePermissions || []).map((permission: any) => permission.permission_code),
  );
  if (!permissionSet.has(definition.basePermission)) throw new Error("EXPORT_FORBIDDEN");

  const roleCodes = new Set((roles || []).map((role: any) => role.code));
  let scope: ScopeLevel = roleCodes.has("super_admin") ? "ORG" : "OWNED";

  if (scope !== "ORG") {
    const { data: overrides, error: overridesError } = await admin
      .from("anew_membership_permission_scopes")
      .select("scope_level")
      .in("membership_id", membershipIds)
      .eq("permission_code", definition.viewPermission);
    if (overridesError) throw overridesError;
    if ((overrides || []).some((override: any) => override.scope_level === "ORG")) scope = "ORG";
    else if ((overrides || []).some((override: any) => override.scope_level === "TEAM")) {
      scope = "TEAM";
    }
  }

  const scopedUserIds = new Set<string>([caller.anewUserId]);
  if (scope === "TEAM") {
    const { data: teams, error: teamsError } = await admin
      .from("organization_teams")
      .select("id")
      .in("organization_id", exportOrgIds)
      .eq("leader_id", caller.anewUserId)
      .eq("is_active", true);
    if (teamsError) throw teamsError;
    const teamIds = (teams || []).map((team: any) => team.id);
    if (teamIds.length > 0) {
      const { data: members, error: membersError } = await admin
        .from("organization_team_members")
        .select("user_id")
        .in("team_id", teamIds);
      if (membersError) throw membersError;
      for (const member of members || []) scopedUserIds.add(member.user_id);
    }
  }

  return {
    scope,
    exportOrgIds,
    scopedUserIds: Array.from(scopedUserIds),
    canIncludeSensitive: permissionSet.has(definition.sensitivePermission),
  };
}

function applyCommonFilters(query: any, filters: ExportRequest["filters"]): any {
  let filtered = query;
  if (filters.status) filtered = filtered.eq("status", filters.status);
  if (filters.dateFrom) filtered = filtered.gte("created_at", `${filters.dateFrom}T00:00:00`);
  if (filters.dateTo) filtered = filtered.lte("created_at", `${filters.dateTo}T23:59:59.999`);
  return filtered;
}

function applyOwnerScope(query: any, auth: AuthorizationContext): any {
  if (auth.scope === "ORG") return query;
  const ids = auth.scopedUserIds;
  if (ids.length === 1) {
    return query.or(`created_by.eq.${ids[0]},assigned_to.eq.${ids[0]}`);
  }
  return query.or(`created_by.in.(${ids.join(",")}),assigned_to.in.(${ids.join(",")})`);
}

async function resolveIdentityMaps(admin: any, entityIds: string[], includeSensitive: boolean) {
  const uniqueIds = Array.from(new Set(entityIds.filter(Boolean)));
  const identity = new Map<string, any>();
  const email = new Map<string, string>();
  const phone = new Map<string, string>();
  const vat = new Map<string, string>();
  if (uniqueIds.length === 0) return { identity, email, phone, vat };

  const { data: entities, error: entityError } = await admin
    .from("anew_entities")
    .select("id, display_name, type, first_name, last_name")
    .in("id", uniqueIds);
  if (entityError) throw entityError;
  for (const entity of entities || []) identity.set(entity.id, entity);

  if (!includeSensitive) return { identity, email, phone, vat };

  const [emailsResult, phonesResult, fiscalLinksResult] = await Promise.all([
    admin
      .from("anew_entity_emails")
      .select("entity_id, email, is_primary")
      .in("entity_id", uniqueIds)
      .order("is_primary", { ascending: false }),
    admin
      .from("anew_entity_phones")
      .select("entity_id, phone_number, country_code, is_primary")
      .in("entity_id", uniqueIds)
      .order("is_primary", { ascending: false }),
    admin
      .from("anew_entity_fiscal_entities")
      .select("entity_id, fiscal_entity_id, is_primary")
      .in("entity_id", uniqueIds)
      .order("is_primary", { ascending: false }),
  ]);
  if (emailsResult.error) throw emailsResult.error;
  if (phonesResult.error) throw phonesResult.error;
  if (fiscalLinksResult.error) throw fiscalLinksResult.error;

  for (const item of emailsResult.data || []) {
    if (!email.has(item.entity_id)) email.set(item.entity_id, item.email);
  }
  for (const item of phonesResult.data || []) {
    if (!phone.has(item.entity_id)) {
      phone.set(
        item.entity_id,
        [item.country_code, item.phone_number].filter(Boolean).join(" "),
      );
    }
  }

  const fiscalLinks = fiscalLinksResult.data || [];
  const fiscalIds = Array.from(
    new Set(fiscalLinks.map((link: any) => link.fiscal_entity_id).filter(Boolean)),
  );
  if (fiscalIds.length > 0) {
    const { data: fiscalEntities, error: fiscalError } = await admin
      .from("fiscal_entities")
      .select("id, nif")
      .in("id", fiscalIds);
    if (fiscalError) throw fiscalError;
    const nifById = new Map((fiscalEntities || []).map((item: any) => [item.id, item.nif]));
    for (const link of fiscalLinks) {
      if (!vat.has(link.entity_id) && nifById.has(link.fiscal_entity_id)) {
        vat.set(link.entity_id, nifById.get(link.fiscal_entity_id));
      }
    }
  }

  return { identity, email, phone, vat };
}

async function exportClients(
  admin: any,
  request: ExportRequest,
  auth: AuthorizationContext,
  includeSensitive: boolean,
) {
  let query = admin
    .from("anew_clients")
    .select("entity_id, status, client_type, created_at, created_by, assigned_to")
    .in("organization_id", auth.exportOrgIds)
    .is("deleted_at", null);
  query = applyCommonFilters(query, request.filters);
  query = applyOwnerScope(query, auth);
  const { data, error } = await query.limit(MAX_EXPORT_ROWS + 1);
  if (error) throw error;

  const records = data || [];
  const maps = await resolveIdentityMaps(
    admin,
    records.map((record: any) => record.entity_id),
    includeSensitive,
  );
  return records.map((record: any) => ({
    name: maps.identity.get(record.entity_id)?.display_name || "",
    status: record.status || "",
    clientType: record.client_type || "",
    createdAt: record.created_at,
    email: maps.email.get(record.entity_id) || "",
    phone: maps.phone.get(record.entity_id) || "",
    vat: maps.vat.get(record.entity_id) || "",
  }));
}

async function exportContacts(
  admin: any,
  request: ExportRequest,
  auth: AuthorizationContext,
  includeSensitive: boolean,
) {
  let query = admin
    .from("anew_contacts")
    .select("entity_id, position, status, created_at, created_by, assigned_to")
    .in("organization_id", auth.exportOrgIds)
    .is("deleted_at", null)
    .is("converted_to_client_id", null);
  query = applyCommonFilters(query, request.filters);
  query = applyOwnerScope(query, auth);
  const { data, error } = await query.limit(MAX_EXPORT_ROWS + 1);
  if (error) throw error;

  const records = data || [];
  const maps = await resolveIdentityMaps(
    admin,
    records.map((record: any) => record.entity_id),
    includeSensitive,
  );
  return records.map((record: any) => ({
    name: maps.identity.get(record.entity_id)?.display_name || "",
    entityType: maps.identity.get(record.entity_id)?.type || "",
    position: record.position || "",
    status: record.status || "",
    createdAt: record.created_at,
    email: maps.email.get(record.entity_id) || "",
    phone: maps.phone.get(record.entity_id) || "",
    vat: maps.vat.get(record.entity_id) || "",
  }));
}

async function exportLeads(
  admin: any,
  request: ExportRequest,
  auth: AuthorizationContext,
  includeSensitive: boolean,
) {
  let query = admin
    .from("anew_leads")
    .select("entity_id, status, source_id, assigned_to, created_by, created_at")
    .in("organization_id", auth.exportOrgIds)
    .is("deleted_at", null);
  query = applyCommonFilters(query, request.filters);
  query = applyOwnerScope(query, auth);
  const { data, error } = await query.limit(MAX_EXPORT_ROWS + 1);
  if (error) throw error;

  const records = data || [];
  const sourceIds = Array.from(
    new Set(records.map((r: any) => r.source_id).filter(Boolean)),
  );
  const assignedIds = Array.from(
    new Set(records.map((r: any) => r.assigned_to).filter(Boolean)),
  );

  const [maps, sourcesResult, usersResult] = await Promise.all([
    resolveIdentityMaps(
      admin,
      records.map((r: any) => r.entity_id),
      includeSensitive,
    ),
    sourceIds.length > 0
      ? admin.from("lead_sources").select("id, name").in("id", sourceIds)
      : Promise.resolve({ data: [], error: null }),
    assignedIds.length > 0
      ? admin.from("anew_users").select("id, full_name").in("id", assignedIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (sourcesResult.error) throw sourcesResult.error;
  if (usersResult.error) throw usersResult.error;

  const sourceNames = new Map(
    (sourcesResult.data || []).map((s: any) => [s.id, s.name]),
  );
  const userNames = new Map(
    (usersResult.data || []).map((u: any) => [u.id, u.full_name]),
  );

  return records.map((r: any) => ({
    name: maps.identity.get(r.entity_id)?.display_name || "",
    status: r.status || "",
    source: sourceNames.get(r.source_id) || "",
    assignedTo: userNames.get(r.assigned_to) || "",
    createdAt: r.created_at,
    email: maps.email.get(r.entity_id) || "",
    phone: maps.phone.get(r.entity_id) || "",
    vat: maps.vat.get(r.entity_id) || "",
  }));
}

async function exportQuotes(
  admin: any,
  request: ExportRequest,
  auth: AuthorizationContext,
  includeSensitive: boolean,
) {
  let query = admin
    .from("quotes")
    .select(
      "quote_number, organization_id, entity_id, estado, created_at, total, moeda, modelo_base, obra_endereco, created_by, assigned_to",
    )
    .in("organization_id", auth.exportOrgIds)
    .is("deleted_at", null);
  if (request.filters.status) query = query.eq("estado", request.filters.status);
  if (request.filters.dateFrom) query = query.gte("created_at", `${request.filters.dateFrom}T00:00:00`);
  if (request.filters.dateTo) query = query.lte("created_at", `${request.filters.dateTo}T23:59:59.999`);
  query = applyOwnerScope(query, auth);
  const { data, error } = await query.limit(MAX_EXPORT_ROWS + 1);
  if (error) throw error;

  const records = data || [];
  const [maps, organizationsResult] = await Promise.all([
    resolveIdentityMaps(
      admin,
      records.map((record: any) => record.entity_id),
      includeSensitive,
    ),
    admin
      .from("anew_organizations")
      .select("id, name")
      .in(
        "id",
        Array.from(new Set(records.map((record: any) => record.organization_id).filter(Boolean))),
      ),
  ]);
  if (organizationsResult.error) throw organizationsResult.error;
  const organizations = new Map(
    (organizationsResult.data || []).map((organization: any) => [
      organization.id,
      organization.name,
    ]),
  );

  return records.map((record: any) => ({
    quoteNumber: record.quote_number || "",
    organization: organizations.get(record.organization_id) || "",
    client: maps.identity.get(record.entity_id)?.display_name || "",
    status: record.estado || "",
    createdAt: record.created_at,
    total: record.total || 0,
    currency: record.moeda || "EUR",
    baseModel: record.modelo_base || "",
    siteAddress: includeSensitive ? record.obra_endereco || "" : "",
  }));
}

async function updateAudit(admin: any, auditId: string | null, values: Record<string, unknown>) {
  if (!auditId) return;
  const { error } = await admin.from("data_export_audit").update(values).eq("id", auditId);
  if (error) console.error("Failed to update export audit", error.message);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let auditId: string | null = null;
  try {
    const caller = await resolveCallerIdentity(req, admin);
    if (caller.isServiceRole) return jsonResponse({ error: "User session required" }, 403);

    const rawBody = await req.json();
    const zodParsed = exportRequestSchema.safeParse(rawBody);
    if (!zodParsed.success) {
      return jsonResponse({ error: "Invalid request", details: zodParsed.error.issues }, 400);
    }
    if (!isSupportedExportModule(zodParsed.data.module)) {
      return jsonResponse({ error: "Invalid export request" }, 400);
    }
    const request = parseRequest(zodParsed.data);
    const definition = getExportDefinition(request.module);

    let auth: AuthorizationContext;
    try {
      auth = await authorizeExport(admin, caller, request, definition);
    } catch (error) {
      const code = error instanceof Error ? error.message : "EXPORT_FORBIDDEN";
      await admin.from("data_export_audit").insert({
        organization_id: request.organizationId,
        auth_user_id: caller.authUid,
        business_user_id: caller.anewUserId,
        module: request.module,
        requested_columns: definition.columns.map((column) => column.key),
        effective_columns: [],
        sensitive_columns: [],
        scope: "NONE",
        filters: request.filters,
        status: "denied",
        error_code: code,
        completed_at: new Date().toISOString(),
      });
      return jsonResponse({ error: "Export not authorized" }, 403);
    }

    if (request.includeSensitive && !auth.canIncludeSensitive) {
      await admin.from("data_export_audit").insert({
        organization_id: request.organizationId,
        auth_user_id: caller.authUid,
        business_user_id: caller.anewUserId,
        module: request.module,
        requested_columns: definition.columns.map((column) => column.key),
        effective_columns: [],
        sensitive_columns: definition.columns
          .filter((column) => column.sensitive)
          .map((column) => column.key),
        scope: auth.scope,
        filters: request.filters,
        status: "denied",
        error_code: "SENSITIVE_EXPORT_FORBIDDEN",
        completed_at: new Date().toISOString(),
      });
      return jsonResponse({ error: "Sensitive export not authorized" }, 403);
    }

    const includeSensitive = request.includeSensitive && auth.canIncludeSensitive;
    const columns = getEffectiveColumns(definition, includeSensitive);
    const { data: audit, error: auditError } = await admin
      .from("data_export_audit")
      .insert({
        organization_id: request.organizationId,
        auth_user_id: caller.authUid,
        business_user_id: caller.anewUserId,
        module: request.module,
        requested_columns: columns.map((column) => column.key),
        effective_columns: columns.map((column) => column.key),
        sensitive_columns: columns
          .filter((column) => column.sensitive)
          .map((column) => column.key),
        scope: auth.scope,
        filters: request.filters,
        status: "started",
      })
      .select("id")
      .single();
    if (auditError) throw auditError;
    auditId = audit.id;

    const rows =
      request.module === "clients"
        ? await exportClients(admin, request, auth, includeSensitive)
        : request.module === "contacts"
          ? await exportContacts(admin, request, auth, includeSensitive)
          : request.module === "leads"
            ? await exportLeads(admin, request, auth, includeSensitive)
            : await exportQuotes(admin, request, auth, includeSensitive);

    if (rows.length > MAX_EXPORT_ROWS) {
      await updateAudit(admin, auditId, {
        status: "failed",
        error_code: "ROW_LIMIT_EXCEEDED",
        row_count: rows.length,
        completed_at: new Date().toISOString(),
      });
      return jsonResponse({ error: "Export exceeds the maximum row limit" }, 413);
    }

    await updateAudit(admin, auditId, {
      status: "completed",
      row_count: rows.length,
      completed_at: new Date().toISOString(),
    });

    return jsonResponse({
      filename: `${definition.filenamePrefix}_${new Date().toISOString().slice(0, 10)}.xlsx`,
      sheetName: definition.sheetName,
      columns,
      rows,
      rowCount: rows.length,
      includesSensitive: includeSensitive,
    });
  } catch (error) {
    console.error("Controlled export failed", error instanceof Error ? error.message : error);
    await updateAudit(admin, auditId, {
      status: "failed",
      error_code: "INTERNAL_ERROR",
      completed_at: new Date().toISOString(),
    });
    const message = error instanceof Error ? error.message : "";
    if (message === "INVALID_REQUEST" || message === "Unsupported export module") {
      return jsonResponse({ error: "Invalid export request" }, 400);
    }
    if (message.includes("Authorization") || message.includes("token")) {
      return jsonResponse({ error: "Authentication required" }, 401);
    }
    return jsonResponse({ error: "Unable to generate export" }, 500);
  }
});
