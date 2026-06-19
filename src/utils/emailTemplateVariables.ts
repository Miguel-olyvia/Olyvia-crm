import { supabase } from "@/integrations/supabase/client";

// Variable definitions per module
export const TEMPLATE_VARIABLES: Record<string, Array<{ key: string; label: string; category: string }>> = {
  global: [
    { key: "company_name", label: "Nome da empresa", category: "Empresa" },
    { key: "company_email", label: "Email da empresa", category: "Empresa" },
    { key: "company_phone", label: "Telefone da empresa", category: "Empresa" },
    { key: "commercial_name", label: "Nome do comercial", category: "Comercial" },
    { key: "commercial_email", label: "Email do comercial", category: "Comercial" },
    { key: "commercial_phone", label: "Telefone do comercial", category: "Comercial" },
  ],
  leads: [
    { key: "lead_name", label: "Nome da lead", category: "Lead" },
    { key: "lead_email", label: "Email da lead", category: "Lead" },
    { key: "lead_phone", label: "Telefone", category: "Lead" },
    { key: "lead_source", label: "Origem", category: "Lead" },
    { key: "lead_stage", label: "Fase actual", category: "Lead" },
    { key: "lead_value", label: "Valor estimado", category: "Lead" },
  ],
  contacts: [
    { key: "client_name", label: "Nome", category: "Contacto" },
    { key: "client_email", label: "Email", category: "Contacto" },
    { key: "client_phone", label: "Telefone", category: "Contacto" },
    { key: "client_company", label: "Empresa do cliente", category: "Contacto" },
    { key: "client_nif", label: "NIF", category: "Contacto" },
  ],
  clients: [
    { key: "client_name", label: "Nome", category: "Cliente" },
    { key: "client_email", label: "Email", category: "Cliente" },
    { key: "client_phone", label: "Telefone", category: "Cliente" },
    { key: "client_company", label: "Empresa do cliente", category: "Cliente" },
    { key: "client_nif", label: "NIF", category: "Cliente" },
  ],
  proposals: [
    { key: "client_name", label: "Nome do cliente", category: "Cliente" },
    { key: "client_email", label: "Email do cliente", category: "Cliente" },
    { key: "proposal_title", label: "Título da proposta", category: "Proposta" },
    { key: "proposal_value", label: "Valor da proposta", category: "Proposta" },
    { key: "proposal_link", label: "Link público", category: "Proposta" },
    { key: "valid_until", label: "Válida até", category: "Proposta" },
    { key: "proposal_date", label: "Data da proposta", category: "Proposta" },
    { key: "proposal_number", label: "Número da proposta", category: "Proposta" },
  ],
  quotes: [
    { key: "client_name", label: "Nome do cliente", category: "Cliente" },
    { key: "client_email", label: "Email do cliente", category: "Cliente" },
    { key: "quote_title", label: "Título do orçamento", category: "Orçamento" },
    { key: "quote_value", label: "Valor do orçamento", category: "Orçamento" },
    { key: "quote_number", label: "Número do orçamento", category: "Orçamento" },
    { key: "quote_items", label: "Tabela de itens", category: "Orçamento" },
  ],
  contracts: [
    { key: "client_name", label: "Nome do cliente", category: "Cliente" },
    { key: "client_email", label: "Email do cliente", category: "Cliente" },
    { key: "contract_number", label: "Número do contrato", category: "Contrato" },
    { key: "contract_value", label: "Valor do contrato", category: "Contrato" },
    { key: "contract_start", label: "Data de início", category: "Contrato" },
    { key: "contract_end", label: "Data de fim", category: "Contrato" },
    { key: "contract_link", label: "Link do contrato", category: "Contrato" },
  ],
  deals: [
    { key: "client_name", label: "Nome do cliente", category: "Cliente" },
    { key: "deal_title", label: "Título do negócio", category: "Negócio" },
    { key: "deal_value", label: "Valor do negócio", category: "Negócio" },
  ],
};

export function getVariablesForModule(module: string) {
  return [...TEMPLATE_VARIABLES.global, ...(TEMPLATE_VARIABLES[module] || [])];
}

