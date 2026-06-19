// resolveEntityId — pré-processing partilhado para tools que aceitam id por UUID,
// número (quote_number/proposal_number), título parcial OU nome/email para CRM.
//
// Devolve um de:
//   { uuid }                — match único, usar directamente
//   { notFound: true }      — 0 resultados
//   { ambiguous: [...] }    — top 5 candidatos para desambiguação

export type EntityKind = "quote" | "deal" | "proposal" | "lead" | "contact" | "client" | "product" | "service" | "bundle" | "schedule_item" | "contract";

export type ResolveResult =
  | { uuid: string }
  | { notFound: true }
  | { ambiguous: Array<{ id: string; label: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOP_CANDIDATES = 5;

function escapeLike(s: string): string {
  return s.replace(/[\\%_,]/g, (m) => `\\${m}`);
}

const NIF_RE = /^\d{9}$/;

// ---- CRM resolver ------------------------------------------------------------
// Estratégia para lead/contact/client:
//   1. UUID → directo.
//   2. NIF (9 dígitos) → fiscal_entities.nif → anew_entity_fiscal_entities →
//      linha respectiva nesta org.
//   3. Email (contém '@') → anew_entity_emails.email = ref (ci) → entity_id →
//      linha respectiva nesta org.
//   4. Texto livre → ilike em anew_entities.display_name via inner join.
async function resolveCrmEntity(
  supabase: any,
  organizationId: string,
  kind: "lead" | "contact" | "client",
  ref: string,
): Promise<ResolveResult> {
  const table = kind === "lead" ? "anew_leads" : kind === "contact" ? "anew_contacts" : "anew_clients";

  // Status filter (active / not-converted)
  const applyStatusFilter = (q: any) => {
    if (kind === "lead") return q.not("status", "in", "(converted,lost,rejected)");
    return q.eq("status", "active");
  };

  const buildLabel = (row: any): string => {
    const name = row?.anew_entities?.display_name ?? row?.display_name ?? row?.id;
    return String(name ?? row.id);
  };

  // 2) NIF branch (9 dígitos) → fiscal_entities.nif → anew_entity_fiscal_entities
  if (NIF_RE.test(ref)) {
    const { data: fe } = await supabase
      .from("fiscal_entities").select("id").eq("nif", ref).limit(5);
    const fiscalIds = (fe ?? []).map((r: any) => r.id).filter(Boolean);
    if (fiscalIds.length > 0) {
      const { data: links } = await supabase
        .from("anew_entity_fiscal_entities")
        .select("entity_id")
        .in("fiscal_entity_id", fiscalIds)
        .limit(50);
      const entityIds = Array.from(new Set((links ?? []).map((r: any) => r.entity_id).filter(Boolean)));
      if (entityIds.length > 0) {
        let q = supabase
          .from(table)
          .select("id, anew_entities!inner(display_name)")
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .in("entity_id", entityIds)
          .limit(TOP_CANDIDATES + 1);
        q = applyStatusFilter(q);
        const { data: rows } = await q;
        const list = rows ?? [];
        if (list.length === 1) return { uuid: list[0].id };
        if (list.length > 1) {
          return { ambiguous: list.slice(0, TOP_CANDIDATES).map((r: any) => ({ id: r.id, label: buildLabel(r) })) };
        }
      }
    }
    // NIF não resolveu — não bloqueia: cai para fallback de texto livre.
  }

  // 3) Email branch
  if (ref.includes("@")) {
    const { data: emailRows } = await supabase
      .from("anew_entity_emails")
      .select("entity_id")
      .ilike("email", ref)
      .limit(50);
    const entityIds = Array.from(new Set((emailRows ?? []).map((r: any) => r.entity_id).filter(Boolean)));
    if (entityIds.length === 0) return { notFound: true };

    let q = supabase
      .from(table)
      .select("id, anew_entities!inner(display_name)")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .in("entity_id", entityIds)
      .limit(TOP_CANDIDATES + 1);
    q = applyStatusFilter(q);
    const { data: rows } = await q;
    const list = rows ?? [];
    if (list.length === 0) return { notFound: true };
    if (list.length === 1) return { uuid: list[0].id };
    return {
      ambiguous: list.slice(0, TOP_CANDIDATES).map((r: any) => ({ id: r.id, label: buildLabel(r) })),
    };
  }

  // 3) Texto livre via display_name
  const like = `%${escapeLike(ref)}%`;
  let q = supabase
    .from(table)
    .select("id, created_at, anew_entities!inner(display_name)")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .ilike("anew_entities.display_name", like)
    .order("created_at", { ascending: false })
    .limit(TOP_CANDIDATES + 1);
  q = applyStatusFilter(q);
  const { data: rows } = await q;
  const list = rows ?? [];
  if (list.length === 0) return { notFound: true };
  if (list.length === 1) return { uuid: list[0].id };
  return {
    ambiguous: list.slice(0, TOP_CANDIDATES).map((r: any) => ({ id: r.id, label: buildLabel(r) })),
  };
}

export async function resolveEntityId(
  supabase: any,
  organizationId: string,
  kind: EntityKind,
  raw: string,
): Promise<ResolveResult> {
  const ref = String(raw ?? "").trim();
  if (!ref) return { notFound: true };
  if (UUID_RE.test(ref)) return { uuid: ref };

  if (kind === "lead" || kind === "contact" || kind === "client") {
    return await resolveCrmEntity(supabase, organizationId, kind, ref);
  }

  if (kind === "quote") {
    // 1) tentativa exacta por quote_number
    const exact = await supabase
      .from("quotes")
      .select("id, quote_number, title")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .eq("quote_number", ref)
      .limit(2);
    const exactRows = exact.data ?? [];
    if (exactRows.length === 1) return { uuid: exactRows[0].id };
    if (exactRows.length > 1) {
      return {
        ambiguous: exactRows.slice(0, TOP_CANDIDATES).map((r: any) => ({
          id: r.id,
          label: `${r.quote_number ?? r.id} — ${r.title ?? ""}`.trim(),
        })),
      };
    }
    // 2) fallback ilike por quote_number e título
    const like = `%${escapeLike(ref)}%`;
    const fuzzy = await supabase
      .from("quotes")
      .select("id, quote_number, title")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .or(`quote_number.ilike.${like},title.ilike.${like}`)
      .order("created_at", { ascending: false })
      .limit(TOP_CANDIDATES + 1);
    const rows = fuzzy.data ?? [];
    if (rows.length === 0) return { notFound: true };
    if (rows.length === 1) return { uuid: rows[0].id };
    return {
      ambiguous: rows.slice(0, TOP_CANDIDATES).map((r: any) => ({
        id: r.id,
        label: `${r.quote_number ?? r.id} — ${r.title ?? ""}`.trim(),
      })),
    };
  }

  if (kind === "deal") {
    const like = `%${escapeLike(ref)}%`;
    const fuzzy = await supabase
      .from("deals")
      .select("id, title")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .ilike("title", like)
      .order("created_at", { ascending: false })
      .limit(TOP_CANDIDATES + 1);
    const rows = fuzzy.data ?? [];
    if (rows.length === 0) return { notFound: true };
    if (rows.length === 1) return { uuid: rows[0].id };
    return {
      ambiguous: rows.slice(0, TOP_CANDIDATES).map((r: any) => ({
        id: r.id,
        label: r.title ?? r.id,
      })),
    };
  }

  if (kind === "product" || kind === "service" || kind === "bundle") {
    const table = kind === "product" ? "products" : kind === "service" ? "services" : "bundles";
    // 1) SKU exacto
    let exactQ = supabase
      .from(table)
      .select("id, sku, name")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .eq("sku", ref)
      .limit(2);
    if (kind !== "bundle") exactQ = exactQ.eq("is_deleted", false);
    const exact = await exactQ;
    const exactRows = exact.data ?? [];
    if (exactRows.length === 1) return { uuid: exactRows[0].id };
    if (exactRows.length > 1) {
      return {
        ambiguous: exactRows.slice(0, TOP_CANDIDATES).map((r: any) => ({
          id: r.id,
          label: `${r.sku ?? ""} — ${r.name ?? ""}`.trim(),
        })),
      };
    }
    // 2) ilike em name
    const like = `%${escapeLike(ref)}%`;
    let fuzzyQ = supabase
      .from(table)
      .select("id, sku, name")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .ilike("name", like)
      .order("name", { ascending: true })
      .limit(TOP_CANDIDATES + 1);
    if (kind !== "bundle") fuzzyQ = fuzzyQ.eq("is_deleted", false);
    const fuzzy = await fuzzyQ;
    const rows = fuzzy.data ?? [];
    if (rows.length === 0) return { notFound: true };
    if (rows.length === 1) return { uuid: rows[0].id };
    return {
      ambiguous: rows.slice(0, TOP_CANDIDATES).map((r: any) => ({
        id: r.id,
        label: `${r.sku ?? ""} — ${r.name ?? ""}`.trim(),
      })),
    };
  }

  if (kind === "schedule_item") {
    const like = `%${escapeLike(ref)}%`;
    const fuzzy = await supabase
      .from("schedule_items")
      .select("id, title, start_datetime")
      .eq("organization_id", organizationId)
      .ilike("title", like)
      .order("start_datetime", { ascending: false })
      .limit(TOP_CANDIDATES + 1);
    const rows = fuzzy.data ?? [];
    if (rows.length === 0) return { notFound: true };
    if (rows.length === 1) return { uuid: rows[0].id };
    return {
      ambiguous: rows.slice(0, TOP_CANDIDATES).map((r: any) => ({
        id: r.id,
        label: `${r.title ?? r.id}${r.start_datetime ? ` — ${String(r.start_datetime).slice(0, 16)}` : ""}`.trim(),
      })),
    };
  }

  if (kind === "contract") {
    // 1) contract_number exacto
    const exactC = await supabase
      .from("client_contracts")
      .select("id, contract_number")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .eq("contract_number", ref)
      .limit(2);
    const exactRowsC = exactC.data ?? [];
    if (exactRowsC.length === 1) return { uuid: exactRowsC[0].id };
    if (exactRowsC.length > 1) {
      return {
        ambiguous: exactRowsC.slice(0, TOP_CANDIDATES).map((r: any) => ({
          id: r.id,
          label: r.contract_number ?? r.id,
        })),
      };
    }
    // 2) ilike contract_number
    const likeC = `%${escapeLike(ref)}%`;
    const fuzzyC = await supabase
      .from("client_contracts")
      .select("id, contract_number, created_at")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .ilike("contract_number", likeC)
      .order("created_at", { ascending: false })
      .limit(TOP_CANDIDATES + 1);
    const rowsC = fuzzyC.data ?? [];
    if (rowsC.length === 0) return { notFound: true };
    if (rowsC.length === 1) return { uuid: rowsC[0].id };
    return {
      ambiguous: rowsC.slice(0, TOP_CANDIDATES).map((r: any) => ({
        id: r.id,
        label: r.contract_number ?? r.id,
      })),
    };
  }

  // proposal
  const exact = await supabase
    .from("proposals")
    .select("id, proposal_number, title")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .eq("proposal_number", ref)
    .limit(2);
  const exactRows = exact.data ?? [];
  if (exactRows.length === 1) return { uuid: exactRows[0].id };
  if (exactRows.length > 1) {
    return {
      ambiguous: exactRows.slice(0, TOP_CANDIDATES).map((r: any) => ({
        id: r.id,
        label: `${r.proposal_number ?? r.id} — ${r.title ?? ""}`.trim(),
      })),
    };
  }
  const like = `%${escapeLike(ref)}%`;
  const fuzzy = await supabase
    .from("proposals")
    .select("id, proposal_number, title")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .or(`proposal_number.ilike.${like},title.ilike.${like}`)
    .order("created_at", { ascending: false })
    .limit(TOP_CANDIDATES + 1);
  const rows = fuzzy.data ?? [];
  if (rows.length === 0) return { notFound: true };
  if (rows.length === 1) return { uuid: rows[0].id };
  return {
    ambiguous: rows.slice(0, TOP_CANDIDATES).map((r: any) => ({
      id: r.id,
      label: `${r.proposal_number ?? r.id} — ${r.title ?? ""}`.trim(),
    })),
  };
}
