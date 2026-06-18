/**
 * Canonical resolver for `quotes.assigned_to`.
 *
 * Returns the `anew_users.id` that should own a quote based on the entity it is
 * linked to. The contact/lead/client owner is canonical; the only legitimate
 * exception is a manual choice in the "Comercial" dropdown (handled in
 * QuoteBuilder via the `assignedToTouched` flag).
 *
 * Priority chain:
 *   1. Deal → first non-null owner from: lead → contact → client → deal itself
 *   2. Client (anew_clients.assigned_to || created_by)
 *   3. Entity within org → client → contact → most recent lead
 *   4. Fallback (typically the logged-in user)
 *
 * IMPORTANT: all returned ids are `anew_users.id`, never `auth.uid()`.
 */

type SupabaseLike = {
  from: (table: string) => any;
};

export interface ResolveQuoteAssignedToArgs {
  supabase: SupabaseLike;
  dealId?: string | null;
  entityId?: string | null;
  clienteId?: string | null;
  organizationId?: string | null;
  fallbackUserId?: string | null;
}

const pickOwner = (row: any): string | null =>
  (row?.assigned_to as string | null) || (row?.created_by as string | null) || null;

export async function resolveQuoteAssignedTo({
  supabase,
  dealId,
  entityId,
  clienteId,
  organizationId,
  fallbackUserId,
}: ResolveQuoteAssignedToArgs): Promise<string | null> {
  // 1) Deal: lead → contact → client → deal
  if (dealId) {
    try {
      const { data: deal } = await supabase
        .from("deals")
        .select("assigned_to, created_by, lead_id, contact_id, client_id")
        .eq("id", dealId)
        .maybeSingle();

      if (deal) {
        if (deal.lead_id) {
          const { data } = await supabase
            .from("anew_leads")
            .select("assigned_to, created_by")
            .eq("id", deal.lead_id)
            .maybeSingle();
          const owner = pickOwner(data);
          if (owner) return owner;
        }
        if (deal.contact_id) {
          const { data } = await supabase
            .from("anew_contacts")
            .select("assigned_to, created_by")
            .eq("id", deal.contact_id)
            .maybeSingle();
          const owner = pickOwner(data);
          if (owner) return owner;
        }
        if (deal.client_id) {
          const { data } = await supabase
            .from("anew_clients")
            .select("assigned_to, created_by")
            .eq("id", deal.client_id)
            .maybeSingle();
          const owner = pickOwner(data);
          if (owner) return owner;
        }
        const dealOwner = pickOwner(deal);
        if (dealOwner) return dealOwner;
      }
    } catch (e) {
      console.warn("[resolveQuoteAssignedTo] deal branch failed", e);
    }
  }

  // 2) Client
  if (clienteId) {
    try {
      const { data } = await supabase
        .from("anew_clients")
        .select("assigned_to, created_by")
        .eq("id", clienteId)
        .maybeSingle();
      const owner = pickOwner(data);
      if (owner) return owner;
    } catch (e) {
      console.warn("[resolveQuoteAssignedTo] client branch failed", e);
    }
  }

  // 3) Entity within organization → client → contact → most recent lead
  if (entityId && organizationId) {
    try {
      const { data: client } = await supabase
        .from("anew_clients")
        .select("assigned_to, created_by")
        .eq("entity_id", entityId)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .maybeSingle();
      const cOwner = pickOwner(client);
      if (cOwner) return cOwner;
    } catch (e) {
      console.warn("[resolveQuoteAssignedTo] entity→client failed", e);
    }
    try {
      const { data: contact } = await supabase
        .from("anew_contacts")
        .select("assigned_to, created_by")
        .eq("entity_id", entityId)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .maybeSingle();
      const cOwner = pickOwner(contact);
      if (cOwner) return cOwner;
    } catch (e) {
      console.warn("[resolveQuoteAssignedTo] entity→contact failed", e);
    }
    try {
      const { data: leads } = await supabase
        .from("anew_leads")
        .select("assigned_to, created_by, created_at")
        .eq("entity_id", entityId)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1);
      const lead = Array.isArray(leads) ? leads[0] : null;
      const lOwner = pickOwner(lead);
      if (lOwner) return lOwner;
    } catch (e) {
      console.warn("[resolveQuoteAssignedTo] entity→lead failed", e);
    }
  }

  // 4) Fallback
  return fallbackUserId || null;
}
