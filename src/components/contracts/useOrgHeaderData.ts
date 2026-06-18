import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";

export interface OrgHeaderData {
  empresa_nome: string;
  empresa_nif: string;
  empresa_morada: string;
  empresa_telefone: string;
  empresa_email: string;
  empresa_website: string;
}

const EMPTY: OrgHeaderData = {
  empresa_nome: "",
  empresa_nif: "",
  empresa_morada: "",
  empresa_telefone: "",
  empresa_email: "",
  empresa_website: "",
};

function joinAddress(a: any): string {
  if (!a || typeof a !== "object") return "";
  return [a.street, a.number, a.postal_code, a.city]
    .map((v) => (v == null ? "" : String(v).trim()))
    .filter(Boolean)
    .join(", ");
}

/**
 * Single source of truth for org header data used by contract templates &
 * exported PDFs. Resolves morada / NIF / phone / email / website following
 * the canonical priority:
 *   morada: anew_org_addresses (fiscal first, valid_to null) →
 *           anew_entity_addresses (primary first) →
 *           metadata.address (legacy text)
 *   nif:    fiscal_entities via anew_entity_fiscal_entities (primary) →
 *           metadata.vat | metadata.nif
 *   phone:  anew_organizations.phone → anew_entity_phones (primary) →
 *           metadata.phone
 *   email:  anew_entity_emails (primary) → metadata.email
 *   website: metadata.website
 */
export function useOrgHeaderData() {
  const { activeCompany } = useCompany();
  const orgId = activeCompany?.id;

  return useQuery<OrgHeaderData>({
    queryKey: ["org-header-data", orgId],
    queryFn: async () => {
      if (!orgId) return EMPTY;

      const { data: org } = await (supabase as any)
        .from("anew_organizations")
        .select("name, entity_id, metadata, phone")
        .eq("id", orgId)
        .maybeSingle();

      if (!org) return EMPTY;

      const out: OrgHeaderData = {
        ...EMPTY,
        empresa_nome: org.name || "",
        empresa_telefone: org.phone || org.metadata?.phone || "",
        empresa_email: org.metadata?.email || "",
        empresa_website: org.metadata?.website || "",
        empresa_nif: org.metadata?.vat || org.metadata?.nif || "",
      };

      // Org-level fiscal address (preferred)
      const { data: orgAddr } = await (supabase as any)
        .from("anew_org_addresses")
        .select("anew_addresses(street, number, postal_code, city)")
        .eq("org_id", orgId)
        .is("valid_to", null)
        .order("is_fiscal", { ascending: false })
        .limit(1);
      const orgAddrJoined = joinAddress(orgAddr?.[0]?.anew_addresses);
      if (orgAddrJoined) out.empresa_morada = orgAddrJoined;

      // Entity-level fallbacks (NIF, phone, email, address)
      if (org.entity_id) {
        const [fiscalRes, phoneRes, emailRes, entAddrRes] = await Promise.all([
          (supabase as any)
            .from("anew_entity_fiscal_entities")
            .select("fiscal_entity_id")
            .eq("entity_id", org.entity_id)
            .eq("is_primary", true)
            .limit(1),
          (supabase as any)
            .from("anew_entity_phones")
            .select("phone_number")
            .eq("entity_id", org.entity_id)
            .order("is_primary", { ascending: false })
            .limit(1),
          (supabase as any)
            .from("anew_entity_emails")
            .select("email")
            .eq("entity_id", org.entity_id)
            .order("is_primary", { ascending: false })
            .limit(1),
          (supabase as any)
            .from("anew_entity_addresses")
            .select("anew_addresses(street, number, postal_code, city)")
            .eq("entity_id", org.entity_id)
            .order("is_primary", { ascending: false })
            .limit(1),
        ]);

        const feId = fiscalRes?.data?.[0]?.fiscal_entity_id;
        if (feId) {
          const { data: fe } = await (supabase as any)
            .from("fiscal_entities")
            .select("nif")
            .eq("id", feId)
            .maybeSingle();
          if (fe?.nif) out.empresa_nif = String(fe.nif).trim();
        }
        if (!out.empresa_telefone) {
          out.empresa_telefone = phoneRes?.data?.[0]?.phone_number || "";
        }
        if (!out.empresa_email) {
          out.empresa_email = emailRes?.data?.[0]?.email || "";
        }
        if (!out.empresa_morada) {
          const entAddrJoined = joinAddress(entAddrRes?.data?.[0]?.anew_addresses);
          if (entAddrJoined) out.empresa_morada = entAddrJoined;
        }
      }

      // Last-resort legacy text address
      if (!out.empresa_morada && org.metadata?.address) {
        out.empresa_morada = String(org.metadata.address);
      }

      return out;
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });
}

/**
 * Merge user overrides (from DocumentSettings extra_settings) on top of the
 * canonical org data. Empty/whitespace overrides fall back to the org value.
 */
export function applyOrgHeaderOverrides(
  base: OrgHeaderData,
  overrides: {
    company_name_override?: string | null;
    company_address_override?: string | null;
    company_nif_override?: string | null;
    company_phone_override?: string | null;
    company_email_override?: string | null;
    company_website?: string | null;
  } | null | undefined,
): OrgHeaderData {
  const pick = (override: string | null | undefined, fallback: string) => {
    const v = (override ?? "").trim();
    return v || fallback;
  };
  const o = overrides || {};
  return {
    empresa_nome: pick(o.company_name_override, base.empresa_nome),
    empresa_nif: pick(o.company_nif_override, base.empresa_nif),
    empresa_morada: pick(o.company_address_override, base.empresa_morada),
    empresa_telefone: pick(o.company_phone_override, base.empresa_telefone),
    empresa_email: pick(o.company_email_override, base.empresa_email),
    empresa_website: pick(o.company_website, base.empresa_website),
  };
}
