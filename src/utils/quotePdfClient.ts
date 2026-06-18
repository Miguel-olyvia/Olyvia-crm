import { supabase } from "@/integrations/supabase/client";

type QuotePdfClientInput = {
  entityId?: string | null;
  dealId?: string | null;
  proposalId?: string | null;
  clienteId?: string | null;
  clientId?: string | null;
  contactId?: string | null;
  leadId?: string | null;
};

const firstValue = <T,>(rows: T[] | null | undefined): T | null => rows?.[0] ?? null;

async function resolveLinkedEntity(table: "anew_leads" | "anew_contacts" | "anew_clients", id?: string | null) {
  if (!id) return null;
  const { data } = await (supabase as any)
    .from(table)
    .select("entity_id")
    .eq("id", id)
    .maybeSingle();

  return data?.entity_id || null;
}

async function resolveDealEntity(dealId?: string | null) {
  if (!dealId) return null;
  const { data: deal } = await (supabase as any)
    .from("deals")
    .select("entity_id, lead_id, contact_id, client_id")
    .eq("id", dealId)
    .maybeSingle();

  if (deal?.entity_id) return deal.entity_id;
  return (
    await resolveLinkedEntity("anew_leads", deal?.lead_id)
    || await resolveLinkedEntity("anew_contacts", deal?.contact_id)
    || await resolveLinkedEntity("anew_clients", deal?.client_id)
  );
}

export async function resolveQuotePdfEntityId(input: QuotePdfClientInput) {
  if (input.entityId) return input.entityId;

  const fromDeal = await resolveDealEntity(input.dealId);
  if (fromDeal) return fromDeal;

  if (input.proposalId) {
    const { data: proposal } = await (supabase as any)
      .from("proposals")
      .select("entity_id, client_id, deal_id")
      .eq("id", input.proposalId)
      .maybeSingle();

    if (proposal?.entity_id) return proposal.entity_id;

    const fromProposalDeal = await resolveDealEntity(proposal?.deal_id);
    if (fromProposalDeal) return fromProposalDeal;

    const fromProposalClient = await resolveLinkedEntity("anew_clients", proposal?.client_id);
    if (fromProposalClient) return fromProposalClient;
  }

  return (
    await resolveLinkedEntity("anew_leads", input.leadId)
    || await resolveLinkedEntity("anew_contacts", input.contactId)
    || await resolveLinkedEntity("anew_clients", input.clientId || input.clienteId)
  );
}

async function buildEntityClientForPdf(entityId: string) {
  const [entityRes, emailsRes, phonesRes, fiscalRes, addressesRes] = await Promise.all([
    (supabase as any).from("anew_entities").select("id, display_name, first_name, last_name, type").eq("id", entityId).maybeSingle(),
    (supabase as any).from("anew_entity_emails").select("email").eq("entity_id", entityId).eq("is_primary", true).limit(1),
    (supabase as any).from("anew_entity_phones").select("phone_number, country_code").eq("entity_id", entityId).eq("is_primary", true).limit(1),
    (supabase as any).from("anew_entity_fiscal_entities").select("fiscal_entity_id").eq("entity_id", entityId).eq("is_primary", true).limit(1),
    (supabase as any).from("anew_entity_addresses").select("address_id, is_primary, anew_addresses(*)").eq("entity_id", entityId),
  ]);

  const entity = entityRes.data;
  if (!entity) return null;

  let vat = "";
  const fiscalLink = firstValue<any>(fiscalRes.data);
  if (fiscalLink?.fiscal_entity_id) {
    const { data: fiscalEntity } = await (supabase as any)
      .from("fiscal_entities")
      .select("nif")
      .eq("id", fiscalLink.fiscal_entity_id)
      .maybeSingle();
    vat = fiscalEntity?.nif || "";
  }

  const displayName = entity.display_name || [entity.first_name, entity.last_name].filter(Boolean).join(" ");
  const clientAddresses = (addressesRes.data || []).map((ea: any) => ({
    street: ea.anew_addresses?.street || "",
    number: ea.anew_addresses?.number || "",
    postal_code: ea.anew_addresses?.postal_code || "",
    city: ea.anew_addresses?.city || "",
    municipality: ea.anew_addresses?.district || "",
    district: ea.anew_addresses?.district || "",
    is_primary: ea.is_primary || false,
  }));

  return {
    display_name: displayName,
    first_name: entity.first_name || (entity.type === "company" ? "" : displayName),
    last_name: entity.last_name || "",
    company_name: entity.type === "company" ? displayName : "",
    client_type: entity.type === "company" ? "company" : "individual",
    email: firstValue<any>(emailsRes.data)?.email || "",
    phone: firstValue<any>(phonesRes.data)?.phone_number || "",
    phone_country_code: firstValue<any>(phonesRes.data)?.country_code || "",
    vat,
    client_addresses: clientAddresses,
    contact_addresses: clientAddresses,
  };
}

export async function resolveQuotePdfClient(input: QuotePdfClientInput) {
  const entityId = await resolveQuotePdfEntityId(input);
  if (entityId) {
    return { entityId, client: await buildEntityClientForPdf(entityId) };
  }
  return { entityId: null, client: null };
}