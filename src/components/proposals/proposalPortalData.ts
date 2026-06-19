import { supabase } from "@/integrations/supabase/client";

export interface ProposalPortalCommercial {
  name: string;
  phone: string | null;
  email: string | null;
}

export interface ProposalPortalData {
  proposal: any;
  template: any | null;
  company: any | null;
  quotes: any[];
  quoteLines: Record<string, any[]>;
  quoteFees: Record<string, any[]>;
  commercial: ProposalPortalCommercial | null;
}

// H5: minimal shape returned by get_commercial_info RPC.
interface CommercialInfoRow {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
}

async function loadTemplate(proposal: any) {
  if (proposal?.proposal_templates) {
    return proposal.proposal_templates;
  }

  if (proposal?.template_id) {
    const { data, error } = await supabase
      .from("proposal_templates")
      .select("*")
      .eq("id", proposal.template_id)
      .maybeSingle();

    if (error) {
      console.error("[proposalPortalData] loadTemplate by id", error);
      return null;
    }
    if (data) return data;
  }

  if (proposal?.organization_id) {
    const { data, error } = await supabase
      .from("proposal_templates")
      .select("*")
      .eq("organization_id", proposal.organization_id)
      .eq("template_type", "proposal")
      .eq("is_default", true)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      console.error("[proposalPortalData] loadTemplate default", error);
      return null;
    }
    return data ?? null;
  }

  return null;
}

async function loadCommercial(
  createdBy: string | null | undefined,
): Promise<ProposalPortalCommercial | null> {
  if (!createdBy) return null;

  // H5: typed RPC call instead of `(supabase as any).rpc(...)`.
  const { data, error } = await supabase.rpc("get_commercial_info", { p_user_id: createdBy });
  if (error) {
    console.error("[proposalPortalData] get_commercial_info", error);
    return null;
  }
  const info = data as CommercialInfoRow | null;
  if (!info) return null;

  return {
    name: info.name || "Comercial",
    phone: info.phone || null,
    email: info.email || null,
  };
}

// M4: paralleliza os dois primeiros lookups (client e deal são independentes,
// ambos só dependem do proposal já carregado). Só o lookup do cliente do deal
// é sequencial porque depende do resultado do deal.
async function resolveCommercialForProposal(
  proposal: any,
): Promise<ProposalPortalCommercial | null> {
  const [clientRes, dealRes] = await Promise.all([
    proposal.client_id
      ? supabase.from("anew_clients").select("assigned_to").eq("id", proposal.client_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    proposal.deal_id
      ? supabase.from("deals").select("assigned_to, client_id").eq("id", proposal.deal_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (clientRes.error) {
    console.error("[proposalPortalData] proposal client lookup", clientRes.error);
  }
  if (dealRes.error) {
    console.error("[proposalPortalData] deal lookup", dealRes.error);
  }

  let dealClientAssignedTo: string | null = null;
  if (dealRes.data?.client_id) {
    const { data: dealClient, error: dealClientErr } = await supabase
      .from("anew_clients")
      .select("assigned_to")
      .eq("id", dealRes.data.client_id)
      .maybeSingle();
    if (dealClientErr) {
      console.error("[proposalPortalData] deal client lookup", dealClientErr);
    }
    dealClientAssignedTo = dealClient?.assigned_to ?? null;
  }

  // Priority: proposal.client.assigned_to > deal.client.assigned_to > deal.assigned_to > proposal.created_by
  const commercialId =
    clientRes.data?.assigned_to ??
    dealClientAssignedTo ??
    dealRes.data?.assigned_to ??
    proposal.created_by;

  return loadCommercial(commercialId);
}

export async function loadProposalPortalData(
  proposalId: string,
): Promise<ProposalPortalData | null> {
  // H5: typed query; verifica erro explicitamente.
  const { data: proposal, error: proposalErr } = await supabase
    .from("proposals")
    .select("*, proposal_templates(*)")
    .eq("id", proposalId)
    .maybeSingle();

  if (proposalErr) {
    console.error("[proposalPortalData] proposal lookup", proposalErr);
    return null;
  }
  if (!proposal) return null;

  // M4: company, quotes, template e commercial são independentes — paralelizar.
  const [companyResult, quotesResult, template, commercial] = await Promise.all([
    proposal.organization_id
      ? supabase
          .from("anew_organizations")
          .select("name, logo_url, metadata")
          .eq("id", proposal.organization_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("quotes")
      .select("id, title, quote_number, estado, subtotal, total, total_fees, iva_rate, client_notes, desconto_global_percent")
      .eq("proposal_id", proposalId),
    loadTemplate(proposal),
    resolveCommercialForProposal(proposal),
  ]);

  if (companyResult.error) {
    console.error("[proposalPortalData] company lookup", companyResult.error);
  }
  if (quotesResult.error) {
    console.error("[proposalPortalData] quotes lookup", quotesResult.error);
  }

  let quotes = quotesResult.data || [];

  // Fallback: find quotes via pipeline_links if none found directly
  if (quotes.length === 0) {
    // H5: typed query.
    const { data: pLinks, error: pLinksErr } = await supabase
      .from("pipeline_links")
      .select("quote_id")
      .eq("proposal_id", proposalId)
      .not("quote_id", "is", null);

    if (pLinksErr) {
      console.error("[proposalPortalData] pipeline_links lookup", pLinksErr);
    }

    if (pLinks && pLinks.length > 0) {
      const quoteIds = pLinks.map((pl) => pl.quote_id).filter(Boolean) as string[];
      if (quoteIds.length > 0) {
        const { data: linkedQuotes, error: linkedErr } = await supabase
          .from("quotes")
          .select("id, title, quote_number, estado, subtotal, total, total_fees, iva_rate, client_notes, desconto_global_percent")
          .in("id", quoteIds);
        if (linkedErr) {
          console.error("[proposalPortalData] linked quotes lookup", linkedErr);
        }
        quotes = linkedQuotes || [];
      }
    }
  }

  const quoteLines: Record<string, any[]> = {};
  const quoteFees: Record<string, any[]> = {};

  if (quotes.length > 0) {
    const quoteIds = quotes.map((quote) => quote.id);

    const [linesResult, feesResult] = await Promise.all([
      supabase
        .from("quote_lines")
        .select("id, quote_id, descricao_snapshot, item_description, qt, unidade, total_sem_iva, total_com_iva, section_name, ordem, iva_percent")
        .in("quote_id", quoteIds)
        .order("ordem", { ascending: true }),
      (supabase as any)
        .from("quote_fees")
        .select("id, quote_id, calculated_value, vat_rate, vat_amount, service_fee_types(name)")
        .in("quote_id", quoteIds),
    ]);

    if (linesResult.error) {
      console.error("[proposalPortalData] quote_lines lookup", linesResult.error);
    }
    if (feesResult.error) {
      console.error("[proposalPortalData] quote_fees lookup", feesResult.error);
    }

    (linesResult.data || []).forEach((line: any) => {
      if (!quoteLines[line.quote_id]) {
        quoteLines[line.quote_id] = [];
      }
      quoteLines[line.quote_id].push(line);
    });

    (feesResult.data || []).forEach((fee: any) => {
      if (!quoteFees[fee.quote_id]) {
        quoteFees[fee.quote_id] = [];
      }
      quoteFees[fee.quote_id].push(fee);
    });
  }

  return {
    proposal,
    template,
    company: companyResult.data ?? null,
    quotes,
    quoteLines,
    quoteFees,
    commercial,
  };
}
