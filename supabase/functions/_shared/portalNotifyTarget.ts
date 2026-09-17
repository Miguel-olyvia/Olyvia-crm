/**
 * Shared helper: resolve WHO to notify (and in WHICH organization) for a portal
 * action, anchored on the DOCUMENT being acted on — never on an arbitrary
 * portal-user row.
 *
 * Why this exists: a single login can be a portal client in several
 * organizations, so it has several `client_portal_users` rows. Keying the
 * commercial + organization off one such row picked by `auth_user_id` alone
 * (`limit(1)`) returns an arbitrary org's row, which sent the "signed"
 * notification to the wrong company's commercial, in the wrong organization.
 *
 * The organization is always the document's own `organization_id`, and the
 * commercial is resolved WITHIN that organization, in this order:
 *   1. the document's assigned commercial (proposals/quotes/contracts.assigned_to)
 *   2. else the responsible for that entity in that organization
 *      (anew_clients.assigned_to for entity_id + organization_id)
 *   3. else the deal's assigned commercial
 *   4. else whoever created the document (a CRM user of that same org)
 */

export type NotifyColumn = "proposal_id" | "quote_id" | "contract_id";

export type NotifyTarget = { orgId: string | null; commercialAuthId: string | null };

const TABLE_FOR: Record<NotifyColumn, string> = {
  proposal_id: "proposals",
  quote_id: "quotes",
  contract_id: "client_contracts",
};

async function toAuthId(supabase: any, internalId: string | null): Promise<string | null> {
  if (!internalId) return null;
  const { data } = await supabase
    .from("anew_users")
    .select("auth_user_id")
    .eq("id", internalId)
    .maybeSingle();
  return data?.auth_user_id || null;
}

export async function resolveNotifyTarget(
  supabase: any,
  column: NotifyColumn,
  id: string,
): Promise<NotifyTarget> {
  const table = TABLE_FOR[column];
  const { data: doc, error: docError } = await supabase
    .from(table)
    .select("assigned_to, entity_id, organization_id, created_by, deal_id")
    .eq("id", id)
    .maybeSingle();

  // Distinguish a real lookup failure from a genuinely missing document: both
  // end up resolving to null (and skipping the notification), but a transient DB
  // error dropping a "signed" alert must leave a trace instead of vanishing.
  if (docError) {
    console.error(`[portalNotifyTarget] failed to load ${table} ${id}:`, docError.message);
  }

  const orgId: string | null = doc?.organization_id ?? null;
  let commercialInternalId: string | null = doc?.assigned_to ?? null;

  // 2) Responsible for this entity IN THIS organization
  if (!commercialInternalId && doc?.entity_id && orgId) {
    const { data: client } = await supabase
      .from("anew_clients")
      .select("assigned_to")
      .eq("entity_id", doc.entity_id)
      .eq("organization_id", orgId)
      .maybeSingle();
    commercialInternalId = client?.assigned_to ?? null;
  }

  // 3) Deal's assigned commercial — scoped to the document's own organization,
  // so a deal_id that (wrongly) points across organizations can never resolve a
  // commercial from another org. This is the same unverified cross-org
  // assumption that caused the original mis-routed notification.
  if (!commercialInternalId && doc?.deal_id && orgId) {
    const { data: deal } = await supabase
      .from("deals")
      .select("assigned_to")
      .eq("id", doc.deal_id)
      .eq("organization_id", orgId)
      .maybeSingle();
    commercialInternalId = deal?.assigned_to ?? null;
  }

  // 4) Whoever created the document (a CRM user of the same org)
  if (!commercialInternalId) {
    commercialInternalId = doc?.created_by ?? null;
  }

  return { orgId, commercialAuthId: await toAuthId(supabase, commercialInternalId) };
}
