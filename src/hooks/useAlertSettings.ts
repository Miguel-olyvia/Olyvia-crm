import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";

export interface AlertSetting {
  is_active: boolean;
  days_threshold: number | null;
}

export type AlertSettingsMap = Record<string, AlertSetting>;

// Defaults aligned with AlertSettings.tsx page (all 17 types)
const DEFAULTS: AlertSettingsMap = {
  // Leads
  lead_no_contact: { is_active: true, days_threshold: 7 },
  lead_no_contact_urgent: { is_active: true, days_threshold: 14 },
  // Contacts
  contact_no_contact: { is_active: true, days_threshold: 7 },
  contact_no_contact_urgent: { is_active: true, days_threshold: 14 },
  contact_no_deal: { is_active: true, days_threshold: 14 },
  // Clients
  client_no_contact: { is_active: true, days_threshold: 30 },
  client_no_contact_urgent: { is_active: true, days_threshold: 60 },
  client_missing_nif: { is_active: true, days_threshold: null },
  // Proposals
  proposal_no_response: { is_active: true, days_threshold: 5 },
  proposal_no_response_urgent: { is_active: true, days_threshold: 10 },
  proposal_no_validity: { is_active: true, days_threshold: null },
  proposal_expired: { is_active: true, days_threshold: null },
  proposal_draft_stale: { is_active: true, days_threshold: 5 },
  // Contracts
  contract_draft_stale: { is_active: true, days_threshold: 3 },
  contract_expiring: { is_active: true, days_threshold: 30 },
  contract_expiring_urgent: { is_active: true, days_threshold: 7 },
  contract_expired: { is_active: true, days_threshold: null },
  contract_sent_no_sign: { is_active: true, days_threshold: 5 },
  // Quotes
  quote_stale: { is_active: true, days_threshold: 30 },
  quote_no_value: { is_active: true, days_threshold: null },
  quote_pending_sent: { is_active: true, days_threshold: 5 },
};

export function useAlertSettings() {
  const { activeCompany } = useCompany();
  const [settings, setSettings] = useState<AlertSettingsMap>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeCompany?.id) {
      setSettings(DEFAULTS);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("alert_settings")
      .select("alert_type, kind, is_active, days_threshold")
      .eq("organization_id", activeCompany.id);

    const merged: AlertSettingsMap = { ...DEFAULTS };
    for (const row of data || []) {
      const kind = (row as any).kind || "alert";
      if (kind !== "alert") continue;
      merged[(row as any).alert_type] = {
        is_active: (row as any).is_active,
        days_threshold: (row as any).days_threshold,
      };
    }
    setSettings(merged);
    setLoading(false);
  }, [activeCompany?.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Returns a settings entry with guaranteed non-null days_threshold via fallbackDays.
  // - If a stored or default setting exists and its days_threshold is null, fallbackDays is used.
  // - If nothing exists at all, returns active=true with fallbackDays.
  const get = useCallback(
    (type: string, fallbackDays = 0): { is_active: boolean; days_threshold: number } => {
      const raw = settings[type] ?? DEFAULTS[type] ?? { is_active: true, days_threshold: fallbackDays };
      return {
        is_active: raw.is_active,
        days_threshold: raw.days_threshold ?? fallbackDays,
      };
    },
    [settings]
  );

  return { settings, get, loading, reload: load };
}
