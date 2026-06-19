/**
 * L2 — Pre-insert duplicate detection for the "no identifier" case.
 *
 * When the user creates a lead WITHOUT email/phone/vat, we cannot dedupe by
 * identity. The only signal is `display_name`. To avoid creating an orphan
 * entity in the case where a duplicate exists, this helper performs a
 * name-based search BEFORE the entity insert. If matches are found, the
 * caller opens the DuplicateEntityDialog and aborts.
 *
 * The implementation mirrors the name-based fallback that already runs
 * post-insert in AnewLeads.tsx (around line 2384). Moving the same check
 * earlier — only for the empty-identifier case — gives us a safety net
 * without changing behaviour when email/phone/vat are present.
 */

export interface NameDupCheckClient {
  searchEntitiesByName: (
    name: string,
    limit: number,
  ) => Promise<Array<{ id: string }>>;
  findLeadsByEntityIds: (
    entityIds: string[],
    organizationId: string,
  ) => Promise<any[]>;
  findContactsByEntityIds: (
    entityIds: string[],
    organizationId: string,
  ) => Promise<any[]>;
  findClientsByEntityIds: (
    entityIds: string[],
    organizationId: string,
  ) => Promise<any[]>;
}

export interface NameDupResult {
  hasDuplicates: boolean;
  matchedEntityIds: string[];
  leads: any[];
  contacts: any[];
  clients: any[];
}

export async function checkNameDuplicatesBeforeInsert(
  displayName: string,
  organizationId: string,
  client: NameDupCheckClient,
): Promise<NameDupResult> {
  const empty: NameDupResult = {
    hasDuplicates: false,
    matchedEntityIds: [],
    leads: [],
    contacts: [],
    clients: [],
  };

  const normalized = displayName.trim().toLowerCase();
  if (!normalized || normalized === "lead sem nome") return empty;

  const entities = await client.searchEntitiesByName(normalized, 20);
  const ids = entities.map((e) => e.id).filter(Boolean);
  if (ids.length === 0) return empty;

  const [leads, contacts, clients] = await Promise.all([
    client.findLeadsByEntityIds(ids, organizationId),
    client.findContactsByEntityIds(ids, organizationId),
    client.findClientsByEntityIds(ids, organizationId),
  ]);

  return {
    hasDuplicates: leads.length + contacts.length + clients.length > 0,
    matchedEntityIds: ids,
    leads,
    contacts,
    clients,
  };
}
