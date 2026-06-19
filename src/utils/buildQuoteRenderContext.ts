/**
 * Constrói o RenderContext partilhado por PDF e preview (e potencialmente email).
 *
 * NÃO lê pricing, IVA, fees, bundles, snapshots, catálogo ou totais.
 * Apenas remonta os dados de cliente/empresa/comercial em formato canónico.
 *
 * Reutiliza os resolvers existentes:
 *   - resolveQuotePdfClient (entity → client block)
 *   - resolveQuotePdfCommercialUser (assigned_to → created_by → authUser)
 */

import { supabase } from "@/integrations/supabase/client";
import { resolveQuotePdfClient } from "@/utils/quotePdfClient";
import { resolveQuotePdfCommercialUser } from "@/utils/quotePdfCommercialUser";
import type { RenderContext, ClientCtx, CompanyCtx, CommercialUserCtx } from "@/utils/documentVariables";

interface BuildOptions {
  quoteData: any;
  organizationId?: string | null;
  /** Preview a partir de dados já carregados; se ausente, refaz a query */
  preloadedOrg?: any | null;
  /** Logo já em base64 (PDF download); preview pode passar a URL crua */
  logoBase64?: string | null;
}

function formatClientAddress(client: any): string {
  if (!client) return "";
  const primary =
    (client.client_addresses || []).find((a: any) => a.is_primary) ||
    (client.client_addresses || [])[0];
  if (!primary) return "";
  return [primary.street, primary.number, primary.postal_code, primary.city]
    .filter(Boolean).join(", ");
}

function formatCompanyAddress(company: any): string {
  if (!company) return "";
  const primary =
    (company.company_addresses || []).find((a: any) => a.is_primary) ||
    (company.company_addresses || [])[0];
  if (primary) {
    return [primary.street, primary.number, primary.postal_code, primary.city]
      .filter(Boolean).join(", ");
  }
  return company.address || "";
}

export interface BuildResult {
  ctx: RenderContext;
  /** Dados crus que o QuotePDFDocument já consome hoje (mantidos para retrocompat) */
  raw: {
    client: any;
    company: any;
    user: CommercialUserCtx | null;
    entityId: string | null;
  };
}

export async function buildQuoteRenderContext(opts: BuildOptions): Promise<BuildResult> {
  const { quoteData, organizationId, preloadedOrg, logoBase64 } = opts;

  const { entityId, client: rawClient } = await resolveQuotePdfClient({
    entityId: quoteData?.entity_id,
    dealId: quoteData?.deal_id,
    proposalId: quoteData?.proposal_id,
    clienteId: quoteData?.cliente_id,
    clientId: quoteData?.client_id,
    contactId: quoteData?.contact_id,
    leadId: quoteData?.lead_id,
  });

  let orgData: any = preloadedOrg ?? null;
  const orgId = organizationId ?? quoteData?.organization_id ?? null;
  if (!orgData && orgId) {
    const { data: org } = await (supabase as any)
      .from("anew_organizations")
      .select("id, name, logo_url, metadata")
      .eq("id", orgId)
      .maybeSingle();
    orgData = org;
  }

  const commercial = await resolveQuotePdfCommercialUser(quoteData);

  // authUser separado do comercial responsável (necessário para emails)
  let authUserCtx: CommercialUserCtx | null = null;
  try {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      const { data: anewUser } = await (supabase as any)
        .from("anew_users")
        .select("id, name, email, phone")
        .eq("auth_user_id", authUser.id)
        .maybeSingle();
      authUserCtx = {
        id: anewUser?.id || authUser.id,
        name: anewUser?.name || authUser.user_metadata?.name || authUser.email?.split("@")[0] || "",
        email: anewUser?.email || authUser.email || "",
        phone: anewUser?.phone || "",
      };
    }
  } catch {
    authUserCtx = null;
  }

  // Display name do cliente: replica a lógica do QuotePDFDocument (linhas 462-466)
  const clientDisplayName: string =
    rawClient?.company_name
    || rawClient?.display_name
    || [rawClient?.first_name, rawClient?.last_name].filter(Boolean).join(" ")
    || quoteData?.client_name
    || "";

  const clientCtx: ClientCtx = {
    display_name: clientDisplayName,
    email: rawClient?.email || "",
    phone: rawClient?.phone || "",
    vat: rawClient?.vat || "",
    address: formatClientAddress(rawClient),
  };

  const meta = (orgData?.metadata || {}) as Record<string, any>;
  const companyForPdf: any = {
    name: orgData?.name || "",
    vat: meta.vat || "",
    email: meta.email || "",
    phone: meta.phone || "",
    phone_country_code: meta.phone_country_code || "",
    logo_url: logoBase64 || orgData?.logo_url || null,
    brand_color: meta.brand_color || null,
    company_addresses: [],
  };

  const companyCtx: CompanyCtx = {
    name: companyForPdf.name,
    vat: companyForPdf.vat,
    email: companyForPdf.email,
    phone: companyForPdf.phone,
    logo_url: companyForPdf.logo_url,
    address: formatCompanyAddress(companyForPdf),
  };

  const commercialCtx: CommercialUserCtx = commercial
    ? { id: commercial.id, name: commercial.name, email: commercial.email, phone: commercial.phone }
    : { name: "", email: "", phone: "" };

  const ctx: RenderContext = {
    client: clientCtx,
    company: companyCtx,
    commercial: commercialCtx,
    authUser: authUserCtx,
  };

  return { ctx, raw: { client: rawClient, company: companyForPdf, user: commercialCtx, entityId } };
}