// Example data for preview
export const EXAMPLE_DATA: Record<string, string> = {
  company_name: "Empresa Demo",
  company_email: "geral@empresa.com",
  company_phone: "+351 211 234 567",
  commercial_name: "João Silva",
  commercial_email: "joao.silva@empresa.com",
  commercial_phone: "+351 912 345 678",
  lead_name: "Rui Bernardo",
  lead_email: "rui@example.com",
  lead_phone: "+351 961 234 567",
  lead_source: "Website",
  lead_stage: "Novo",
  lead_value: "€5.000",
  client_name: "Rui Bernardo",
  client_email: "rui@example.com",
  client_phone: "+351 961 234 567",
  client_company: "Bernardo & Filhos, Lda",
  client_nif: "509123456",
  proposal_title: "Proposta Comercial",
  proposal_value: "€3.590",
  proposal_link: "https://olyvia.lovable.app/proposal/abc123",
  valid_until: "30/04/2026",
  proposal_date: "10/03/2026",
  proposal_number: "P-2026-0001",
  quote_title: "Orçamento #0042",
  quote_value: "€2.850",
  quote_number: "Q-2026-0042",
  quote_items: "<table style='width:100%;border-collapse:collapse;'><tr style='background:#f3f4f6;'><th style='padding:8px;text-align:left;border:1px solid #e5e7eb;'>Item</th><th style='padding:8px;text-align:right;border:1px solid #e5e7eb;'>Qty</th><th style='padding:8px;text-align:right;border:1px solid #e5e7eb;'>Preço</th><th style='padding:8px;text-align:right;border:1px solid #e5e7eb;'>Total</th></tr><tr><td style='padding:8px;border:1px solid #e5e7eb;'>Serviço A</td><td style='padding:8px;text-align:right;border:1px solid #e5e7eb;'>2</td><td style='padding:8px;text-align:right;border:1px solid #e5e7eb;'>€500</td><td style='padding:8px;text-align:right;border:1px solid #e5e7eb;'>€1.000</td></tr></table>",
  contract_number: "CC-2026-0001",
  contract_value: "€12.000",
  contract_start: "01/04/2026",
  contract_end: "31/03/2027",
  contract_link: "https://olyvia.lovable.app/contract/xyz789",
  deal_title: "Negócio - Rui Bernardo",
  deal_value: "€5.000",
};

export function replaceVariables(text: string, data: Record<string, string>): string {
  const hasKey = (key: string) => Object.prototype.hasOwnProperty.call(data, key);

  // First strip the styled <span> wrappers around {{variables}} (from the rich text editor)
  let result = text.replace(
    /<span[^>]*class="[^"]*bg-primary[^"]*"[^>]*contenteditable="false"[^>]*>\{\{(\w+)\}\}<\/span>/g,
    (_match, key) => (hasKey(key) ? (data[key] ?? "") : `{{${key}}}`)
  );

  // Then replace any remaining bare {{variables}}
  result = result.replace(/\{\{(\w+)\}\}/g, (match, key) => (hasKey(key) ? (data[key] ?? "") : match));
  return result;
}

function formatCurrency(value: number | null | undefined, currency = "EUR"): string {
  if (value == null) return "€0";
  const fixed = Math.abs(value).toFixed(2);
  const [int, dec] = fixed.split('.');
  return (value < 0 ? '-' : '') + '€' + int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("pt-PT");
  } catch {
    return dateStr;
  }
}

/**
 * Fetches real data for an entity and returns a variable map ready for substitution.
 */
