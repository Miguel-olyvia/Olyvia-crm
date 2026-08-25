import { createClient } from "npm:@supabase/supabase-js@2.80.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

import { resolveCallerIdentity } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import {
  getEffectiveColumns,
  getExportDefinition,
  isSupportedExportModule,
  type ExportDefinition,
} from "./exportConfig.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { decryptNif, deriveKeyFromEnv } from "../_shared/nifCrypto.ts";
import {
  applyCommonFilters,
  applyOwnerScope,
  fetchAllRows,
  fetchScopedRows,
  MAX_EXPORT_ROWS,
  MAX_SELECTION_IDS,
  parseRequest,
  selectInChunks,
  type AuthorizationContext,
  type ExportRequest,
  type ScopeLevel,
} from "./requestScoping.ts";

initSentry();

/** Raw key (Uint8Array from deriveKeyFromEnv) or an already imported CryptoKey. */
type NifKey = Uint8Array | CryptoKey;

const exportRequestSchema = z.object({
  module: z.string().min(1),
  organizationId: z.string().uuid(),
  includeSensitive: z.boolean().optional().default(false),
  filters: z.object({
    status: z.string().max(40).optional(),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    search: z.string().max(200).optional(),
    assignedTo: z.string().max(80).optional(),
    onlyMine: z.boolean().optional(),
    // Strict UUID shape isn't enforced here — requestScoping.ts's
    // parseRequest re-validates every entry against UUID_PATTERN and rejects
    // the whole request if any entry doesn't match, rather than silently
    // dropping bad ids.
    ids: z.array(z.string()).max(10_000).optional(),
  }).optional().default({}),
});

/** `admin` here is the caller-scoped client (see `db` in Deno.serve) — anew_hierarchy rows are readable under RLS whenever either endpoint is in the caller's visible org set, which always holds for edges relevant to the requested org's ancestors/descendants. */
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

/**
 * `admin` here is the caller-scoped client (`db` in Deno.serve), not the
 * service-role one — every read below (visible orgs, hierarchy, memberships,
 * roles, role_permissions, membership_permission_scopes, teams) runs under
 * the caller's own RLS. That is what makes `visibleSet`/`exportOrgIds` an
 * RLS-backed set rather than a second, hand-rolled authorization model: RLS
 * decides what the caller can see, this function additionally decides what
 * they may export (`.export`/`.export_sensitive` permission gates below).
 */
