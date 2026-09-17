import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PlanUsageLimit {
  limit_type: "ai_credits" | "leads" | "users" | "proposals" | "quotes" | "contracts";
  limit_value: number | null;
  used_value: number;
  reset_cadence: "monthly" | "none";
  balance_credits?: number;
}

export interface PlanUsageSummary {
  plan: string | null;
  status: string | null;
  trial_ends_at: string | null;
  limits: PlanUsageLimit[];
}

/**
 * Reads current consumption vs. plan ceiling for one organization, via
 * fn_get_plan_usage_summary (supabase/migrations/20261201350000). The
 * server resolves both the billing account (an org can have more than one
 * work org sharing a plan) and "what month is it" — this hook never
 * computes either itself, so it can't be fooled by the viewer's clock or
 * point at the wrong organization.
 *
 * Read-only: never blocks anything by itself. Pair with
 * PlanLimitWarning to show an approaching-limit banner before the actual
 * fn_check_and_consume_*/trigger block happens.
 */
export function usePlanUsage(organizationId: string | null | undefined) {
  const [summary, setSummary] = useState<PlanUsageSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!organizationId) {
      setSummary(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await (supabase as any).rpc(
        "fn_get_plan_usage_summary",
        { _organization_id: organizationId },
      );
      if (rpcError) throw rpcError;
      if (data?.error) {
        setError(data.error);
        setSummary(null);
      } else {
        setSummary(data as PlanUsageSummary);
      }
    } catch (e: any) {
      setError(e?.message ?? "unknown_error");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const getLimit = useCallback(
    (limitType: PlanUsageLimit["limit_type"]): PlanUsageLimit | undefined =>
      summary?.limits.find((l) => l.limit_type === limitType),
    [summary],
  );

  return { summary, loading, error, refetch, getLimit };
}
