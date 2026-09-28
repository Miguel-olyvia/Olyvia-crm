// Resolve o COMERCIAL DONO de um documento (proposta, orcamento, contrato) para
// ser ele o remetente visivel ("De:") do email. NAO serve para auditoria: quem
// enviou de facto continua a ser quem clicou (proposal_sends/quote_sends/
// contract_sends/email_logs.sent_by). Sem dono valido -> null (o caller e o
// fallback, nunca um erro).

export type OwnerDocKind = "proposal" | "quote" | "contract";

export interface DocumentOwner {
  anewUserId: string;      // anew_users.id (id de negocio)
  authUserId: string;      // anew_users.auth_user_id (para resolveSmtpForAuthenticatedUser)
  displayName: string | null;
}

const MAX_CANDIDATES = 12;

async function loadRow(supabase: any, table: string, cols: string, id: string | null, orgId: string) {
  if (!id) return null;
  const { data, error } = await supabase.from(table).select(cols)
    .eq("id", id).eq("organization_id", orgId).maybeSingle();
  if (error) { console.error(`[documentOwnerSender] ${table} ${id}:`, error.message); return null; }
  return data ?? null;
}

async function dealCandidates(supabase: any, dealId: string | null, orgId: string): Promise<(string | null)[]> {
  const deal = await loadRow(supabase, "deals", "assigned_to, created_by", dealId, orgId);
  return deal ? [deal.assigned_to, deal.created_by] : [];
}

async function proposalCandidates(supabase: any, proposalId: string | null, orgId: string) {
  const p = await loadRow(supabase, "proposals", "assigned_to, deal_id", proposalId, orgId);
  if (!p) return [];
  return [p.assigned_to, ...(await dealCandidates(supabase, p.deal_id, orgId))];
}

async function quoteCandidates(supabase: any, quoteId: string | null, orgId: string) {
  const q = await loadRow(supabase, "quotes", "assigned_to, deal_id, proposal_id", quoteId, orgId);
  if (!q) return [];
  return [
    q.assigned_to,
    ...(await dealCandidates(supabase, q.deal_id, orgId)),
    ...(await proposalCandidates(supabase, q.proposal_id, orgId)),
  ];
}

async function contractCandidates(supabase: any, contractId: string | null, orgId: string) {
  // client_contracts NAO tem deal_id — nao pedir essa coluna.
  const c = await loadRow(supabase, "client_contracts", "assigned_to, proposal_id, quote_id", contractId, orgId);
  if (!c) return [];
  return [
    c.assigned_to,
    ...(await proposalCandidates(supabase, c.proposal_id, orgId)),
    ...(await quoteCandidates(supabase, c.quote_id, orgId)),
  ];
}

/** Um candidato so vale se tiver login (auth_user_id) e membership ACTIVA na org do documento. */
async function validateCandidate(supabase: any, anewUserId: string, orgId: string): Promise<DocumentOwner | null> {
  const { data: user } = await supabase.from("anew_users")
    .select("id, auth_user_id, display_name").eq("id", anewUserId).maybeSingle();
  if (!user?.auth_user_id) return null;
  const { data: membership } = await supabase.from("anew_memberships")
    .select("id").eq("user_id", anewUserId).eq("organization_id", orgId).eq("status", "active")
    .limit(1).maybeSingle();
  if (!membership) return null;
  return { anewUserId: user.id, authUserId: user.auth_user_id, displayName: user.display_name ?? null };
}

export async function resolveDocumentOwner(
  supabase: any, kind: OwnerDocKind, documentId: string, organizationId: string | null,
): Promise<DocumentOwner | null> {
  if (!documentId || !organizationId) return null;
  try {
    const raw = kind === "proposal" ? await proposalCandidates(supabase, documentId, organizationId)
      : kind === "quote" ? await quoteCandidates(supabase, documentId, organizationId)
      : await contractCandidates(supabase, documentId, organizationId);
    const seen = new Set<string>();
    const ordered = raw.filter((id): id is string => !!id && !seen.has(id) && !!seen.add(id)).slice(0, MAX_CANDIDATES);
    for (const id of ordered) {
      const owner = await validateCandidate(supabase, id, organizationId);
      if (owner) return owner;
    }
    return null;
  } catch (e) {
    console.error("[documentOwnerSender] resolve failed", e instanceof Error ? e.message : e);
    return null; // nunca bloquear um envio por causa disto
  }
}
