import { supabase } from "@/integrations/supabase/client";
import { callNifRevealSingle } from "@/lib/nif/callNifReveal";

type QuotePdfClientInput = {
  entityId?: string | null;
  quoteId?: string | null;
  dealId?: string | null;
  proposalId?: string | null;
  clienteId?: string | null;
  clientId?: string | null;
  contactId?: string | null;
  leadId?: string | null;
};

type EntityAddressLink = { is_primary?: boolean | null; valid_to?: string | null; created_at?: string | null };

/**
 * Ordena as ligacoes entidade-morada: activas (sem valid_to) primeiro, depois
 * primarias, depois a mais recente. Pura e sem mutar a entrada.
 */
export function sortEntityAddressLinks<T extends EntityAddressLink>(links: T[] | null | undefined): T[] {
  const time = (v?: string | null) => (v ? new Date(v).getTime() || 0 : 0);
  return [...(links || [])].sort((a, b) =>
    (Number(!b.valid_to) - Number(!a.valid_to))
    || (Number(!!b.is_primary) - Number(!!a.is_primary))
    || (time(b.created_at) - time(a.created_at))
  );
}

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

async function buildEntityClientForPdf(entityId: string, quoteId?: string | null) {
  const [entityRes, emailsRes, phonesRes, fiscalRes, addressesRes] = await Promise.all([
    (supabase as any).from("anew_entities").select("id, display_name, first_name, last_name, type").eq("id", entityId).maybeSingle(),
    (supabase as any).from("anew_entity_emails").select("email").eq("entity_id", entityId).order("is_primary", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1),
    (supabase as any).from("anew_entity_phones").select("phone_number, country_code").eq("entity_id", entityId).order("is_primary", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1),
    (supabase as any).from("anew_entity_fiscal_entities").select("fiscal_entity_id").eq("entity_id", entityId).eq("is_primary", true).limit(1),
    (supabase as any).from("anew_entity_addresses").select("address_id, is_primary, address_type, valid_to, created_at, anew_addresses(*)").eq("entity_id", entityId),
  ]);

  const entity = entityRes.data;
  if (!entity) return null;

  // Contacto primario PELO documento quando o orcamento ja existe: a RLS de
  // ambito de dono nos contactos nega a 2a consulta directa a
  // anew_entity_emails/phones a quem ve o documento mas nao e dono da lead. A
  // RPC SECURITY DEFINER confirma a visibilidade do orcamento e devolve
  // email/telefone primarios. Sem quoteId (pre-visualizacao de um rascunho
  // ainda por gravar) mantem-se a leitura directa, limitada ao ambito de quem
  // esta a criar. (O NIF nao viaja na RPC e fica na leitura directa.)
  let contactEmail = firstValue<any>(emailsRes.data)?.email || "";
  let contactPhone = firstValue<any>(phonesRes.data)?.phone_number || "";
  let contactCountryCode = firstValue<any>(phonesRes.data)?.country_code || "";
  let rpcClientAddresses: any[] | null = null;
  if (quoteId) {
    const { data: contact } = await (supabase as any)
      .rpc("resolve_quote_contact", { _quote_id: quoteId })
      .maybeSingle();
    if (contact) {
      contactEmail = contact.email || "";
      contactPhone = contact.phone_number || "";
      contactCountryCode = contact.country_code || "";
    }
    // Morada PELO documento, pela mesma razao (RLS de ambito de dono). Se a RPC
    // devolver linhas (ja activas, nao-entrega, ordenadas) usam-se; se devolver
    // vazio/null ou der erro, cai na leitura directa: quem e dono da lead le a
    // morada por ai (nunca fica pior) e quem nao e so ganha com a RPC. O erro
    // regista-se.
    const { data: rpcAddresses, error: addressError } = await (supabase as any)
      .rpc("resolve_quote_address", { _quote_id: quoteId });
    if (addressError) {
      console.error("resolve_quote_address falhou; a usar a leitura directa das moradas", addressError);
    } else if (Array.isArray(rpcAddresses) && rpcAddresses.length > 0) {
      rpcClientAddresses = (rpcAddresses as any[]).map((row: any) => ({
        street: row.street || "",
        number: row.number || "",
        postal_code: row.postal_code || "",
        city: row.city || "",
        municipality: row.district || "",
        district: row.district || "",
        is_primary: row.is_primary || false,
      }));
    }
  }

  let vat = "";
  const fiscalLink = firstValue<any>(fiscalRes.data);
  if (fiscalLink?.fiscal_entity_id) {
    vat = (await callNifRevealSingle(fiscalLink.fiscal_entity_id)) || "";
  }

  const displayName = entity.display_name || [entity.first_name, entity.last_name].filter(Boolean).join(" ");
  // "Morada" do cliente no PDF = morada fiscal (principal): ficam de fora as
  // moradas de entrega e as ligações já fechadas — senão, sem principal, o
  // fallback "primeira da lista" podia apanhar uma morada de entrega.
  const agora = Date.now();
  const clientAddresses = rpcClientAddresses ?? sortEntityAddressLinks(addressesRes.data as any[])
    .filter((ea: any) => ea.address_type !== "delivery" && (!ea.valid_to || new Date(ea.valid_to).getTime() > agora))
    .map((ea: any) => ({
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
    email: contactEmail,
    phone: contactPhone,
    phone_country_code: contactCountryCode,
    vat,
    client_addresses: clientAddresses,
    contact_addresses: clientAddresses,
  };
}

export async function resolveQuotePdfClient(input: QuotePdfClientInput) {
  const entityId = await resolveQuotePdfEntityId(input);
  if (entityId) {
    return { entityId, client: await buildEntityClientForPdf(entityId, input.quoteId ?? null) };
  }
  return { entityId: null, client: null };
}