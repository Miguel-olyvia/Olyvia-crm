import { supabase } from "./supabase";
import { entityDisplayName } from "./names";
import type { AddressValue } from "./ducSchema";

/** Uma linha do orçamento vendido → alimenta o âmbito ("o que foi VENDIDO") do DUC. */
export interface ScopeLine {
  label: string;
  description: string;
  qty: string;
  unit: string;
  /** Modelo / Cor combinados a partir dos atributos da linha (lista de materiais). */
  modeloCor?: string;
  /** Dimensão / medidas a partir dos atributos da linha (lista de materiais). */
  dimensao?: string;
  /** Restantes atributos ("Label: valor"), para Observações quando não há descrição. */
  otherAttrs?: string;
}

/**
 * Extrai Modelo/Cor e Dimensão de `quote_lines.selected_attributes`.
 * Formato: { [attribute_id]: { label, value, unit? } } (ver src/utils/lineAttributes.ts).
 * Só considera valores escalares legíveis; ignora estrutura interna (bundle_components…).
 */
function attributesFromLine(
  selected: unknown
): { modeloCor?: string; dimensao?: string; otherAttrs?: string } {
  if (!selected || typeof selected !== "object" || Array.isArray(selected)) return {};
  const modelos: string[] = [];
  const cores: string[] = [];
  const dims: string[] = [];
  const others: string[] = [];
  for (const raw of Object.values(selected as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const o = raw as Record<string, unknown>;
    const val = o.value;
    const text =
      typeof val === "string"
        ? val.trim()
        : typeof val === "number" && Number.isFinite(val)
          ? String(val)
          : typeof val === "boolean"
            ? val
              ? "Sim"
              : "Não"
            : "";
    if (!text) continue;
    const rawLabel = typeof o.label === "string" ? o.label : (o.attribute_code as string) || "";
    const label = rawLabel.toLowerCase().trim();
    if (!label) continue;
    const unit = typeof o.unit === "string" ? o.unit.trim() : "";
    const withUnit = unit ? `${text} ${unit}` : text;
    if (label.includes("modelo")) modelos.push(withUnit);
    else if (label.includes("cor")) cores.push(withUnit);
    else if (label.includes("dimens") || label.includes("medida") || label.includes("tamanho"))
      dims.push(withUnit);
    else others.push(`${rawLabel.trim()}: ${withUnit}`);
  }
  const modeloCor = [modelos.join(" / "), cores.join(" / ")].filter(Boolean).join(" · ");
  const dimensao = dims.join(" × ");
  return {
    modeloCor: modeloCor || undefined,
    dimensao: dimensao || undefined,
    otherAttrs: others.join(" · ") || undefined,
  };
}

export interface ClientOlyviaInfo {
  entityId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  /** 2.º email (secundário), quando existe. */
  email2?: string | null;
  /** 2.º telefone (secundário), quando existe. */
  phone2?: string | null;
  address: string | null;
  /** Rua isolada da morada (quando disponível em anew_addresses). */
  addressStreet?: string | null;
  /** Número isolado da morada (quando disponível em anew_addresses). */
  addressNumber?: string | null;
  /** Código postal isolado da morada (quando disponível em anew_addresses). */
  addressPostal?: string | null;
  /** Cidade isolada da morada (quando disponível em anew_addresses). */
  addressCity?: string | null;
  /** Distrito isolado da morada (quando disponível em anew_addresses). */
  addressDistrict?: string | null;
  /** Morada fiscal (faturação) estruturada, quando difere/existe. */
  addressFiscal?: AddressValue | null;
  nif: string | null;
  responsavel: string | null;
  dataAdjudicacao: string | null; // yyyy-mm-dd
  dataFim: string | null; // yyyy-mm-dd (fim de vigência)
  valor: string | null;
  condicoes: string | null;
  contractNumber: string | null;
  /** Id da proposta ligada ao contrato — para o deep-link "Ver proposta" na Olyvia. */
  proposalId: string | null;
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

  const [entRes, emailRes, phoneRes, addrRes, fiscalAddrRes, fiscalRes, userRes, contractRes] =
    await Promise.all([
    supabase.from("anew_entities").select("*").eq("id", entityId).maybeSingle(),
    supabase
      .from("anew_entity_emails")
      .select("email, is_primary")
      .eq("entity_id", entityId)
      .order("is_primary", { ascending: false })
      .limit(2),
    supabase
      .from("anew_entity_phones")
      .select("phone_number, is_primary")
      .eq("entity_id", entityId)
      .order("is_primary", { ascending: false })
      .limit(2),
    // A morada real vive em anew_addresses (street/number/postal_code/city);
    // anew_entity_addresses é só a ligação via address_id. Fazemos join.
    supabase
      .from("anew_entity_addresses")
      .select("is_primary, is_fiscal, anew_addresses(street, number, postal_code, city, district)")
      .eq("entity_id", entityId)
      .order("is_primary", { ascending: false })
      .limit(1),
    // Morada FISCAL (faturação) — pode ser diferente da principal.
    supabase
      .from("anew_entity_addresses")
      .select("is_fiscal, anew_addresses(street, number, postal_code, city, district)")
      .eq("entity_id", entityId)
      .eq("is_fiscal", true)
      .limit(1),
    // O NIF vive em fiscal_entities, ligado à entidade por anew_entity_fiscal_entities.
    supabase
      .from("anew_entity_fiscal_entities")
      .select("is_primary, fiscal_entities(nif)")
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
  // NIF vem de fiscal_entities.nif (via anew_entity_fiscal_entities). Só o usamos
  // se for mesmo um NIF (9 dígitos) — evita mostrar hashes/valores protegidos.
  const fiscalRow = fiscalRes.data?.[0] as
    | { fiscal_entities?: { nif?: string | null } | { nif?: string | null }[] | null }
    | undefined;
  const fe = Array.isArray(fiscalRow?.fiscal_entities)
    ? fiscalRow?.fiscal_entities[0]
    : fiscalRow?.fiscal_entities;
  const rawNif = (fe?.nif as string) || "";
  const nif = /^\d{9}$/.test(rawNif.trim()) ? rawNif.trim() : null;
  const email = (emailRes.data?.[0]?.email as string) ?? null;
  const phone = (phoneRes.data?.[0]?.phone_number as string) ?? null;
  // 2.º contacto (email/telefone secundário) — alimenta o campo "Contacto de urgência / 2.º".
  const email2 = (emailRes.data?.[1]?.email as string) ?? null;
  const phone2 = (phoneRes.data?.[1]?.phone_number as string) ?? null;
  const responsavel = ((userRes.data as { name?: string } | null)?.name as string) ?? null;

  // Compõe a morada a partir de anew_addresses (join). Guardamos também as partes
  // separadas caso um destino futuro precise de código postal / cidade isolados.
  let address: string | null = null;
  let addressStreet: string | null = null;
  let addressNumber: string | null = null;
  let addressPostal: string | null = null;
  let addressCity: string | null = null;
  let addressDistrict: string | null = null;
  const addrRow = addrRes.data?.[0] as
    | { anew_addresses?: Record<string, unknown> | Record<string, unknown>[] | null }
    | undefined;
  const a = Array.isArray(addrRow?.anew_addresses)
    ? (addrRow?.anew_addresses[0] as Record<string, unknown> | undefined)
    : (addrRow?.anew_addresses as Record<string, unknown> | undefined);
  if (a) {
    const street = (a.street as string) || "";
    const number = (a.number as string) || "";
    const postal = (a.postal_code as string) || "";
    const city = (a.city as string) || "";
    const district = (a.district as string) || "";
    addressStreet = street.trim() || null;
    addressNumber = number.trim() || null;
    addressPostal = postal.trim() || null;
    addressCity = city.trim() || null;
    addressDistrict = district.trim() || null;
    const line1 = [street, number].filter(Boolean).join(" ").trim();
    const line2 = [postal, city].filter(Boolean).join(" ").trim();
    address = [line1, line2].filter(Boolean).join(", ") || null;
  }

  // Morada fiscal (faturação) — objeto estruturado, quando existe.
  let addressFiscal: AddressValue | null = null;
  const fiscalRow2 = fiscalAddrRes.data?.[0] as
    | { anew_addresses?: Record<string, unknown> | Record<string, unknown>[] | null }
    | undefined;
  const af = Array.isArray(fiscalRow2?.anew_addresses)
    ? (fiscalRow2?.anew_addresses[0] as Record<string, unknown> | undefined)
    : (fiscalRow2?.anew_addresses as Record<string, unknown> | undefined);
  if (af) {
    const fiscal: AddressValue = {
      street: ((af.street as string) || "").trim(),
      number: ((af.number as string) || "").trim(),
      postal: ((af.postal_code as string) || "").trim(),
      city: ((af.city as string) || "").trim(),
      district: ((af.district as string) || "").trim(),
    };
    if (fiscal.street || fiscal.number || fiscal.postal || fiscal.city || fiscal.district)
      addressFiscal = fiscal;
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
        .select("descricao_snapshot, item_description, qt, unidade, section_name, ordem, selected_attributes")
        .in("quote_id", quoteIds)
        .order("ordem", { ascending: true });
      (lineRows ?? []).forEach((l) => {
        const label =
          (l.descricao_snapshot as string) || (l.section_name as string) || "";
        if (!label.trim()) return;
        const attrs = attributesFromLine(l.selected_attributes);
        scopeLines.push({
          label: label.trim(),
          description: (l.item_description as string) || "",
          qty: l.qt != null ? String(l.qt) : "",
          unit: (l.unidade as string) || "",
          modeloCor: attrs.modeloCor,
          dimensao: attrs.dimensao,
          otherAttrs: attrs.otherAttrs,
        });
      });
    }
  }

  return {
    entityId,
    name,
    email,
    phone,
    email2,
    phone2,
    address,
    addressStreet,
    addressNumber,
    addressPostal,
    addressCity,
    addressDistrict,
    addressFiscal,
    nif,
    responsavel,
    dataAdjudicacao,
    dataFim,
    valor,
    condicoes,
    contractNumber,
    proposalId,
    scopeLines,
  };
}

/**
 * Constrói a morada ESTRUTURADA (objeto `AddressValue`) para os campos do tipo
 * `address`, a partir das partes isoladas (rua/número/CP/cidade). Assim os campos
 * separados aparecem preenchidos, em vez de tudo numa só caixa. Retrocompat: se só
 * existir a morada composta (string), coloca-a na rua.
 */
function moradaFromInfo(info: ClientOlyviaInfo): AddressValue | null {
  const street = (info.addressStreet ?? "").trim();
  const number = (info.addressNumber ?? "").trim();
  const postal = (info.addressPostal ?? "").trim();
  const city = (info.addressCity ?? "").trim();
  const district = (info.addressDistrict ?? "").trim();
  if (street || number || postal || city || district)
    return { street, number, postal, city, district };
  if (info.address) return { street: info.address, number: "", postal: "", city: "", district: "" };
  return null;
}

/** Mapeia os dados da Olyvia para os campos dos blocos do DUC. */
export function prefillBlocksFromInfo(
  info: ClientOlyviaInfo
): Record<string, Record<string, unknown>> {
  const faturacao = [info.name, info.nif ? `NIF: ${info.nif}` : null, info.address]
    .filter(Boolean)
    .join("\n");
  const morada = moradaFromInfo(info);

  const comercial: Record<string, unknown> = { cliente_ref: info.name };
  comercial.contacto_nome = info.name;
  if (info.phone) comercial.contacto_tel = info.phone;
  if (info.email) comercial.contacto_email = info.email;
  // 2.º contacto (telefone e/ou email secundário) → "Contacto de urgência / 2.º".
  const contacto2 = [info.phone2, info.email2].filter(Boolean).join(" · ");
  if (contacto2) comercial.contacto_urgencia = contacto2;
  if (morada) comercial.morada_obra = morada;
  if (info.responsavel) comercial.comercial_responsavel = info.responsavel;
  if (info.dataAdjudicacao) comercial.data_adjudicacao = info.dataAdjudicacao;
  if (info.valor) comercial.valor_mensal_anual = info.valor;
  if (info.contractNumber) comercial.num_contrato = info.contractNumber;

  const financeiro: Record<string, unknown> = {};
  if (faturacao) financeiro.nif_dados_faturacao = faturacao;
  if (info.addressFiscal) financeiro.morada_fiscal = info.addressFiscal;
  // NOTA: no schema, `condicoes_faseamento` é do tipo `phases` (PaymentPhase[]),
  // não texto. Mantemos aqui as condições de pagamento (payment_terms) como texto
  // por retrocompatibilidade; a UI de fases (toPhases) ignora não-arrays, por isso
  // é não-destrutivo. Prefill de fases estruturadas fica por fazer conservadoramente.
  if (info.condicoes) financeiro.condicoes_faseamento = info.condicoes;

  const entrega: Record<string, unknown> = { cliente: info.name };
  if (morada) entrega.morada = morada;
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
  prefill: Record<string, Record<string, unknown>>
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
