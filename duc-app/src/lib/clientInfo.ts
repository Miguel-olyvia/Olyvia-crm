import { supabase } from "./supabase";
import { entityDisplayName } from "./names";

/** Uma linha do orçamento vendido → alimenta o âmbito ("o que foi VENDIDO") do DUC. */
export interface ScopeLine {
  label: string;
  description: string;
  qty: string;
  unit: string;
}

export interface ClientOlyviaInfo {
  entityId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  nif: string | null;
  responsavel: string | null;
  dataAdjudicacao: string | null; // yyyy-mm-dd
  dataFim: string | null; // yyyy-mm-dd (fim de vigência)
  valor: string | null;
  condicoes: string | null;
  contractNumber: string | null;
  /** Linhas do orçamento assinado (produtos/serviços vendidos). */
  scopeLines: ScopeLine[];
}

function fmtDate(v: unknown): string | null {
  if (!v || typeof v !== "string") return null;
  return v.slice(0, 10);
}

/** Busca os dados do cliente que já existem na Olyvia (entidade, contactos, contrato). */
export async function fetchClientOlyviaInfo(clientId: string): Promise<ClientOlyviaInfo | null> {
  const { data: client } = await supabase
    .from("anew_clients")
    .select("entity_id, assigned_to")
    .eq("id", clientId)
    .maybeSingle();
  const entityId = (client?.entity_id as string) ?? null;
  if (!entityId) return null;

  const assignedTo = (client?.assigned_to as string) ?? null;

  const [entRes, emailRes, phoneRes, addrRes, userRes, contractRes] = await Promise.all([
    supabase.from("anew_entities").select("*").eq("id", entityId).maybeSingle(),
    supabase
      .from("anew_entity_emails")
      .select("email, is_primary")
      .eq("entity_id", entityId)
      .order("is_primary", { ascending: false })
      .limit(1),
    supabase
      .from("anew_entity_phones")
      .select("phone_number, is_primary")
      .eq("entity_id", entityId)
      .order("is_primary", { ascending: false })
      .limit(1),
    supabase
      .from("anew_entity_addresses")
      .select("*")
      .eq("entity_id", entityId)
      .order("is_primary", { ascending: false })
      .limit(1),
    assignedTo
      ? supabase.from("anew_users").select("name").eq("id", assignedTo).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("client_contracts")
      .select("contract_number, proposal_id, total_value, currency, payment_terms, start_date, end_date, signature_date, status")
      .eq("client_id", clientId)
      .in("status", ["signed", "active"])
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const ent = entRes.data as Record<string, unknown> | null;
  const name = ent
    ? entityDisplayName({
        display_name: ent.display_name as string | null,
        first_name: ent.first_name as string | null,
        last_name: ent.last_name as string | null,
      })
    : "Cliente";
  // NIF só se for mesmo um NIF (9 dígitos) — evita mostrar hashes/valores protegidos.
  const rawNif =
    (ent?.vat as string) ||
    (ent?.nif as string) ||
    (ent?.tax_number as string) ||
    (ent?.fiscal_number as string) ||
    "";
  const nif = /^\d{9}$/.test((rawNif ?? "").trim()) ? rawNif.trim() : null;
  const email = (emailRes.data?.[0]?.email as string) ?? null;
  const phone = (phoneRes.data?.[0]?.phone_number as string) ?? null;
  const responsavel = ((userRes.data as { name?: string } | null)?.name as string) ?? null;

  let address: string | null = null;
  const a = addrRes.data?.[0] as Record<string, unknown> | undefined;
  if (a) {
    const street = (a.street as string) || (a.address_line1 as string) || (a.address as string) || "";
    const number = (a.number as string) || "";
    const postal = (a.postal_code as string) || (a.zip_code as string) || "";
    const city = (a.city as string) || (a.locality as string) || "";
    const line1 = [street, number].filter(Boolean).join(" ").trim();
    const line2 = [postal, city].filter(Boolean).join(" ").trim();
    address = [line1, line2].filter(Boolean).join(", ") || null;
  }

  const contract = contractRes.data?.[0] as Record<string, unknown> | undefined;
  let valor: string | null = null;
  let condicoes: string | null = null;
  let dataAdjudicacao: string | null = null;
  let dataFim: string | null = null;
  let contractNumber: string | null = null;
  let proposalId: string | null = null;
  if (contract) {
    const total = contract.total_value != null ? Number(contract.total_value) : null;
    const currency = (contract.currency as string) || "EUR";
    if (total != null && !Number.isNaN(total)) {
      valor = `${total.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} ${currency}`;
    }
    condicoes = (contract.payment_terms as string) || null;
    dataAdjudicacao = fmtDate(contract.signature_date) || fmtDate(contract.start_date);
    dataFim = fmtDate(contract.end_date);
    contractNumber = (contract.contract_number as string) || null;
    proposalId = (contract.proposal_id as string) || null;
  }

  // Puxa as linhas do orçamento assinado (o que foi VENDIDO) a partir da proposta
  // ligada ao contrato → quotes → quote_lines. Alimenta o âmbito do DUC.
  const scopeLines: ScopeLine[] = [];
  if (proposalId) {
    const { data: quoteRows } = await supabase
      .from("quotes")
      .select("id")
      .eq("proposal_id", proposalId);
    const quoteIds = (quoteRows ?? []).map((q) => q.id as string).filter(Boolean);
    if (quoteIds.length > 0) {
      const { data: lineRows } = await supabase
        .from("quote_lines")
        .select("descricao_snapshot, item_description, qt, unidade, section_name, ordem")
        .in("quote_id", quoteIds)
        .order("ordem", { ascending: true });
      (lineRows ?? []).forEach((l) => {
        const label =
          (l.descricao_snapshot as string) || (l.section_name as string) || "";
        if (!label.trim()) return;
        scopeLines.push({
          label: label.trim(),
          description: (l.item_description as string) || "",
          qty: l.qt != null ? String(l.qt) : "",
          unit: (l.unidade as string) || "",
        });
      });
    }
  }

  return {
    entityId,
    name,
    email,
    phone,
    address,
    nif,
    responsavel,
    dataAdjudicacao,
    dataFim,
    valor,
    condicoes,
    contractNumber,
    scopeLines,
  };
}

/** Mapeia os dados da Olyvia para os campos dos blocos do DUC. */
export function prefillBlocksFromInfo(
  info: ClientOlyviaInfo
): Record<string, Record<string, string>> {
  const faturacao = [info.name, info.nif ? `NIF: ${info.nif}` : null, info.address]
    .filter(Boolean)
    .join("\n");

  const comercial: Record<string, string> = { cliente_ref: info.name };
  comercial.contacto_nome = info.name;
  if (info.phone) comercial.contacto_tel = info.phone;
  if (info.email) comercial.contacto_email = info.email;
  if (info.address) comercial.morada_obra = info.address;
  if (info.responsavel) comercial.comercial_responsavel = info.responsavel;
  if (info.dataAdjudicacao) comercial.data_adjudicacao = info.dataAdjudicacao;
  if (info.valor) comercial.valor_mensal_anual = info.valor;

  const financeiro: Record<string, string> = {};
  if (faturacao) financeiro.nif_dados_faturacao = faturacao;
  if (info.condicoes) financeiro.condicoes_faseamento = info.condicoes;

  const entrega: Record<string, string> = { cliente: info.name };
  if (info.address) entrega.morada = info.address;
  if (info.dataAdjudicacao) entrega.data_inicio = info.dataAdjudicacao;
  if (info.dataFim) entrega.data_entrega = info.dataFim;
  if (info.contractNumber) entrega.obra_ref = info.contractNumber;

  return { comercial, financeiro, entrega };
}

/**
 * Constrói as linhas de âmbito ("o que foi VENDIDO") para a secção `scope` a
 * partir das linhas do orçamento assinado. A UI só as usa quando a secção ainda
 * está vazia (não sobrepõe itens já editados/guardados).
 */
export function prefillScopeItemsFromInfo(info: ClientOlyviaInfo): ScopeLine[] {
  return info.scopeLines;
}

/**
 * Linhas do orçamento para a **lista de materiais** (Armazém) — mesma origem do
 * âmbito (o que foi vendido), com quantidade/unidade para o picking. A UI só as
 * usa se a etapa tiver a secção `material` e ainda estiver vazia.
 */
export function prefillMaterialItemsFromInfo(info: ClientOlyviaInfo): ScopeLine[] {
  return info.scopeLines;
}

/**
 * Linhas do orçamento para o **mapa de serviços contratados** (variante BMG ·
 * contrato). Mesma origem; a UI só as usa se a etapa tiver a secção
 * `service_map` e ainda estiver vazia.
 */
export function prefillServiceItemsFromInfo(info: ClientOlyviaInfo): ScopeLine[] {
  return info.scopeLines;
}

/** Funde os valores de pré-preenchimento apenas em campos ainda vazios. */
export function mergePrefill(
  blocks: Record<string, Record<string, unknown>>,
  prefill: Record<string, Record<string, string>>
): Record<string, Record<string, unknown>> {
  const merged: Record<string, Record<string, unknown>> = { ...blocks };
  for (const [stageKey, fields] of Object.entries(prefill)) {
    merged[stageKey] = { ...(merged[stageKey] ?? {}) };
    for (const [fieldKey, value] of Object.entries(fields)) {
      const cur = merged[stageKey][fieldKey];
      if (cur === undefined || cur === null || cur === "") merged[stageKey][fieldKey] = value;
    }
  }
  return merged;
}
