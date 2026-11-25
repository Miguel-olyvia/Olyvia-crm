import { getEntityDisplayName, type EntityNameSource } from "@/lib/entityDisplayName";

/**
 * Cliente da ficha de uma proposta, a partir do contacto devolvido por
 * `resolve_proposal_contact`. O nome sai SEMPRE de `getEntityDisplayName`
 * (display_name da ficha primeiro), seja a ficha `person` ou `organization`.
 */
export interface ProposalClient extends EntityNameSource {
  id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  email: string | null;
  phone: string | null;
}

export interface ProposalContactRow extends EntityNameSource {
  entity_id: string;
  entity_type?: string | null;
  email?: string | null;
  phone_number?: string | null;
}

export function mapProposalContactToClient(contact: ProposalContactRow): ProposalClient {
  return {
    id: contact.entity_id,
    first_name: contact.first_name ?? null,
    last_name: contact.last_name ?? null,
    display_name: contact.display_name ?? null,
    email: contact.email || null,
    phone: contact.phone_number || null,
  };
}

/**
 * Nomes da lista de propostas por entidade, a partir de `get_entity_contact_summary`
 * (uma linha por ficha visivel). Mesma regra de nome que a ficha e o PDF.
 */
export function buildEntityNameMap(
  rows: ReadonlyArray<(EntityNameSource & { entity_id?: string | null }) | null | undefined> | null | undefined,
): Record<string, string> {
  const map: Record<string, string> = {};
  (rows || []).forEach((row) => {
    if (!row?.entity_id) return;
    map[row.entity_id] = getEntityDisplayName(row);
  });
  return map;
}
