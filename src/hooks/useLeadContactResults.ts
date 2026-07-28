import { useQuery, type QueryKey } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LeadContactResultOption {
  id: string;
  name: string;
  is_positive: boolean;
  is_negative: boolean;
  sort_order: number;
}

/**
 * Query key builder exposed for consistency with useLeadPipelineRules.ts -
 * no other caller invalidates this today (lead_contact_results is managed on
 * its own page, src/pages/LeadContactResults.tsx, which doesn't share this
 * cache), but keeping the same shape avoids surprises if that changes.
 */
export function leadContactResultsQueryKey(organizationId: string | null | undefined): QueryKey {
  return ["lead-contact-results", organizationId ?? null];
}

async function fetchLeadContactResults(organizationId: string | null): Promise<LeadContactResultOption[]> {
  let query = supabase
    .from("lead_contact_results")
    .select("id, name, is_positive, is_negative, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  // Same visibility rule as src/pages/LeadContactResults.tsx and
  // AnewLeadContactDialog.tsx's loadContactResults: global rows
  // (organization_id IS NULL) plus this organization's own rows.
  query = organizationId
    ? query.or(`organization_id.is.null,organization_id.eq.${organizationId}`)
    : query.is("organization_id", null);

  const { data, error } = await query;
  if (error) throw error;
  return (data as LeadContactResultOption[]) ?? [];
}

/**
 * Active `lead_contact_results` (global + org-scoped) available for the
 * "Último resultado de contacto é X" rule condition
 * (last_contact_result_is - see migration
 * 20261111220000_lead_v2_last_contact_result_is_condition.sql). These are
 * the same rows a user configures on the Lead Contact Results settings page
 * and picks from when logging a lead contact in AnewLeadContactDialog.tsx -
 * there is no fixed/hardcoded enum of result values, the catalog is fully
 * per-organization.
 */
export function useLeadContactResults(organizationId: string | null | undefined) {
  const queryKey = leadContactResultsQueryKey(organizationId);

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchLeadContactResults(organizationId ?? null),
  });

  return {
    contactResults: data ?? [],
    isLoading,
    error,
  };
}