export async function authorizeExport(
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

/** `admin` here is the caller-scoped client passed in by every exportX function below — identity/contact-detail reads run under the caller's RLS. */
async function resolveIdentityMaps(
  admin: any,
  entityIds: string[],
  includeSensitive: boolean,
  decKey: NifKey | null,
) {
  const uniqueIds = Array.from(new Set(entityIds.filter(Boolean)));
  const identity = new Map<string, any>();
  const email = new Map<string, string>();
  const phone = new Map<string, string>();
  const vat = new Map<string, string>();
  if (uniqueIds.length === 0) return { identity, email, phone, vat };

  const entities = await selectInChunks(uniqueIds, (chunk) =>
    admin
      .from("anew_entities")
      .select("id, display_name, type, first_name, last_name")
      .in("id", chunk),
  );
  for (const entity of entities) identity.set(entity.id, entity);

  if (!includeSensitive) return { identity, email, phone, vat };

  // Chunks are split by entity id, so every row for a given entity lands in the
  // same request and the is_primary ordering below still holds per entity.
  const [emailRows, phoneRows, fiscalLinkRows] = await Promise.all([
    selectInChunks(uniqueIds, (chunk) =>
      admin
        .from("anew_entity_emails")
        .select("entity_id, email, is_primary")
        .in("entity_id", chunk)
        .order("is_primary", { ascending: false }),
    ),
    selectInChunks(uniqueIds, (chunk) =>
      admin
        .from("anew_entity_phones")
        .select("entity_id, phone_number, country_code, is_primary")
        .in("entity_id", chunk)
        .order("is_primary", { ascending: false }),
    ),
    selectInChunks(uniqueIds, (chunk) =>
      admin
        .from("anew_entity_fiscal_entities")
        .select("entity_id, fiscal_entity_id, is_primary")
        .in("entity_id", chunk)
        .order("is_primary", { ascending: false }),
    ),
  ]);

  for (const item of emailRows) {
    if (!email.has(item.entity_id)) email.set(item.entity_id, item.email);
  }
  for (const item of phoneRows) {
    if (!phone.has(item.entity_id)) {
      phone.set(
        item.entity_id,
        [item.country_code, item.phone_number].filter(Boolean).join(" "),
      );
    }
  }

  const fiscalLinks = fiscalLinkRows;
  const fiscalIds = Array.from(
    new Set(fiscalLinks.map((link: any) => link.fiscal_entity_id).filter(Boolean)),
  ) as string[];
  if (fiscalIds.length > 0 && decKey) {
    const fiscalEntities = await selectInChunks(fiscalIds, (chunk) =>
      admin.from("fiscal_entities").select("id, nif_encrypted").in("id", chunk),
    );
    const nifById = new Map<string, string>();
    for (const item of fiscalEntities) {
      if (!item.nif_encrypted) continue;
      try {
        nifById.set(item.id, await decryptNif(item.nif_encrypted, decKey));
      } catch (decryptError) {
        console.error(
          `export-data: failed to decrypt nif for fiscal_entity ${item.id}`,
          decryptError instanceof Error ? decryptError.message : decryptError,
        );
      }
    }
    for (const link of fiscalLinks) {
      if (!vat.has(link.entity_id) && nifById.has(link.fiscal_entity_id)) {
        vat.set(link.entity_id, nifById.get(link.fiscal_entity_id)!);
      }
    }
  }

  return { identity, email, phone, vat };
}

export async function exportClients(
  admin: any,
  request: ExportRequest,
  auth: AuthorizationContext,
  includeSensitive: boolean,
  decKey: NifKey | null,
) {
  const buildClientsQuery = () => {
    let query = admin
      .from("anew_clients")
      .select("id, entity_id, status, client_type, created_at, created_by, assigned_to")
      .in("organization_id", auth.exportOrgIds)
      .is("deleted_at", null)
      .order("id", { ascending: true });
    query = applyCommonFilters(query, request.filters);
    query = applyOwnerScope(query, auth);
    return query;
  };
  const records = await fetchAllRows(buildClientsQuery);

  // `assigned_to` is a business user id; the file gets the person's name, never
  // the id — same treatment exportLeads already gives it. Bounded by the number
  // of distinct assignees, so no chunking needed here.
  const assignedIds = Array.from(
    new Set(records.map((record: any) => record.assigned_to).filter(Boolean)),
  ) as string[];

  const [maps, usersResult] = await Promise.all([
    resolveIdentityMaps(
      admin,
      records.map((record: any) => record.entity_id),
      includeSensitive,
      decKey,
    ),
    assignedIds.length > 0
      ? admin.from("anew_users").select("id, name").in("id", assignedIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (usersResult.error) throw usersResult.error;

  const userNames = new Map(
    (usersResult.data || []).map((u: any) => [u.id, u.name]),
  );

  return records.map((record: any) => ({
    name: maps.identity.get(record.entity_id)?.display_name || "",
    status: record.status || "",
    clientType: record.client_type || "",
    assignedTo: userNames.get(record.assigned_to) || "",
    createdAt: record.created_at,
    email: maps.email.get(record.entity_id) || "",
    phone: maps.phone.get(record.entity_id) || "",
    vat: maps.vat.get(record.entity_id) || "",
  }));
}

export async function exportContacts(
  admin: any,
  request: ExportRequest,
  auth: AuthorizationContext,
  includeSensitive: boolean,
  decKey: NifKey | null,
) {
  const buildContactsQuery = () => {
    let query = admin
      .from("anew_contacts")
      .select("id, entity_id, position, status, created_at, created_by, assigned_to")
      .in("organization_id", auth.exportOrgIds)
      .is("deleted_at", null)
      .is("converted_to_client_id", null)
      .order("id", { ascending: true });
    query = applyCommonFilters(query, request.filters);
    query = applyOwnerScope(query, auth);
    return query;
  };
  const records = await fetchAllRows(buildContactsQuery);
  const maps = await resolveIdentityMaps(
    admin,
    records.map((record: any) => record.entity_id),
    includeSensitive,
    decKey,
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

export async function exportLeads(
  admin: any,
  request: ExportRequest,
  auth: AuthorizationContext,
  includeSensitive: boolean,
  decKey: NifKey | null,
) {
  // Rebuilt per page: `.range()` has to be applied to a fresh builder, and the
  // id ordering makes the paging deterministic (without an ORDER BY, PostgREST
  // may repeat or skip rows across pages).
  const buildLeadsQuery = () => {
    let query = admin
      .from("anew_leads")
      .select("id, entity_id, status, source_id, assigned_to, created_by, created_at")
      .in("organization_id", auth.exportOrgIds)
      .is("deleted_at", null)
      .order("id", { ascending: true });
    query = applyCommonFilters(query, request.filters);
    query = applyOwnerScope(query, auth);
    return query;
  };
  const records = await fetchAllRows(buildLeadsQuery);
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
      decKey,
    ),
    sourceIds.length > 0
      ? admin.from("lead_sources").select("id, name").in("id", sourceIds)
      : Promise.resolve({ data: [], error: null }),
    assignedIds.length > 0
      ? admin.from("anew_users").select("id, name").in("id", assignedIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (sourcesResult.error) throw sourcesResult.error;
  if (usersResult.error) throw usersResult.error;

  const sourceNames = new Map(
    (sourcesResult.data || []).map((s: any) => [s.id, s.name]),
  );
  const userNames = new Map(
    (usersResult.data || []).map((u: any) => [u.id, u.name]),
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

export async function exportQuotes(
  admin: any,
  request: ExportRequest,
  auth: AuthorizationContext,
  includeSensitive: boolean,
  decKey: NifKey | null,
  caller: { anewUserId: string },
) {
  const buildQuotesQuery = () => {
    let query = admin
      .from("quotes")
      .select(
        "id, quote_number, organization_id, entity_id, estado, created_at, total, moeda, modelo_base, obra_endereco, created_by, assigned_to",
      )
      .in("organization_id", auth.exportOrgIds)
      .is("deleted_at", null)
      .order("id", { ascending: true });
    if (request.filters.status) query = query.eq("estado", request.filters.status);
    if (request.filters.dateFrom) query = query.gte("created_at", `${request.filters.dateFrom}T00:00:00`);
    if (request.filters.dateTo) query = query.lte("created_at", `${request.filters.dateTo}T23:59:59.999`);
    if (request.filters.assignedTo === "none") {
      query = query.is("assigned_to", null);
    } else if (request.filters.assignedTo) {
      query = query.eq("assigned_to", request.filters.assignedTo);
    }
    // "onlyMine" always narrows to the caller's own records — this can never
    // widen access beyond whatever applyOwnerScope would already allow, since a
    // caller's own anewUserId is always within their own permitted scope.
    if (request.filters.onlyMine) {
      query = query.or(`created_by.eq.${caller.anewUserId},assigned_to.eq.${caller.anewUserId}`);
    } else {
      query = applyOwnerScope(query, auth);
    }
    return query;
  };
  const records = await fetchAllRows(buildQuotesQuery);
  const [maps, organizationsResult] = await Promise.all([
    resolveIdentityMaps(
      admin,
      records.map((record: any) => record.entity_id),
      includeSensitive,
      decKey,
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

  const searchTerm = request.filters.search?.toLowerCase();

  return records
    .filter((record: any) => {
      if (!searchTerm) return true;
      const quoteNumber = (record.quote_number || "").toLowerCase();
      const clientName = (maps.identity.get(record.entity_id)?.display_name || "").toLowerCase();
      const address = (record.obra_endereco || "").toLowerCase();
      return (
        quoteNumber.includes(searchTerm) ||
        clientName.includes(searchTerm) ||
        address.includes(searchTerm)
      );
    })
    .map((record: any) => ({
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

// Portuguese labels for the portal status stored on client_portal_users /
// derived for contracts — mirrors PortalStatusBadge (src/components/portal/PortalStatusBadge.tsx)
// so the exported text matches what the UI badge shows.
const PORTAL_STATUS_LABELS: Record<string, string> = {
  sent: "Enviado",
  viewed: "Acedido",
  signed: "Assinado",
};

function formatPortalStatus(status: string | null | undefined): string {
  if (!status) return "";
  return PORTAL_STATUS_LABELS[status] || status;
}

export async function exportProposals(
  admin: any,
  request: ExportRequest,
  auth: AuthorizationContext,
) {
  // No column on this module is ever sensitive (see exportConfig.ts), so
  // there is nothing here that depends on includeSensitive/decKey — every
  // field below is already shown in the Proposals.tsx table to anyone with
  // proposals.view.
  const buildProposalsQuery = (idsChunk?: string[]) => {
    let query = admin
      .from("proposals")
      .select(
        "id, title, value, status, valid_until, created_at, created_by, assigned_to, entity_id, deal_id, client_contract_id",
      )
      .in("organization_id", auth.exportOrgIds)
      .is("deleted_at", null)
      .order("id", { ascending: true });
    query = applyCommonFilters(
      query,
      idsChunk ? { ...request.filters, ids: idsChunk } : request.filters,
    );
    query = applyOwnerScope(query, auth);
    return query;
  };
  const records = await fetchScopedRows(buildProposalsQuery, request.filters.ids);
  const proposalIds = records.map((r: any) => r.id);

  const dealIds = Array.from(new Set(records.map((r: any) => r.deal_id).filter(Boolean))) as string[];
  const assignedIds = Array.from(
    new Set(records.map((r: any) => r.assigned_to).filter(Boolean)),
  ) as string[];

  const [dealsResult, usersResult, quoteRows, linkRows, portalUserRows] = await Promise.all([
    dealIds.length > 0
      ? admin.from("deals").select("id, title, entity_id").in("id", dealIds)
      : Promise.resolve({ data: [], error: null }),
    assignedIds.length > 0
      ? admin.from("anew_users").select("id, name").in("id", assignedIds)
      : Promise.resolve({ data: [], error: null }),
    // Whether a proposal has a linked quote — quotes.proposal_id points back
    // at the proposal, same relationship Proposals.tsx reads via
    // `quotes!proposal_id`.
    selectInChunks(proposalIds, (chunk) =>
      admin.from("quotes").select("proposal_id").in("proposal_id", chunk).in(
        "organization_id",
        auth.exportOrgIds,
      ),
    ),
    // pipeline_links carries the authoritative quote_id/contract_id for the
    // "Pipeline" column (same source Proposals.tsx uses via `pipelineLinks`).
    selectInChunks(proposalIds, (chunk) =>
      admin
        .from("pipeline_links")
        .select("proposal_id, quote_id, contract_id")
        .in("proposal_id", chunk)
        .in("organization_id", auth.exportOrgIds),
    ),
    // client_portal_users.portal_status is the same source Proposals.tsx
    // reads for the "Portal" column.
    selectInChunks(proposalIds, (chunk) =>
      admin
        .from("client_portal_users")
        .select("proposal_id, portal_status")
        .in("proposal_id", chunk)
        .in("organization_id", auth.exportOrgIds),
    ),
  ]);
  if (dealsResult.error) throw dealsResult.error;
  if (usersResult.error) throw usersResult.error;

  const deals = new Map<string, any>((dealsResult.data || []).map((d: any) => [d.id, d]));
  const userNames = new Map((usersResult.data || []).map((u: any) => [u.id, u.name]));

  const quoteExistsSet = new Set((quoteRows || []).map((q: any) => q.proposal_id));
  const linkByProposal = new Map((linkRows || []).map((l: any) => [l.proposal_id, l]));
  const portalStatusByProposal = new Map(
    (portalUserRows || []).map((p: any) => [p.proposal_id, p.portal_status]),
  );

  // Client identity: prefer the proposal's own entity_id, fall back to the
  // linked deal's entity_id — same fallback Proposals.tsx uses when
  // resolving `_clientName` for proposals created without one.
  const entityIds = Array.from(
    new Set(
      records
        .map((r: any) => r.entity_id || deals.get(r.deal_id)?.entity_id)
        .filter(Boolean),
    ),
  ) as string[];
  const identityMaps = await resolveIdentityMaps(admin, entityIds, false, null);

  return records.map((record: any) => {
    const effectiveEntityId = record.entity_id || deals.get(record.deal_id)?.entity_id;
    const link = linkByProposal.get(record.id);
    const dealExists = !!record.deal_id;
    const quoteExists = quoteExistsSet.has(record.id) || !!link?.quote_id;
    const contractCreated = !!link?.contract_id || !!record.client_contract_id;
    const pipeline = [
      dealExists ? "Pedido ✓" : "Sem pedido",
      quoteExists ? "Orçamento ✓" : "Sem orçamento",
      contractCreated ? "Contrato ✓" : "Contrato não criado",
    ].join(" · ");
    const portalRaw = record.status === "accepted" ? "signed" : portalStatusByProposal.get(record.id);

    return {
      title: record.title || "",
      client: identityMaps.identity.get(effectiveEntityId)?.display_name || "",
      assignedTo: userNames.get(record.assigned_to) || "",
      deal: deals.get(record.deal_id)?.title || "",
      value: Number(record.value) || 0,
      status: record.status || "",
      validUntil: record.valid_until,
      pipeline,
      portal: formatPortalStatus(portalRaw),
      createdAt: record.created_at,
    };
  });
}

export async function exportContracts(admin: any, request: ExportRequest, auth: AuthorizationContext) {
  // No column on this module is ever sensitive (see exportConfig.ts) — the
  // email column is exported to everyone with client_contracts.export, no
  // dialog, because it's already visible in the ClientContracts.tsx table to
  // anyone with client_contracts.view.
  const buildContractsQuery = (idsChunk?: string[]) => {
    let query = admin
      .from("client_contracts")
      .select(
        "id, contract_number, status, start_date, end_date, total_value, quote_id, entity_id, assigned_to, created_by, updated_at, proposals!client_contracts_proposal_id_fkey(id, title, quotes(id, total))",
      )
      .in("organization_id", auth.exportOrgIds)
      .is("deleted_at", null)
      .order("id", { ascending: true });
    query = applyCommonFilters(
      query,
      idsChunk ? { ...request.filters, ids: idsChunk } : request.filters,
    );
    query = applyOwnerScope(query, auth);
    return query;
  };
  const records = await fetchScopedRows(buildContractsQuery, request.filters.ids);
  const contractIds = records.map((r: any) => r.id);

  const assignedIds = Array.from(
    new Set(records.flatMap((r: any) => [r.assigned_to, r.created_by]).filter(Boolean)),
  ) as string[];
  const entityIds = Array.from(new Set(records.map((r: any) => r.entity_id).filter(Boolean))) as string[];

  const [usersResult, sentDocsRows, identityMaps] = await Promise.all([
    assignedIds.length > 0
      ? admin.from("anew_users").select("id, name").in("id", assignedIds)
      : Promise.resolve({ data: [], error: null }),
    // "sent": this contract was published to the portal — same source
    // ClientContracts.tsx uses for its portal status column.
    selectInChunks(contractIds, (chunk) =>
      admin
        .from("client_portal_documents")
        .select("document_id")
        .in("organization_id", auth.exportOrgIds)
        .eq("document_type", "contract")
        .eq("is_visible", true)
        .in("document_id", chunk),
    ),
    // Email has no sensitive gate for this module (product decision) — always
    // resolved, regardless of the caller's includeSensitive flag/permission.
    resolveIdentityMaps(admin, entityIds, true, null),
  ]);
  if (usersResult.error) throw usersResult.error;

  const userNames = new Map((usersResult.data || []).map((u: any) => [u.id, u.name]));
  const sentIds = (sentDocsRows || []).map((d: any) => d.document_id).filter(Boolean);
  const sentSet = new Set(sentIds);

  // "viewed": an actual "viewed" access-log entry for this document — only
  // meaningful for contracts already sent. client_portal_access_log has no
  // organization_id column, so scoping comes from sentIds already being
  // restricted to this caller's organizations (same pattern ClientContracts.tsx
  // uses).
  let viewedSet = new Set<string>();
  if (sentIds.length > 0) {
    const viewLogRows = await selectInChunks(sentIds, (chunk) =>
      admin
        .from("client_portal_access_log")
        .select("document_id")
        .eq("document_type", "contract")
        .eq("action", "viewed")
        .in("document_id", chunk),
    );
    viewedSet = new Set(viewLogRows.map((d: any) => d.document_id));
  }

  const now = Date.now();

  return records.map((record: any) => {
    const userName = userNames.get(record.assigned_to) || userNames.get(record.created_by) || "";
    const isSigned = record.status === "signed" || record.status === "active";
    const isExpired = record.status === "expired";
    const isDraft = record.status === "draft";

    // Same fallback chain as getEffectiveContractValue (src/utils/contractValue.ts):
    // prefer the linked quote's total (includes the global discount) over the
    // stored total_value.
    let value = Number(record.total_value) || 0;
    if (record.quote_id) {
      const linkedQuote = (record.proposals?.quotes || []).find((q: any) => q.id === record.quote_id);
      if (linkedQuote?.total != null) value = Number(linkedQuote.total);
    }

    let period = "—";
    if (record.start_date) {
      const start = new Date(record.start_date).toLocaleDateString("pt-PT");
      const end = record.end_date ? new Date(record.end_date).toLocaleDateString("pt-PT") : "Indeterminado";
      period = `${start} - ${end}`;
    }

    let progress = "";
    if (record.start_date && record.end_date) {
      const start = new Date(record.start_date).getTime();
      const end = new Date(record.end_date).getTime();
      const total = end - start;
      if (total > 0) {
        const pct = Math.min(100, Math.max(0, Math.round(((now - start) / total) * 100)));
        const daysLeft = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
        progress = `${pct}% · ${daysLeft > 0 ? `${daysLeft} dias` : "Expirado"}`;
      }
    }

    let renewal = "—";
    if (record.end_date) {
      const end = new Date(record.end_date).getTime();
      const daysLeft = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
      renewal = `${daysLeft}d · ${daysLeft <= 0 ? "Expirado" : "Até expirar"}`;
    }

    const sentOrViewed = sentSet.has(record.id) || viewedSet.has(record.id);
    // Mirrors getSignatureBadge (src/pages/ClientContracts.tsx) exactly,
    // including its "✍️" prefix on every branch.
    let signature = "✍️ Não enviado";
    if (isSigned) {
      const date = record.updated_at
        ? new Date(record.updated_at).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" })
        : "";
      signature = `✍️ Assinado ${date}`.trim();
    } else if (record.status === "pending_signature") {
      signature = "✍️ A aguardar assinatura";
    } else if (sentOrViewed) {
      signature = "✍️ Enviado";
    }

    let pipeline = "";
    if (isSigned) pipeline = "Pipeline completo ✅";
    else if (isExpired) pipeline = "Não renovado ❌";
    else if (isDraft) pipeline = "Falta assinar";
    else if (record.status === "pending_signature") pipeline = "Aguarda assinatura";

    let portal = "";
    if (isSigned) portal = formatPortalStatus("signed");
    else if (viewedSet.has(record.id)) portal = formatPortalStatus("viewed");
    else if (sentSet.has(record.id)) portal = formatPortalStatus("sent");

    return {
      number: record.contract_number || "",
      client: identityMaps.identity.get(record.entity_id)?.display_name || "",
      proposal: record.proposals?.title || "",
      value,
      period,
      progress,
      renewal,
      status: record.status || "",
      signature,
      email: identityMaps.email.get(record.entity_id) || "",
      pipeline,
      portal,
      assignedTo: userName,
    };
  });
}

async function updateAudit(admin: any, auditId: string | null, values: Record<string, unknown>) {
  if (!auditId) return;
  const { error } = await admin.from("data_export_audit").update(values).eq("id", auditId);
  if (error) console.error("Failed to update export audit", error.message);
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  const jsonResponse = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
    });

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  // Service-role client — kept ONLY for data_export_audit writes below. The
  // audit trail must be written (and its status/error_code updated) by
  // something the caller cannot adulterate or suppress via their own RLS, so
  // it deliberately does NOT run under the caller's JWT.
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let auditId: string | null = null;
  try {
    const caller = await resolveCallerIdentity(req, admin);
    if (caller.isServiceRole) return jsonResponse({ error: "User session required" }, 403);

    // Caller-scoped client — carries the caller's own JWT, so every read of
    // exported data (org/hierarchy graph, role/permission context used to
    // compute scope, and the six export queries themselves plus their
    // lookups) runs under the caller's real RLS, exactly as the app itself
    // would see it. RLS is the source of truth for visibility; the
    // .export/.export_sensitive permission checks below decide what a
    // visible row is additionally allowed to leave the system as an export.
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      },
    );

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
      auth = await authorizeExport(db, caller, request, definition);
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

    // Only derive the NIF decryption key when it will actually be used —
    // avoids a hard dependency on NIF_ENC_KEY for exports that never touch
    // sensitive columns.
    let decKey: NifKey | null = null;
    if (includeSensitive) {
      try {
        decKey = deriveKeyFromEnv("NIF_ENC_KEY", "AES-GCM");
      } catch (keyError) {
        console.error(
          "export-data: failed to derive NIF decryption key:",
          keyError instanceof Error ? keyError.message : keyError,
        );
        await captureError(keyError, { function: "export-data", stage: "derive-nif-key" });
      }
    }

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
        ? await exportClients(db, request, auth, includeSensitive, decKey)
        : request.module === "contacts"
          ? await exportContacts(db, request, auth, includeSensitive, decKey)
          : request.module === "leads"
            ? await exportLeads(db, request, auth, includeSensitive, decKey)
            : request.module === "proposals"
              ? await exportProposals(db, request, auth)
              : request.module === "client_contracts"
                ? await exportContracts(db, request, auth)
                : await exportQuotes(db, request, auth, includeSensitive, decKey, caller);

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
    await captureError(error, { function: "export-data" });
    await updateAudit(admin, auditId, {
      status: "failed",
      error_code: "INTERNAL_ERROR",
      completed_at: new Date().toISOString(),
    });
    const message = error instanceof Error ? error.message : "";
    if (message === "INVALID_REQUEST" || message === "Unsupported export module") {
      return jsonResponse({ error: "Invalid export request" }, 400);
    }
    if (message === "SELECTION_TOO_LARGE") {
      return jsonResponse(
        { error: `A seleção excede o máximo de ${MAX_SELECTION_IDS} itens por exportação.` },
        400,
      );
    }
    if (message.includes("Authorization") || message.includes("token")) {
      return jsonResponse({ error: "Authentication required" }, 401);
    }
    return jsonResponse({ error: "Unable to generate export" }, 500);
  }
});