export async function resolveEntityVariables(
  entityType: string,
  entityId: string,
  organizationId?: string
): Promise<Record<string, string>> {
  const vars: Record<string, string> = Object.fromEntries(
    getVariablesForModule(entityType).map(({ key }) => [key, ""])
  );

  let resolvedOrganizationId: string | null = organizationId || null;

  async function resolveEntity(eId: string) {
    const [entityRes, emailRes, phoneRes] = await Promise.all([
      (supabase as any)
        .from("anew_entities")
        .select("display_name, first_name, last_name")
        .eq("id", eId)
        .maybeSingle(),
      (supabase as any)
        .from("anew_entity_emails")
        .select("email, is_primary, created_at")
        .eq("entity_id", eId)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1),
      (supabase as any)
        .from("anew_entity_phones")
        .select("phone_number, is_primary, created_at")
        .eq("entity_id", eId)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1),
    ]);

    const entity = entityRes.data;
    const firstName = entity?.first_name || "";
    const lastName = entity?.last_name || "";
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

    return {
      name: entity?.display_name || fullName || "",
      firstName,
      lastName,
      email: emailRes.data?.[0]?.email || "",
      phone: phoneRes.data?.[0]?.phone_number || "",
    };
  }

  async function resolveOrganization(orgId?: string | null) {
    if (!orgId) return;

    const { data: org } = await (supabase as any)
      .from("anew_organizations")
      .select("name, entity_id, metadata")
      .eq("id", orgId)
      .maybeSingle();

    if (!org) return;

    vars.company_name = org.name || vars.company_name || "";

    if (org.entity_id) {
      const orgEntity = await resolveEntity(org.entity_id);
      vars.company_email = orgEntity.email || vars.company_email || "";
      vars.company_phone = orgEntity.phone || vars.company_phone || "";
    }

    const metadata = (org.metadata || {}) as Record<string, any>;
    vars.company_email =
      vars.company_email ||
      metadata.email ||
      metadata.company_email ||
      metadata.contact_email ||
      "";
    vars.company_phone =
      vars.company_phone ||
      metadata.phone ||
      metadata.company_phone ||
      metadata.contact_phone ||
      "";
  }

  try {
    // Resolve commercial (current user)
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (authUser) {
      const { data: anewUser } = await (supabase as any)
        .from("anew_users")
        .select("id, name, email, phone, entity_id")
        .eq("auth_user_id", authUser.id)
        .maybeSingle();

      vars.commercial_name =
        anewUser?.name || authUser.user_metadata?.name || authUser.email?.split("@")[0] || "";
      vars.commercial_email = anewUser?.email || authUser.email || "";
      vars.commercial_phone = anewUser?.phone || "";

      if (anewUser?.entity_id) {
        const commercialEntity = await resolveEntity(anewUser.entity_id);
        vars.commercial_name = commercialEntity.name || vars.commercial_name;
        vars.commercial_email = commercialEntity.email || vars.commercial_email;
        vars.commercial_phone = commercialEntity.phone || vars.commercial_phone;
      }
    }

    if (entityType === "leads") {
      const { data: lead } = await (supabase as any)
        .from("anew_leads")
        .select("*, lead_workflow_stages(name)")
        .eq("id", entityId)
        .single();

      if (lead) {
        resolvedOrganizationId = resolvedOrganizationId || lead.organization_id || null;

        if (lead.entity_id) {
          const ent = await resolveEntity(lead.entity_id);
          vars.lead_name = ent.name;
          vars.lead_email = ent.email;
          vars.lead_phone = ent.phone;
          vars.client_name = ent.name;
          vars.client_email = ent.email;
          vars.client_phone = ent.phone;
        } else {
          const fv = (lead.field_values || {}) as Record<string, any>;
          const firstName = fv.first_name || fv.nome || "";
          const lastName = fv.last_name || fv.apelido || "";
          vars.lead_name = `${firstName} ${lastName}`.trim();
          vars.lead_email = fv.email || "";
          vars.lead_phone = fv.phone || fv.telefone || "";
          vars.client_name = vars.lead_name;
          vars.client_email = vars.lead_email;
          vars.client_phone = vars.lead_phone;

          const rawLeadValue =
            fv.estimated_value ?? fv.lead_value ?? fv.valor_estimado ?? fv.value ?? null;
          if (rawLeadValue !== null && rawLeadValue !== "") {
            const numeric = Number(String(rawLeadValue).replace(",", "."));
            vars.lead_value = Number.isFinite(numeric)
              ? formatCurrency(numeric)
              : String(rawLeadValue);
          }
        }

        vars.lead_source = lead.source || "";
        vars.lead_stage = lead.lead_workflow_stages?.name || "";
      }
    } else if (entityType === "contacts") {
      const { data: contact } = await (supabase as any)
        .from("anew_contacts")
        .select("entity_id, organization_id, custom_fields")
        .eq("id", entityId)
        .maybeSingle();

      if (contact) {
        resolvedOrganizationId = resolvedOrganizationId || contact.organization_id || null;

        if (contact.entity_id) {
          const ent = await resolveEntity(contact.entity_id);
          vars.client_name = ent.name;
          vars.client_email = ent.email;
          vars.client_phone = ent.phone;
        }

        const customFields = (contact.custom_fields || {}) as Record<string, any>;
        vars.client_nif = customFields.nif || customFields.tax_id || customFields.vat || "";
      }
    } else if (entityType === "clients") {
      const { data: client } = await (supabase as any)
        .from("anew_clients")
        .select("entity_id, organization_id, custom_fields")
        .eq("id", entityId)
        .maybeSingle();

      if (client) {
        resolvedOrganizationId = resolvedOrganizationId || client.organization_id || null;

        if (client.entity_id) {
          const ent = await resolveEntity(client.entity_id);
          vars.client_name = ent.name;
          vars.client_email = ent.email;
          vars.client_phone = ent.phone;
        }

        const customFields = (client.custom_fields || {}) as Record<string, any>;
        vars.client_nif = customFields.nif || customFields.tax_id || customFields.vat || "";
      }
    } else if (entityType === "proposals") {
      const { data: proposal } = await (supabase as any)
        .from("proposals")
        .select("*")
        .eq("id", entityId)
        .single();

      if (proposal) {
        resolvedOrganizationId = resolvedOrganizationId || proposal.organization_id || null;
        vars.proposal_title = proposal.title || "";
        vars.proposal_value = formatCurrency(proposal.value);
        vars.proposal_date = formatDate(proposal.created_at);
        vars.proposal_number = proposal.proposal_number || proposal.id.slice(0, 8);
        vars.valid_until = formatDate(proposal.valid_until);
        vars.proposal_link = proposal.public_url || `${window.location.origin}/public-proposal/${proposal.id}`;

        if (proposal.entity_id) {
          const ent = await resolveEntity(proposal.entity_id);
          vars.client_name = ent.name;
          vars.client_email = ent.email;
          vars.client_phone = ent.phone;
        }
      }
    } else if (entityType === "quotes") {
      const { data: quote } = await (supabase as any).from("quotes").select("*").eq("id", entityId).single();

      if (quote) {
        resolvedOrganizationId = resolvedOrganizationId || quote.organization_id || null;
        vars.quote_title = `Orçamento ${quote.quote_number || quote.id.slice(0, 8)}`;
        vars.quote_value = formatCurrency(quote.total);
        vars.quote_number = quote.quote_number || "";

        // Build items table
        const { data: lines } = await (supabase as any)
          .from("quote_lines")
          .select("*")
          .eq("quote_id", entityId)
          .order("ordem");

        if (lines && lines.length > 0) {
          let html = "<table style='width:100%;border-collapse:collapse;margin:16px 0;'>";
          html += "<tr style='background:#f3f4f6;'><th style='padding:8px;text-align:left;border:1px solid #e5e7eb;'>Item</th><th style='padding:8px;text-align:right;border:1px solid #e5e7eb;'>Qty</th><th style='padding:8px;text-align:right;border:1px solid #e5e7eb;'>Preço</th><th style='padding:8px;text-align:right;border:1px solid #e5e7eb;'>Total</th></tr>";
          for (const line of lines) {
            const qty = line.quantidade || 1;
            const price = line.preco_unitario || 0;
            const total = line.total_com_iva || qty * price;
            html += `<tr><td style='padding:8px;border:1px solid #e5e7eb;'>${line.descricao || ""}</td><td style='padding:8px;text-align:right;border:1px solid #e5e7eb;'>${qty}</td><td style='padding:8px;text-align:right;border:1px solid #e5e7eb;'>${formatCurrency(price)}</td><td style='padding:8px;text-align:right;border:1px solid #e5e7eb;'>${formatCurrency(total)}</td></tr>`;
          }
          html += "</table>";
          vars.quote_items = html;
        }

        // Resolve client from quote entity or deal
        const entityId2 = (quote as any).entity_id;
        if (entityId2) {
          const ent = await resolveEntity(entityId2);
          vars.client_name = ent.name;
          vars.client_email = ent.email;
          vars.client_phone = ent.phone;
        } else if (quote.cliente_id) {
          const { data: client } = await (supabase as any)
            .from("anew_clients")
            .select("entity_id")
            .eq("id", quote.cliente_id)
            .maybeSingle();
          if (client?.entity_id) {
            const ent = await resolveEntity(client.entity_id);
            vars.client_name = ent.name;
            vars.client_email = ent.email;
            vars.client_phone = ent.phone;
          }
        }
      }
    } else if (entityType === "contracts") {
      const { data: contract } = await (supabase as any)
        .from("client_contracts")
        .select("*")
        .eq("id", entityId)
        .single();

      if (contract) {
        resolvedOrganizationId = resolvedOrganizationId || contract.organization_id || null;
        vars.contract_number = contract.contract_number || "";
        vars.contract_value = formatCurrency(contract.total_value);
        vars.contract_start = formatDate(contract.start_date);
        vars.contract_end = formatDate(contract.end_date);
        vars.contract_link = contract.public_url || "";

        if (contract.entity_id) {
          const ent = await resolveEntity(contract.entity_id);
          vars.client_name = ent.name;
          vars.client_email = ent.email;
        }
      }
    } else if (entityType === "deals") {
      const { data: deal } = await supabase.from("deals").select("*").eq("id", entityId).single();

      if (deal) {
        resolvedOrganizationId = resolvedOrganizationId || (deal as any).organization_id || null;
        vars.deal_title = deal.title || "";
        vars.deal_value = formatCurrency(deal.value);
        if ((deal as any).entity_id) {
          const ent = await resolveEntity((deal as any).entity_id);
          vars.client_name = ent.name;
          vars.client_email = ent.email;
        }
      }
    }

    await resolveOrganization(resolvedOrganizationId);

    if ((entityType === "contacts" || entityType === "clients") && !vars.client_company) {
      vars.client_company = vars.company_name || "";
    }
  } catch (err) {
    console.error("Error resolving entity variables:", err);
  }

  return vars;
}
