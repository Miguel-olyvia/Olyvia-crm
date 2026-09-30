import { useCallback, useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PlanKey = "trial" | "starter" | "pro" | "enterprise" | "internal";

export interface BillingInvoice {
  id: string;
  organization_id: string;
  type: "plano" | "creditos";
  package_id: string | null;
  amount: number;
  status: "pendente" | "pago" | "cancelado";
  description: string | null;
  created_at: string;
  paid_at: string | null;
}

export interface BillingOverview {
  error?: string;
  billing_organization_id?: string;
  plan?: PlanKey;
  status?: string;
  trial_ends_at?: string | null;
  current_period_end?: string | null;
  balance_credits?: number | null;
  can_manage_billing?: boolean;
  invoices?: BillingInvoice[];
}

export type BillingLoadErrorKey = "notAMember" | "loadError";

interface Entry {
  data: BillingOverview | null;
  loading: boolean;
  errorKey: BillingLoadErrorKey | null;
  loadedAt: number;
  seq: number;
}

/** Data is reused for this long by every consumer (banner + page) before a new mount refetches. */
const FRESH_MS = 30_000;

const EMPTY: Entry = { data: null, loading: true, errorKey: null, loadedAt: 0, seq: 0 };

// One entry per organization: consumers of an organization share one request and
// a late answer can never surface under another organization.
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let seqCounter = 0;

const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const setEntry = (orgId: string, entry: Entry) => {
  entries.set(orgId, entry);
  emit();
};

/** Test helper: forget everything that was cached. */
export function __resetBillingOverviewStore() {
  entries.clear();
  seqCounter = 0;
  emit();
}

async function loadOverview(orgId: string, force: boolean) {
  const current = entries.get(orgId);
  if (!force && current) {
    if (current.loading) return;
    if (!current.errorKey && Date.now() - current.loadedAt < FRESH_MS) return;
  }
  const seq = ++seqCounter;
  const isStale = () => entries.get(orgId)?.seq !== seq;
  setEntry(orgId, {
    data: current?.data ?? null,
    loading: true,
    errorKey: null,
    loadedAt: current?.loadedAt ?? 0,
    seq,
  });
  try {
    const { data, error } = await (supabase as any).rpc("fn_get_billing_overview", { _organization_id: orgId });
    if (isStale()) return;
    if (error) throw error;
    const overview = data as BillingOverview | null;
    if (!overview || overview.error) {
      throw new Error(overview?.error === "not_a_member" ? "not_a_member" : "billing_overview_unavailable");
    }
    setEntry(orgId, { data: overview, loading: false, errorKey: null, loadedAt: Date.now(), seq });
  } catch (e: any) {
    if (isStale()) return;
    // Fail closed: never keep the previous data (and its controls) after a failed load.
    setEntry(orgId, {
      data: null,
      loading: false,
      errorKey: e?.message === "not_a_member" ? "notAMember" : "loadError",
      loadedAt: Date.now(),
      seq,
    });
  }
}

/**
 * Billing overview of the given organization (fn_get_billing_overview). Billing
 * belongs to the root payer, so the server resolves it and says whether the caller
 * may manage it. Shared between the global banner and the billing page.
 */
export function useBillingOverview(organizationId: string | null | undefined) {
  const entry = useSyncExternalStore(
    subscribe,
    () => (organizationId ? entries.get(organizationId) ?? EMPTY : EMPTY),
    () => EMPTY,
  );

  useEffect(() => {
    if (organizationId) void loadOverview(organizationId, false);
  }, [organizationId]);

  const refresh = useCallback(async () => {
    if (organizationId) await loadOverview(organizationId, true);
  }, [organizationId]);

  if (!organizationId) {
    return { overview: null, loading: false, errorKey: null as BillingLoadErrorKey | null, refresh };
  }
  return { overview: entry.data, loading: entry.loading, errorKey: entry.errorKey, refresh };
}
