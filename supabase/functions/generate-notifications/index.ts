import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";
// Notification engine — runs via cron (anon key → service_role internally)
// v2: Optimized — batch preloads replace N+1 queries

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Default thresholds ───
const ALERT_DEFAULTS: Record<string, { days: number | null; active: boolean }> = {
  lead_no_contact: { days: 7, active: true },
  lead_no_contact_urgent: { days: 14, active: true },
  contact_no_contact: { days: 7, active: true },
  contact_no_contact_urgent: { days: 14, active: true },
  contact_no_deal: { days: 14, active: true },
  client_no_contact: { days: 30, active: true },
  client_no_contact_urgent: { days: 60, active: true },
  client_missing_nif: { days: null, active: true },
  proposal_no_response: { days: 5, active: true },
  proposal_no_response_urgent: { days: 10, active: true },
  proposal_no_validity: { days: null, active: true },
  proposal_expired: { days: null, active: true },
  proposal_draft_stale: { days: 5, active: true },
  contract_draft_stale: { days: 3, active: true },
  contract_expiring: { days: 30, active: true },
  contract_expiring_urgent: { days: 7, active: true },
  contract_expired: { days: null, active: true },
  quote_stale: { days: 30, active: true },
  quote_no_value: { days: null, active: true },
};

interface LegacySettings {
  proposal_no_response_enabled: boolean;
  proposal_no_response_days_1: number;
  proposal_no_response_days_2: number;
  proposal_no_response_days_3: number;
  proposal_expiring_enabled: boolean;
  proposal_expiring_days: number;
  contract_expiring_enabled: boolean;
  contract_expiring_days_1: number;
  contract_expiring_days_2: number;
  client_no_contact_enabled: boolean;
  client_no_contact_days_1: number;
  client_no_contact_days_2: number;
  contact_no_contact_enabled: boolean;
  contact_no_contact_days_1: number;
  contact_no_contact_days_2: number;
  scheduled_actions_enabled: boolean;
  email_tracking_enabled: boolean;
  email_hot_interest_opens: number;
}

const LEGACY_DEFAULTS: LegacySettings = {
  proposal_no_response_enabled: true,
  proposal_no_response_days_1: 3,
  proposal_no_response_days_2: 5,
  proposal_no_response_days_3: 10,
  proposal_expiring_enabled: true,
  proposal_expiring_days: 5,
  contract_expiring_enabled: true,
  contract_expiring_days_1: 30,
  contract_expiring_days_2: 7,
  client_no_contact_enabled: true,
  client_no_contact_days_1: 30,
  client_no_contact_days_2: 60,
  contact_no_contact_enabled: true,
  contact_no_contact_days_1: 7,
  contact_no_contact_days_2: 14,
  scheduled_actions_enabled: true,
  email_tracking_enabled: true,
  email_hot_interest_opens: 3,
};

interface AlertConfig {
  is_active: boolean;
  days_threshold: number | null;
}

// ─── Helper: batch fetch with pagination (handles >1000 rows) ───
async function fetchAll<T>(supabase: any, table: string, query: (q: any) => any): Promise<T[]> {
  const PAGE = 1000;
  let results: T[] = [];
  let offset = 0;
  while (true) {
    const q = query(supabase.from(table).select("*"));
    const { data, error } = await q.range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    results = results.concat(data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") || "fast";
    const now = new Date();

    // Calendar-day diff (avoids ms drift between generation/auto-resolve runs)
    function calendarDayDiff(from: Date, to: Date): number {
      const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
      const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
      return Math.round((end.getTime() - start.getTime()) / 86400000);
    }

    const FINAL_QUOTE_STATES = ["aceite", "perdido", "finalizado", "rejeitado", "recusado", "expirado"];

    console.log(`[notifications] Mode: ${mode}, Time: ${now.toISOString()}`);

    // ─── Load alert_settings + legacy settings in parallel ───
    const [{ data: allAlertSettings }, { data: allLegacySettings }] = await Promise.all([
      supabase.from("alert_settings").select("*").eq("kind", "alert"),
      supabase.from("notification_settings").select("*"),
    ]);

    const alertSettingsMap = new Map<string, Map<string, AlertConfig>>();
    for (const row of allAlertSettings || []) {
      if (!alertSettingsMap.has(row.organization_id)) {
        alertSettingsMap.set(row.organization_id, new Map());
      }
      alertSettingsMap.get(row.organization_id)!.set(row.alert_type, {
        is_active: row.is_active,
        days_threshold: row.days_threshold,
      });
    }

    function getAlertConfig(orgId: string | null, alertType: string): AlertConfig {
      if (orgId && alertSettingsMap.has(orgId)) {
        const orgMap = alertSettingsMap.get(orgId)!;
        if (orgMap.has(alertType)) return orgMap.get(alertType)!;
      }
      const def = ALERT_DEFAULTS[alertType];
      return { is_active: def?.active ?? true, days_threshold: def?.days ?? null };
    }

    const legacyMap = new Map<string, LegacySettings>();
    for (const s of allLegacySettings || []) {
      legacyMap.set(s.organization_id, s as LegacySettings);
    }
    function getLegacy(orgId: string | null): LegacySettings {
      if (orgId && legacyMap.has(orgId)) return legacyMap.get(orgId)!;
      return LEGACY_DEFAULTS;
    }

    // ═══════════════════════════════════════════
    // STEP 0: CLEANUP (parallel RPCs)
    // ═══════════════════════════════════════════
    const [{ data: orphanResult }, { data: dupResult }] = await Promise.all([
      supabase.rpc("cleanup_orphan_notifications"),
      supabase.rpc("cleanup_duplicate_notifications"),
    ]);
    const cleanupOrphans = orphanResult ?? 0;
    const cleanupDuplicates = dupResult ?? 0;

    let cleanupOld = 0;
    if (mode === "daily") {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
      const [r1, r2] = await Promise.all([
        supabase.from("notifications").delete().eq("kind", "notification").eq("is_resolved", true).lt("resolved_at", thirtyDaysAgo),
        supabase.from("notifications").delete().eq("kind", "notification").eq("is_dismissed", true).lt("created_at", thirtyDaysAgo),
      ]);
      cleanupOld = (r1.count || 0) + (r2.count || 0);
    }

    console.log(`[notifications] Cleanup: orphans=${cleanupOrphans}, duplicates=${cleanupDuplicates}, old=${cleanupOld}`);

    // ═══════════════════════════════════════════
    // STEP 1: AUTO-RESOLVE existing notifications
    // ═══════════════════════════════════════════
    let resolvedCount = 0;
    const { data: pendingNotifications } = await supabase
      .from("notifications")
      .select("id, type, entity_type, entity_id, user_id, organization_id, action_config, created_at")
      .eq("is_resolved", false)
      .eq("is_dismissed", false)
      .eq("kind", "alert");

    // ── Grouped resolver: one update per resolved_reason ──
    const toResolveByReason = new Map<string, string[]>();
    function markResolved(id: string, reason: string) {
      if (!toResolveByReason.has(reason)) toResolveByReason.set(reason, []);
      toResolveByReason.get(reason)!.push(id);
    }

    if (pendingNotifications && pendingNotifications.length > 0) {
      // ── Global is_active guard: types covered by /alert-settings ──
      const SETTING_GATED_TYPES = new Set<string>([
        "lead_no_contact", "lead_no_contact_urgent",
        "contact_no_contact", "contact_no_contact_urgent", "contact_no_contact_7d", "contact_no_contact_14d",
        "contact_no_deal",
        "client_no_contact", "client_no_contact_urgent",
        "client_missing_nif",
        "proposal_no_response", "proposal_no_response_urgent",
        "proposal_no_validity", "proposal_expired", "proposal_draft_stale",
        "contract_draft_stale", "contract_expiring", "contract_expiring_urgent", "contract_expired",
        "quote_stale", "quote_no_value",
      ]);

      const stillPending: typeof pendingNotifications = [];
      for (const n of pendingNotifications) {
        if (SETTING_GATED_TYPES.has(n.type)) {
          const lookupType = n.type === "contact_no_contact_7d"
            ? "contact_no_contact"
            : n.type === "contact_no_contact_14d"
              ? "contact_no_contact_urgent"
              : n.type;
          const cfg = getAlertConfig(n.organization_id, lookupType);
          if (cfg.is_active === false) {
            markResolved(n.id, "alert_setting_disabled");
            continue;
          }
        }
        stillPending.push(n);
      }

      // ── Batch preload entities for resolution ──
      const leadNotifs = stillPending.filter(n => n.entity_type === "lead" && (n.type === "lead_no_contact" || n.type === "lead_no_contact_urgent"));
      const contactNoContactNotifs = stillPending.filter(n => n.entity_type === "contact" && (n.type === "contact_no_contact" || n.type === "contact_no_contact_urgent" || n.type === "contact_no_contact_7d" || n.type === "contact_no_contact_14d"));
      const contactNoDealNotifs = stillPending.filter(n => n.entity_type === "contact" && n.type === "contact_no_deal");
      const clientNoContactNotifs = stillPending.filter(n => n.entity_type === "client" && (n.type === "client_no_contact" || n.type === "client_no_contact_urgent"));
      const clientNifNotifs = stillPending.filter(n => n.entity_type === "client" && n.type === "client_missing_nif");
      const proposalNotifs = stillPending.filter(n => n.entity_type === "proposal");
      const contractNotifs = stillPending.filter(n => n.entity_type === "contract");
      const quoteNotifs = stillPending.filter(n => n.entity_type === "quote");
      const actionNotifs = stillPending.filter(n => n.type === "action_due_today" || n.type === "action_overdue");
      const summaryNotifs = stillPending.filter(n => (n.type?.startsWith("lead_") && n.entity_type === "lead" && n.entity_id === n.user_id) || (n.type?.startsWith("contact_") && n.entity_type === "contact" && n.entity_id === n.user_id) || (n.type?.startsWith("client_") && n.entity_type === "client" && n.entity_id === n.user_id));

      // Batch fetch all needed entities in parallel
      const leadIds = [...new Set(leadNotifs.map(n => n.entity_id))];
      const contactIds = [...new Set([...contactNoContactNotifs, ...contactNoDealNotifs].map(n => n.entity_id))];
      const clientIds = [...new Set([...clientNoContactNotifs, ...clientNifNotifs].map(n => n.entity_id))];
      const proposalIds = [...new Set(proposalNotifs.map(n => n.entity_id))];
      const contractIds = [...new Set(contractNotifs.map(n => n.entity_id))];
      const quoteIds = [...new Set(quoteNotifs.map(n => n.entity_id))];

      const [
        { data: leads },
        { data: contacts },
        { data: clients },
        { data: proposals },
        { data: contracts },
        { data: quotesPre },
      ] = await Promise.all([
        leadIds.length > 0 ? supabase.from("anew_leads").select("id, last_contact_at, status").in("id", leadIds) : { data: [] },
        contactIds.length > 0 ? supabase.from("anew_contacts").select("id, last_interaction_at, converted_to_client_id, status").in("id", contactIds) : { data: [] },
        clientIds.length > 0 ? supabase.from("anew_clients").select("id, last_interaction_at, status, entity_id").in("id", clientIds) : { data: [] },
        proposalIds.length > 0 ? supabase.from("proposals").select("id, status, sent_at, created_at, organization_id").in("id", proposalIds) : { data: [] },
        contractIds.length > 0 ? supabase.from("client_contracts").select("id, status, end_date, client_id, created_at").in("id", contractIds) : { data: [] },
        quoteIds.length > 0 ? supabase.from("quotes").select("id, estado, total, updated_at, created_at").in("id", quoteIds) : { data: [] },
      ]);

      const leadMap = new Map((leads || []).map((l: any) => [l.id, l]));
      const contactMap = new Map((contacts || []).map((c: any) => [c.id, c]));
      const clientMap = new Map((clients || []).map((c: any) => [c.id, c]));
      const proposalMap = new Map((proposals || []).map((p: any) => [p.id, p]));
      const contractMap = new Map((contracts || []).map((c: any) => [c.id, c]));
      const quoteMap = new Map((quotesPre || []).map((q: any) => [q.id, q]));

      // ── Leads ──
      for (const n of leadNotifs) {
        const lead = leadMap.get(n.entity_id);
        if (!lead) { markResolved(n.id, "entity_missing"); continue; }
        if (lead.status === "converted") { markResolved(n.id, "condition_changed"); continue; }
        const cfg = getAlertConfig(n.organization_id, n.type);
        if (lead.last_contact_at && cfg.days_threshold) {
          const daysSince = Math.floor((now.getTime() - new Date(lead.last_contact_at).getTime()) / 86400000);
          if (daysSince < cfg.days_threshold) markResolved(n.id, "condition_changed");
        }
      }

      // ── Contacts: no contact ──
      for (const n of contactNoContactNotifs) {
        const contact = contactMap.get(n.entity_id);
        if (!contact) { markResolved(n.id, "entity_missing"); continue; }
        if (contact.converted_to_client_id || contact.status === "inactive") { markResolved(n.id, "condition_changed"); continue; }
        const cfg = getAlertConfig(n.organization_id, n.type.replace("_7d", "").replace("_14d", "_urgent"));
        if (contact.last_interaction_at && cfg.days_threshold) {
          const daysSince = Math.floor((now.getTime() - new Date(contact.last_interaction_at).getTime()) / 86400000);
          if (daysSince < cfg.days_threshold) markResolved(n.id, "condition_changed");
        }
      }

      // ── Contacts: no deal (batch deals count) ──
      if (contactNoDealNotifs.length > 0) {
        const noDealContactIds = [...new Set(contactNoDealNotifs.map(n => n.entity_id))];
        const { data: dealsForContacts } = await supabase.from("deals").select("contact_id").in("contact_id", noDealContactIds);
        const contactsWithDeals = new Set((dealsForContacts || []).map((d: any) => d.contact_id));

        for (const n of contactNoDealNotifs) {
          const contact = contactMap.get(n.entity_id);
          if (!contact || contact.converted_to_client_id || contact.status === "inactive") { markResolved(n.id, "condition_changed"); continue; }
          if (contactsWithDeals.has(n.entity_id)) markResolved(n.id, "condition_changed");
        }
      }

      // ── Clients: no contact ──
      const inactiveStatuses = ["lost", "inactive", "churned", "lost_definitive"];
      for (const n of clientNoContactNotifs) {
        const client = clientMap.get(n.entity_id);
        if (!client) { markResolved(n.id, "entity_missing"); continue; }
        if (inactiveStatuses.includes(client.status || "")) { markResolved(n.id, "condition_changed"); continue; }
        const cfg = getAlertConfig(n.organization_id, n.type);
        if (client.last_interaction_at && cfg.days_threshold) {
          const daysSince = Math.floor((now.getTime() - new Date(client.last_interaction_at).getTime()) / 86400000);
          if (daysSince < cfg.days_threshold) markResolved(n.id, "condition_changed");
        }
      }

      // ── Clients: missing NIF (batch fiscal entity check) ──
      if (clientNifNotifs.length > 0) {
        const nifClientEntityIds = [...new Set(
          clientNifNotifs.map(n => clientMap.get(n.entity_id)?.entity_id).filter(Boolean)
        )] as string[];
        const { data: fiscalEntities } = nifClientEntityIds.length > 0
          ? await supabase.from("anew_entity_fiscal_entities").select("entity_id").in("entity_id", nifClientEntityIds)
          : { data: [] };
        const entitiesWithFiscal = new Set((fiscalEntities || []).map((f: any) => f.entity_id));

        for (const n of clientNifNotifs) {
          const client = clientMap.get(n.entity_id);
          if (!client) { markResolved(n.id, "entity_missing"); continue; }
          if (entitiesWithFiscal.has(client.entity_id)) markResolved(n.id, "condition_changed");
        }
      }

      // ── Proposals ──
      for (const n of proposalNotifs) {
        const proposal = proposalMap.get(n.entity_id);
        if (!proposal) { markResolved(n.id, "entity_missing"); continue; }
        if (!proposal.organization_id) { markResolved(n.id, "entity_missing"); continue; }

        if (n.type === "proposal_no_response" || n.type === "proposal_no_response_urgent") {
          if (proposal.status !== "sent") { markResolved(n.id, "condition_changed"); continue; }
          if (!proposal.sent_at) { markResolved(n.id, "condition_changed"); continue; }
          const cfg = getAlertConfig(n.organization_id, n.type);
          const daysSinceSent = Math.floor((now.getTime() - new Date(proposal.sent_at).getTime()) / 86400000);
          if (cfg.days_threshold && daysSinceSent < cfg.days_threshold) { markResolved(n.id, "condition_changed"); continue; }
          if (n.type === "proposal_no_response") {
            const cfgUrg = getAlertConfig(n.organization_id, "proposal_no_response_urgent");
            if (cfgUrg.is_active && cfgUrg.days_threshold && daysSinceSent >= cfgUrg.days_threshold) {
              markResolved(n.id, "superseded_by_urgent");
            }
          }
        } else if (n.type === "proposal_draft_stale") {
          if (proposal.status !== "draft") { markResolved(n.id, "condition_changed"); continue; }
          const cfg = getAlertConfig(n.organization_id, n.type);
          if (proposal.created_at && cfg.days_threshold) {
            const daysSinceCreated = Math.floor((now.getTime() - new Date(proposal.created_at).getTime()) / 86400000);
            if (daysSinceCreated < cfg.days_threshold) markResolved(n.id, "condition_changed");
          }
        } else if (n.type === "proposal_expired" && (proposal.status === "accepted" || proposal.status === "won")) {
          markResolved(n.id, "condition_changed");
        }
      }

      // ── Contracts ──
      const TERMINAL_CONTRACT = ["cancelled", "renewed", "terminated", "rejected", "expired"];
      for (const n of contractNotifs) {
        const contract = contractMap.get(n.entity_id);
        if (!contract) { markResolved(n.id, "entity_missing"); continue; }

        if (n.type === "contract_draft_stale") {
          if (contract.status !== "draft") { markResolved(n.id, "condition_changed"); continue; }
          const cfg = getAlertConfig(n.organization_id, n.type);
          if (contract.created_at && cfg.days_threshold) {
            const daysSinceCreated = Math.floor((now.getTime() - new Date(contract.created_at).getTime()) / 86400000);
            if (daysSinceCreated < cfg.days_threshold) markResolved(n.id, "condition_changed");
          }
        } else if (n.type === "contract_expiring" || n.type === "contract_expiring_urgent") {
          if (!contract.client_id) { markResolved(n.id, "condition_changed"); continue; }
          if (!contract.end_date) { markResolved(n.id, "condition_changed"); continue; }
          if (TERMINAL_CONTRACT.includes(contract.status)) { markResolved(n.id, "condition_changed"); continue; }
          const cfg = getAlertConfig(n.organization_id, n.type);
          const daysUntilEnd = calendarDayDiff(now, new Date(contract.end_date));
          if (daysUntilEnd < 0) { markResolved(n.id, "condition_changed"); continue; }
          if (cfg.days_threshold && daysUntilEnd > cfg.days_threshold) { markResolved(n.id, "condition_changed"); continue; }
          if (n.type === "contract_expiring") {
            const cfgUrg = getAlertConfig(n.organization_id, "contract_expiring_urgent");
            if (cfgUrg.is_active && cfgUrg.days_threshold && daysUntilEnd <= cfgUrg.days_threshold) {
              markResolved(n.id, "superseded_by_urgent");
            }
          }
        } else if (n.type === "contract_expired" && contract.status === "renewed") {
          markResolved(n.id, "condition_changed");
        }
      }

      // ── Quotes ──
      for (const n of quoteNotifs) {
        const quote = quoteMap.get(n.entity_id);
        if (!quote) { markResolved(n.id, "entity_missing"); continue; }
        if (FINAL_QUOTE_STATES.includes(quote.estado)) { markResolved(n.id, "condition_changed"); continue; }

        if (n.type === "quote_stale") {
          const cfg = getAlertConfig(n.organization_id, n.type);
          const lastChange = quote.updated_at || quote.created_at;
          if (lastChange && cfg.days_threshold) {
            const daysSince = Math.floor((now.getTime() - new Date(lastChange).getTime()) / 86400000);
            if (daysSince < cfg.days_threshold) markResolved(n.id, "condition_changed");
          }
        } else if (n.type === "quote_no_value") {
          if (Number(quote.total) > 0) markResolved(n.id, "condition_changed");
        }
      }

      // ── Scheduled actions ──
      for (const n of actionNotifs) {
        const nextActionDateRaw = (n.action_config as Record<string, unknown> | null)?.next_action_date;
        if (typeof nextActionDateRaw !== "string") { markResolved(n.id, "condition_changed"); continue; }
        const nextActionDate = new Date(nextActionDateRaw);
        if (Number.isNaN(nextActionDate.getTime())) { markResolved(n.id, "condition_changed"); continue; }
        const endOfToday = new Date(now);
        endOfToday.setHours(23, 59, 59, 999);
        if (n.type === "action_due_today" && nextActionDate > endOfToday) markResolved(n.id, "condition_changed");
        else if (n.type === "action_overdue" && nextActionDate >= now) markResolved(n.id, "condition_changed");
      }

      // ── Summary notifications with empty entity_ids ──
      for (const n of summaryNotifs) {
        const data = n.action_config as Record<string, unknown> | null;
        const entityIds = (data?.entity_ids as string[]) || [];
        if (entityIds.length === 0) markResolved(n.id, "condition_changed");
      }

      // ── Execute one update per reason (chunked) ──
      const resolvePromises = [];
      for (const [reason, ids] of toResolveByReason) {
        const uniqueIds = [...new Set(ids)];
        for (let i = 0; i < uniqueIds.length; i += 100) {
          const chunk = uniqueIds.slice(i, i + 100);
          resolvePromises.push(
            supabase.from("notifications").update({
              is_resolved: true,
              resolved_at: now.toISOString(),
              resolved_reason: reason,
            }).in("id", chunk)
          );
        }
        resolvedCount += uniqueIds.length;
      }
      if (resolvePromises.length > 0) await Promise.all(resolvePromises);

      console.log(`[notifications] Resolution: ${pendingNotifications.length} pending, ${resolvedCount} resolved (${toResolveByReason.size} reasons)`);
    }


    // ═══════════════════════════════════════════
    // STEP 2: GENERATE NEW NOTIFICATIONS
    // ═══════════════════════════════════════════
    const notifications: any[] = [];
    const queuedNotificationKeys = new Set<string>();

    // ★ OPTIMIZATION: Batch preload ALL active notifications for dedup
    // Instead of N individual queries, one single query loads all active notification keys
    const { data: activeNotifs } = await supabase
      .from("notifications")
      .select("entity_id, type, user_id")
      .eq("kind", "alert")
      .eq("is_resolved", false)
      .eq("is_dismissed", false);

    const existingNotifKeys = new Set<string>();
    for (const n of activeNotifs || []) {
      existingNotifKeys.add(`${n.type}::${n.entity_id}::${n.user_id}`);
    }

    function shouldSkip(entityId: string, type: string, userId: string): boolean {
      const key = `${type}::${entityId}::${userId}`;
      if (queuedNotificationKeys.has(key)) return true;
      return existingNotifKeys.has(key);
    }

    function queueNotification(notification: any) {
      const key = `${notification.type}::${notification.entity_id}::${notification.user_id}`;
      if (queuedNotificationKeys.has(key)) return;
      queuedNotificationKeys.add(key);
      notifications.push(notification);
    }

    // ★ OPTIMIZATION: Batch preload user ID mappings (anew_users → auth_user_id)
    const { data: allUsers } = await supabase.from("anew_users").select("id, auth_user_id");
    const userIdMap = new Map<string, string>();
    for (const u of allUsers || []) {
      if (u.auth_user_id) userIdMap.set(u.id, u.auth_user_id);
    }

    function resolveUserId(anewUserId: string): string | null {
      return userIdMap.get(anewUserId) || null;
    }

    function smartResolveUserId(id: string | null): string | null {
      if (!id) return null;
      const resolved = userIdMap.get(id);
      if (resolved) return resolved;
      // Check if it's already an auth user ID (value in the map)
      for (const authId of userIdMap.values()) {
        if (authId === id) return id;
      }
      return null;
    }

    // ─────────────────────────────────────────
    // FAST MODE
    // ─────────────────────────────────────────
    if (mode === "fast") {
      // ── PROPOSALS (batch fetch, no N+1) ──
      const { data: proposals } = await supabase
        .from("proposals")
        .select("id, status, sent_at, valid_until, created_at, created_by, organization_id")
        .in("status", ["sent", "pending", "active", "draft"]);

      for (const p of proposals || []) {
        if (!p.created_by || !p.organization_id) continue;
        const userId = resolveUserId(p.created_by);
        if (!userId) continue;
        const orgId = p.organization_id;

        if (p.status === "sent" && p.sent_at) {
          const daysSinceSent = Math.floor((now.getTime() - new Date(p.sent_at).getTime()) / 86400000);
          const cfgUrg = getAlertConfig(orgId, "proposal_no_response_urgent");
          const cfgNorm = getAlertConfig(orgId, "proposal_no_response");

          if (cfgUrg.is_active && cfgUrg.days_threshold && daysSinceSent >= cfgUrg.days_threshold && !shouldSkip(p.id, "proposal_no_response_urgent", userId)) {
            queueNotification({
              user_id: userId, organization_id: orgId, kind: "alert",
              type: "proposal_no_response_urgent", entity_type: "proposal", entity_id: p.id,
              title: `Proposta sem resposta há ${cfgUrg.days_threshold} dias`,
              message: `Esta proposta foi enviada há mais de ${cfgUrg.days_threshold} dias sem resposta.`,
              priority: "high", action_type: "send_followup",
              action_config: { proposal_id: p.id },
            });
          } else if (cfgNorm.is_active && cfgNorm.days_threshold && daysSinceSent >= cfgNorm.days_threshold && !shouldSkip(p.id, "proposal_no_response", userId)) {
            queueNotification({
              user_id: userId, organization_id: orgId, kind: "alert",
              type: "proposal_no_response", entity_type: "proposal", entity_id: p.id,
              title: `Proposta sem resposta há ${cfgNorm.days_threshold} dias`,
              message: "Considere enviar um follow-up ao cliente.",
              priority: "medium", action_type: "send_followup",
              action_config: { proposal_id: p.id },
            });
          }
        }

        const cfgNoVal = getAlertConfig(orgId, "proposal_no_validity");
        if (cfgNoVal.is_active && !p.valid_until && p.status !== "draft" && !shouldSkip(p.id, "proposal_no_validity", userId)) {
          queueNotification({
            user_id: userId, organization_id: orgId, kind: "alert",
            type: "proposal_no_validity", entity_type: "proposal", entity_id: p.id,
            title: "Proposta sem validade definida",
            message: "Esta proposta não tem data de validade configurada.",
            priority: "low",
          });
        }

        const cfgExpired = getAlertConfig(orgId, "proposal_expired");
        if (cfgExpired.is_active && p.valid_until) {
          const daysUntilExpiry = Math.floor((new Date(p.valid_until).getTime() - now.getTime()) / 86400000);
          if (daysUntilExpiry < 0 && !shouldSkip(p.id, "proposal_expired", userId)) {
            queueNotification({
              user_id: userId, organization_id: orgId, kind: "alert",
              type: "proposal_expired", entity_type: "proposal", entity_id: p.id,
              title: "Proposta expirada",
              message: "A validade desta proposta expirou.",
              priority: "high", action_type: "renew_validity",
              action_config: { proposal_id: p.id },
            });
          }
        }

        const cfgDraft = getAlertConfig(orgId, "proposal_draft_stale");
        if (cfgDraft.is_active && cfgDraft.days_threshold && p.status === "draft" && p.created_at) {
          const daysSinceCreated = Math.floor((now.getTime() - new Date(p.created_at).getTime()) / 86400000);
          if (daysSinceCreated >= cfgDraft.days_threshold && !shouldSkip(p.id, "proposal_draft_stale", userId)) {
            queueNotification({
              user_id: userId, organization_id: orgId, kind: "alert",
              type: "proposal_draft_stale", entity_type: "proposal", entity_id: p.id,
              title: `Proposta em rascunho há ${cfgDraft.days_threshold} dias`,
              message: "Esta proposta está em rascunho há vários dias sem ser enviada.",
              priority: "medium",
            });
          }
        }
      }

      // ── CONTRACTS (batch fetch) ──
      const { data: contracts } = await supabase
        .from("client_contracts")
        .select("id, end_date, status, created_at, created_by, organization_id, client_id")
        .neq("status", "cancelled");

      for (const ct of contracts || []) {
        if (!ct.created_by) continue;
        const userId = resolveUserId(ct.created_by);
        if (!userId) continue;
        const orgId = ct.organization_id;

        const cfgDraft = getAlertConfig(orgId, "contract_draft_stale");
        if (cfgDraft.is_active && cfgDraft.days_threshold && ct.status === "draft" && ct.created_at) {
          const daysSince = Math.floor((now.getTime() - new Date(ct.created_at).getTime()) / 86400000);
          if (daysSince >= cfgDraft.days_threshold && !shouldSkip(ct.id, "contract_draft_stale", userId)) {
            queueNotification({
              user_id: userId, organization_id: orgId, kind: "alert",
              type: "contract_draft_stale", entity_type: "contract", entity_id: ct.id,
              title: `Contrato em draft há ${cfgDraft.days_threshold} dias`,
              message: "Este contrato está em draft há vários dias sem ser enviado.",
              priority: "medium",
            });
          }
        }

        if (ct.end_date) {
          const daysUntilEnd = calendarDayDiff(now, new Date(ct.end_date));
          const cfgExpired = getAlertConfig(orgId, "contract_expired");
          if (cfgExpired.is_active && daysUntilEnd < 0 && !shouldSkip(ct.id, "contract_expired", userId)) {
            queueNotification({
              user_id: userId, organization_id: orgId, kind: "alert",
              type: "contract_expired", entity_type: "contract", entity_id: ct.id,
              title: "Contrato expirado",
              message: "Este contrato já expirou.",
              priority: "high", action_type: "send_renewal",
              action_config: { contract_id: ct.id },
            });
          }
          // Expiração próxima requer cliente associado (renovação só faz sentido com client_id)
          if (!ct.client_id) continue;
          const cfgExpUrg = getAlertConfig(orgId, "contract_expiring_urgent");
          const cfgExp = getAlertConfig(orgId, "contract_expiring");
          const ELIGIBLE_FOR_EXPIRING = ["signed", "active", "pending_signature"];
          if (!ELIGIBLE_FOR_EXPIRING.includes(ct.status)) continue;
          if (cfgExpUrg.is_active && cfgExpUrg.days_threshold && daysUntilEnd >= 0 && daysUntilEnd <= cfgExpUrg.days_threshold && !shouldSkip(ct.id, "contract_expiring_urgent", userId)) {
            queueNotification({
              user_id: userId, organization_id: orgId, kind: "alert",
              type: "contract_expiring_urgent", entity_type: "contract", entity_id: ct.id,
              title: `Contrato expira em ${daysUntilEnd} dias`,
              message: "Este contrato está prestes a expirar.",
              priority: "high", action_type: "send_renewal",
              action_config: { contract_id: ct.id },
            });
          } else if (cfgExp.is_active && cfgExp.days_threshold && daysUntilEnd >= 0 && daysUntilEnd <= cfgExp.days_threshold && !shouldSkip(ct.id, "contract_expiring", userId)) {
            queueNotification({
              user_id: userId, organization_id: orgId, kind: "alert",
              type: "contract_expiring", entity_type: "contract", entity_id: ct.id,
              title: `Contrato expira em ${daysUntilEnd} dias`,
              message: "Prepare a renovação deste contrato.",
              priority: "medium",
            });
          }
        }
      }

      // ── QUOTES (batch fetch) ──
      // NOTE: quotes table uses `estado` (not `status`), `total` (not `total_amount`),
      // and has no `stage_changed_at` column — fall back to `updated_at`.
      const { data: quotes } = await supabase
        .from("quotes")
        .select("id, estado, updated_at, total, created_by, organization_id, created_at");

      for (const q of quotes || []) {
        if (!q.created_by) continue;
        if (FINAL_QUOTE_STATES.includes(q.estado)) continue;
        const userId = resolveUserId(q.created_by);
        if (!userId) continue;
        const orgId = q.organization_id;


        const cfgStale = getAlertConfig(orgId, "quote_stale");
        if (cfgStale.is_active && cfgStale.days_threshold) {
          const lastChange = q.updated_at || q.created_at;
          if (lastChange) {
            const daysSince = Math.floor((now.getTime() - new Date(lastChange).getTime()) / 86400000);
            if (daysSince >= cfgStale.days_threshold && !shouldSkip(q.id, "quote_stale", userId)) {
              queueNotification({
                user_id: userId, organization_id: orgId, kind: "alert",
                type: "quote_stale", entity_type: "quote", entity_id: q.id,
                title: `Pedido parado há ${cfgStale.days_threshold} dias`,
                message: "Este pedido de proposta está no mesmo stage há muito tempo.",
                priority: "medium",
              });
            }
          }
        }

        const cfgNoVal = getAlertConfig(orgId, "quote_no_value");
        if (cfgNoVal.is_active && (!q.total || Number(q.total) === 0) && !shouldSkip(q.id, "quote_no_value", userId)) {
          queueNotification({
            user_id: userId, organization_id: orgId, kind: "alert",
            type: "quote_no_value", entity_type: "quote", entity_id: q.id,
            title: "Pedido sem valor definido",
            message: "Este pedido de proposta não tem valor definido.",
            priority: "low",
          });
        }
      }

      // ── SCHEDULED NEXT ACTIONS (batch with optimized entity validation) ──
      const endOfToday = new Date(now);
      endOfToday.setHours(23, 59, 59, 999);
      const { data: scheduledActions } = await supabase
        .from("entity_interactions")
        .select("id, entity_id, next_action_type, next_action_date, created_by, organization_id")
        .not("next_action_date", "is", null)
        .not("next_action_type", "is", null)
        .lte("next_action_date", endOfToday.toISOString());

      if (scheduledActions && scheduledActions.length > 0) {
        const actionLabels: Record<string, string> = {
          follow_up: "Follow-up",
          send_proposal: "Enviar proposta",
          schedule_meeting: "Agendar reunião",
          send_info: "Enviar informação",
        };

        // ★ OPTIMIZATION: Batch preload entity names + CRM membership
        const actionEntityIds = [...new Set(scheduledActions.map(a => a.entity_id))];
        const actionOrgIds = [...new Set(scheduledActions.map(a => a.organization_id))];

        const [
          { data: entityNames },
          { data: actionClients },
          { data: actionContacts },
          { data: actionLeads },
        ] = await Promise.all([
          supabase.from("anew_entities").select("id, display_name").in("id", actionEntityIds),
          supabase.from("anew_clients").select("id, entity_id, organization_id").in("entity_id", actionEntityIds).in("organization_id", actionOrgIds).neq("status", "inactive"),
          supabase.from("anew_contacts").select("id, entity_id, organization_id").in("entity_id", actionEntityIds).in("organization_id", actionOrgIds).is("converted_to_client_id", null).neq("status", "inactive"),
          supabase.from("anew_leads").select("id, entity_id, organization_id").in("entity_id", actionEntityIds).in("organization_id", actionOrgIds).neq("status", "converted"),
        ]);

        const entityNameMap = new Map((entityNames || []).map((e: any) => [e.id, e.display_name]));

        // Build lookup: entityId::orgId → entity type
        const entityTypeMap = new Map<string, string>();
        for (const c of actionClients || []) entityTypeMap.set(`${c.entity_id}::${c.organization_id}`, "client");
        for (const c of actionContacts || []) {
          const key = `${c.entity_id}::${c.organization_id}`;
          if (!entityTypeMap.has(key)) entityTypeMap.set(key, "contact");
        }
        for (const l of actionLeads || []) {
          const key = `${l.entity_id}::${l.organization_id}`;
          if (!entityTypeMap.has(key)) entityTypeMap.set(key, "lead");
        }

        for (const action of scheduledActions) {
          const legacy = getLegacy(action.organization_id);
          if (!legacy.scheduled_actions_enabled) continue;
          const userId = action.created_by;
          if (!userId) continue;
          const authUserId = resolveUserId(userId);
          if (!authUserId) continue;

          const entityKey = `${action.entity_id}::${action.organization_id}`;
          const resolvedEntityType = entityTypeMap.get(entityKey);
          if (!resolvedEntityType) {
            console.log(`[notifications] Skipping orphaned scheduled action for entity ${action.entity_id} in org ${action.organization_id}`);
            continue;
          }

          const actionDate = new Date(action.next_action_date);
          const isOverdue = actionDate < now;
          const actionLabel = actionLabels[action.next_action_type] || action.next_action_type;
          const entityName = entityNameMap.get(action.entity_id) || "Contacto";

          const scheduledActionConfig = {
            entity_id: action.entity_id,
            interaction_id: action.id,
            next_action_type: action.next_action_type,
            next_action_date: action.next_action_date,
          };

          if (isOverdue) {
            if (!shouldSkip(action.entity_id, "action_overdue", authUserId)) {
              queueNotification({
                user_id: authUserId, organization_id: action.organization_id, kind: "alert",
                type: "action_overdue", entity_type: resolvedEntityType, entity_id: action.entity_id,
                title: `⚠️ Acção em atraso: ${actionLabel}`,
                message: `A acção "${actionLabel}" para ${entityName} já passou da hora prevista.`,
                priority: "high", action_type: "call_now",
                action_config: scheduledActionConfig,
              });
            }
          } else {
            if (!shouldSkip(action.entity_id, "action_due_today", authUserId)) {
              queueNotification({
                user_id: authUserId, organization_id: action.organization_id, kind: "alert",
                type: "action_due_today", entity_type: resolvedEntityType, entity_id: action.entity_id,
                title: `📋 Acção agendada: ${actionLabel}`,
                message: `Tem uma acção "${actionLabel}" agendada para hoje com ${entityName}.`,
                priority: "medium", action_type: "call_now",
                action_config: scheduledActionConfig,
              });
            }
          }
        }
      }

      // ── EMAIL TRACKING (batch preload proposals) ──
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentOpens } = await supabase
        .from("proposal_sends")
        .select("id, proposal_id, first_opened_at, open_count, recipient_email")
        .not("first_opened_at", "is", null)
        .gte("first_opened_at", oneDayAgo);

      if (recentOpens && recentOpens.length > 0) {
        // ★ OPTIMIZATION: Batch preload proposals for email tracking
        const trackingProposalIds = [...new Set(recentOpens.map(ps => ps.proposal_id))];
        const { data: trackingProposals } = await supabase
          .from("proposals")
          .select("id, created_by, organization_id")
          .in("id", trackingProposalIds);
        const trackingProposalMap = new Map((trackingProposals || []).map((p: any) => [p.id, p]));

        for (const ps of recentOpens) {
          const proposal = trackingProposalMap.get(ps.proposal_id);
          if (!proposal?.created_by) continue;
          const trackingAuthUserId = resolveUserId(proposal.created_by);
          if (!trackingAuthUserId) continue;
          const legacy = getLegacy(proposal.organization_id);
          if (!legacy.email_tracking_enabled) continue;

          if ((ps.open_count || 0) >= legacy.email_hot_interest_opens && !shouldSkip(ps.proposal_id, "email_hot_interest", trackingAuthUserId)) {
            queueNotification({
              user_id: trackingAuthUserId, organization_id: proposal.organization_id, kind: "alert",
              type: "email_hot_interest", entity_type: "email_tracking", entity_id: ps.proposal_id,
              title: "🔥 Forte interesse — ligar agora!",
              message: `${ps.recipient_email} abriu o email ${ps.open_count}+ vezes hoje.`,
              priority: "urgent", action_type: "call_now",
              action_config: { proposal_id: ps.proposal_id },
            });
          } else if (!shouldSkip(ps.proposal_id, "email_opened", trackingAuthUserId)) {
            queueNotification({
              user_id: trackingAuthUserId, organization_id: proposal.organization_id, kind: "alert",
              type: "email_opened", entity_type: "email_tracking", entity_id: ps.proposal_id,
              title: "👁 Email aberto",
              message: `${ps.recipient_email} abriu o email agora.`,
              priority: "low",
            });
          }
        }
      }
    }

    // ─────────────────────────────────────────
    // DAILY MODE
    // ─────────────────────────────────────────
    if (mode === "daily") {
      const timeBasedTypes = [
        "lead_no_contact", "lead_no_contact_urgent",
        "contact_no_contact", "contact_no_contact_urgent", "contact_no_contact_7d", "contact_no_contact_14d",
        "contact_no_deal",
        "client_no_contact", "client_no_contact_urgent",
        "client_missing_nif",
      ];

      await Promise.all([
        supabase.from("notifications")
          .update({ is_resolved: true, resolved_at: now.toISOString(), resolved_reason: "replaced_by_summary" })
          .eq("is_resolved", false).eq("is_dismissed", false).eq("kind", "alert").in("type", timeBasedTypes),
      ]);

      const pl = (n: number, s: string, p: string) => n === 1 ? `${n} ${s}` : `${n} ${p}`;

      // ── LEADS: grouped by user ──
      const { data: rawLeads } = await supabase
        .from("anew_leads")
        .select("id, entity_id, assigned_to, created_by, organization_id, last_contact_at, created_at, status, converted_to_contact_id, converted_at, client_id")
        .not("status", "eq", "converted")
        .not("status", "eq", "inactive")
        .is("converted_to_contact_id", null)
        .is("converted_at", null)
        .is("client_id", null);

      let filteredLeads = rawLeads || [];
      const leadEntityIds = filteredLeads.map(l => l.entity_id).filter(Boolean) as string[];

      if (leadEntityIds.length > 0) {
        const excludedEntityIds = new Set<string>();

        // ★ OPTIMIZATION: Batch all chain validation queries in parallel
        const [
          { data: inactiveContacts },
          { data: convertedContacts },
          { data: inactiveDirectClients },
        ] = await Promise.all([
          supabase.from("anew_contacts").select("entity_id").in("entity_id", leadEntityIds).eq("status", "inactive"),
          supabase.from("anew_contacts").select("entity_id, converted_to_client_id").in("entity_id", leadEntityIds).not("converted_to_client_id", "is", null),
          supabase.from("anew_clients").select("entity_id").in("entity_id", leadEntityIds).in("status", ["inactive", "lost", "churned", "lost_definitive"]),
        ]);

        inactiveContacts?.forEach((c: any) => excludedEntityIds.add(c.entity_id));
        inactiveDirectClients?.forEach((c: any) => excludedEntityIds.add(c.entity_id));

        if (convertedContacts?.length) {
          const clientIds = convertedContacts.map((c: any) => c.converted_to_client_id).filter(Boolean);
          const { data: activeClients } = await supabase
            .from("anew_clients").select("id").in("id", clientIds)
            .not("status", "in", '("inactive","lost","churned","lost_definitive")');
          const activeClientIds = new Set(activeClients?.map((c: any) => c.id));
          // All converted contacts exclude the lead entity (whether client active or not)
          convertedContacts.forEach((c: any) => excludedEntityIds.add(c.entity_id));
        }

        // Ghost lead check: entity has active contact + active client
        const remainingEntityIds = leadEntityIds.filter(id => !excludedEntityIds.has(id));
        if (remainingEntityIds.length > 0) {
          const [{ data: activeContacts }, { data: directActiveClients }] = await Promise.all([
            supabase.from("anew_contacts").select("entity_id, converted_to_client_id").in("entity_id", remainingEntityIds).neq("status", "inactive"),
            supabase.from("anew_clients").select("entity_id").in("entity_id", remainingEntityIds).not("status", "in", '("inactive","lost","churned","lost_definitive")'),
          ]);

          const directActiveClientEntityIds = new Set((directActiveClients || []).map((c: any) => c.entity_id));

          if (activeContacts?.length) {
            const withClient = activeContacts.filter((c: any) => c.converted_to_client_id);
            if (withClient.length) {
              const cIds = withClient.map((c: any) => c.converted_to_client_id);
              const { data: activeCli } = await supabase
                .from("anew_clients").select("id").in("id", cIds)
                .not("status", "in", '("inactive","lost","churned","lost_definitive")');
              const activeCliIds = new Set(activeCli?.map((c: any) => c.id));
              withClient.filter((c: any) => activeCliIds.has(c.converted_to_client_id)).forEach((c: any) => excludedEntityIds.add(c.entity_id));
            }

            const withoutClient = activeContacts.filter((c: any) => !c.converted_to_client_id);
            withoutClient.filter((c: any) => directActiveClientEntityIds.has(c.entity_id)).forEach((c: any) => excludedEntityIds.add(c.entity_id));
          }
        }

        if (excludedEntityIds.size > 0) {
          console.log(`[notifications] Leads: excluded ${excludedEntityIds.size} entity_ids via chain validation`);
          filteredLeads = filteredLeads.filter(l => !l.entity_id || !excludedEntityIds.has(l.entity_id));
        }
      }

      // Group leads by user (synchronous user resolution via preloaded map)
      const leadsByUser = new Map<string, { orgId: string; normal: string[]; urgent: string[] }>();

      for (const lead of filteredLeads) {
        const orgId = lead.organization_id;
        const ownerId = lead.assigned_to || lead.created_by;
        if (!ownerId) continue;
        const authUserId = smartResolveUserId(ownerId);
        if (!authUserId) continue;

        const referenceDate = lead.last_contact_at || lead.created_at;
        if (!referenceDate) continue;
        const daysSince = Math.floor((now.getTime() - new Date(referenceDate).getTime()) / 86400000);
        const key = `${authUserId}::${orgId}`;

        if (!leadsByUser.has(key)) leadsByUser.set(key, { orgId, normal: [], urgent: [] });
        const group = leadsByUser.get(key)!;

        const cfgUrgent = getAlertConfig(orgId, "lead_no_contact_urgent");
        const cfgNormal = getAlertConfig(orgId, "lead_no_contact");
        if (cfgUrgent.is_active && cfgUrgent.days_threshold && daysSince >= cfgUrgent.days_threshold) {
          group.urgent.push(lead.id);
        } else if (cfgNormal.is_active && cfgNormal.days_threshold && daysSince >= cfgNormal.days_threshold) {
          group.normal.push(lead.id);
        }
      }

      for (const [compositeKey, group] of leadsByUser) {
        const userId = compositeKey.split("::")[0];
        if (group.urgent.length > 0) {
          const cfg = getAlertConfig(group.orgId, "lead_no_contact_urgent");
          notifications.push({
            user_id: userId, organization_id: group.orgId, kind: "alert",
            type: "lead_no_contact_urgent", entity_type: "lead", entity_id: userId,
            title: `${pl(group.urgent.length, "lead", "leads")} sem contacto há +${cfg.days_threshold} dias`,
            message: `Tem ${pl(group.urgent.length, "lead", "leads")} que ${group.urgent.length === 1 ? "precisa" : "precisam"} de atenção urgente.`,
            priority: "high", action_type: "call_now", link: "/leads",
            action_config: { entity_ids: group.urgent, count: group.urgent.length },
          });
        }
        if (group.normal.length > 0) {
          const cfg = getAlertConfig(group.orgId, "lead_no_contact");
          notifications.push({
            user_id: userId, organization_id: group.orgId, kind: "alert",
            type: "lead_no_contact", entity_type: "lead", entity_id: userId,
            title: `${pl(group.normal.length, "lead", "leads")} sem contacto há +${cfg.days_threshold} dias`,
            message: `Considere contactar ${group.normal.length === 1 ? "este lead" : `estes ${group.normal.length} leads`}.`,
            priority: "medium", link: "/leads",
            action_config: { entity_ids: group.normal, count: group.normal.length },
          });
        }
      }

      // ── CONTACTS: grouped by user ──
      const { data: rawContacts } = await supabase
        .from("anew_contacts")
        .select("id, entity_id, assigned_to, created_by, organization_id, last_interaction_at, created_at, converted_at, converted_to_client_id, status")
        .is("converted_to_client_id", null)
        .neq("status", "inactive");

      let filteredContacts = rawContacts || [];
      const contactEntityIds = filteredContacts.map(c => c.entity_id).filter(Boolean) as string[];

      if (contactEntityIds.length > 0) {
        const { data: activeClientsForContacts } = await supabase
          .from("anew_clients").select("entity_id").in("entity_id", contactEntityIds)
          .not("status", "in", '("inactive","lost","churned","lost_definitive")');

        if (activeClientsForContacts?.length) {
          const ghostContactEntityIds = new Set(activeClientsForContacts.map((c: any) => c.entity_id));
          console.log(`[notifications] Contacts: excluded ${ghostContactEntityIds.size} ghost contacts`);
          filteredContacts = filteredContacts.filter(c => !c.entity_id || !ghostContactEntityIds.has(c.entity_id));
        }
      }

      // ★ OPTIMIZATION: Batch preload deals for contact_no_deal check
      const contactIdsForDeal = filteredContacts.filter(c => c.converted_at).map(c => c.id);
      const { data: dealsForDailyContacts } = contactIdsForDeal.length > 0
        ? await supabase.from("deals").select("contact_id").in("contact_id", contactIdsForDeal)
        : { data: [] };
      const contactsWithDealsDaily = new Set((dealsForDailyContacts || []).map((d: any) => d.contact_id));

      const contactsByUser = new Map<string, { orgId: string; normal: string[]; urgent: string[]; noDeal: string[] }>();

      for (const co of filteredContacts) {
        const orgId = co.organization_id;
        const ownerId = co.assigned_to || co.created_by;
        if (!ownerId) continue;
        const authUserId = smartResolveUserId(ownerId);
        if (!authUserId) continue;
        const key = `${authUserId}::${orgId}`;

        if (!contactsByUser.has(key)) contactsByUser.set(key, { orgId, normal: [], urgent: [], noDeal: [] });
        const group = contactsByUser.get(key)!;

        const referenceDate = co.last_interaction_at || co.created_at;
        if (referenceDate) {
          const daysSince = Math.floor((now.getTime() - new Date(referenceDate).getTime()) / 86400000);
          const cfgUrgent = getAlertConfig(orgId, "contact_no_contact_urgent");
          const cfgNormal = getAlertConfig(orgId, "contact_no_contact");

          if (cfgUrgent.is_active && cfgUrgent.days_threshold && daysSince >= cfgUrgent.days_threshold) {
            group.urgent.push(co.id);
          } else if (cfgNormal.is_active && cfgNormal.days_threshold && daysSince >= cfgNormal.days_threshold) {
            group.normal.push(co.id);
          }
        }

        const cfgNoDeal = getAlertConfig(orgId, "contact_no_deal");
        if (cfgNoDeal.is_active && cfgNoDeal.days_threshold && co.converted_at) {
          const daysSinceConversion = Math.floor((now.getTime() - new Date(co.converted_at).getTime()) / 86400000);
          if (daysSinceConversion >= cfgNoDeal.days_threshold && !contactsWithDealsDaily.has(co.id)) {
            group.noDeal.push(co.id);
          }
        }
      }

      for (const [compositeKey, group] of contactsByUser) {
        const userId = compositeKey.split("::")[0];
        if (group.urgent.length > 0) {
          const cfg = getAlertConfig(group.orgId, "contact_no_contact_urgent");
          notifications.push({
            user_id: userId, organization_id: group.orgId, kind: "alert",
            type: "contact_no_contact_urgent", entity_type: "contact", entity_id: userId,
            title: `${pl(group.urgent.length, "contacto", "contactos")} sem interação há +${cfg.days_threshold} dias`,
            message: `Tem ${pl(group.urgent.length, "contacto", "contactos")} que ${group.urgent.length === 1 ? "precisa" : "precisam"} de atenção urgente.`,
            priority: "high", action_type: "call_now", link: "/contacts",
            action_config: { entity_ids: group.urgent, count: group.urgent.length },
          });
        }
        if (group.normal.length > 0) {
          const cfg = getAlertConfig(group.orgId, "contact_no_contact");
          notifications.push({
            user_id: userId, organization_id: group.orgId, kind: "alert",
            type: "contact_no_contact", entity_type: "contact", entity_id: userId,
            title: `${pl(group.normal.length, "contacto", "contactos")} sem interação há +${cfg.days_threshold} dias`,
            message: `Considere fazer follow-up com ${group.normal.length === 1 ? "este contacto" : `estes ${group.normal.length} contactos`}.`,
            priority: "medium", link: "/contacts",
            action_config: { entity_ids: group.normal, count: group.normal.length },
          });
        }
        if (group.noDeal.length > 0) {
          const cfg = getAlertConfig(group.orgId, "contact_no_deal");
          notifications.push({
            user_id: userId, organization_id: group.orgId, kind: "alert",
            type: "contact_no_deal", entity_type: "contact", entity_id: userId,
            title: `${pl(group.noDeal.length, "contacto", "contactos")} sem pedido de proposta há +${cfg.days_threshold} dias`,
            message: `${group.noDeal.length === 1 ? "Este contacto foi convertido" : "Estes contactos foram convertidos"} mas não ${group.noDeal.length === 1 ? "tem" : "têm"} pedido de proposta criado.`,
            priority: "medium", link: "/contacts",
            action_config: { entity_ids: group.noDeal, count: group.noDeal.length },
          });
        }
      }

      // ── CLIENTS: grouped by user ──
      const { data: clients } = await supabase
        .from("anew_clients")
        .select("id, assigned_to, created_by, organization_id, last_interaction_at, created_at, entity_id, status")
        .not("status", "in", '("inactive","lost","churned","lost_definitive")');

      // ★ OPTIMIZATION: Batch preload fiscal entities for all clients
      const clientEntityIdsForNif = (clients || []).map((c: any) => c.entity_id).filter(Boolean) as string[];
      const { data: clientFiscalEntities } = clientEntityIdsForNif.length > 0
        ? await supabase.from("anew_entity_fiscal_entities").select("entity_id").in("entity_id", clientEntityIdsForNif)
        : { data: [] };
      const entitiesWithFiscalDaily = new Set((clientFiscalEntities || []).map((f: any) => f.entity_id));

      const clientsByUser = new Map<string, { orgId: string; normal: string[]; urgent: string[]; missingNif: string[] }>();

      for (const c of clients || []) {
        const orgId = c.organization_id;
        const ownerId = c.assigned_to || c.created_by;
        if (!ownerId) continue;
        const authUserId = smartResolveUserId(ownerId);
        if (!authUserId) continue;
        const key = `${authUserId}::${orgId}`;

        if (!clientsByUser.has(key)) clientsByUser.set(key, { orgId, normal: [], urgent: [], missingNif: [] });
        const group = clientsByUser.get(key)!;

        const referenceDate = c.last_interaction_at || c.created_at;
        if (referenceDate) {
          const daysSince = Math.floor((now.getTime() - new Date(referenceDate).getTime()) / 86400000);
          const cfgUrgent = getAlertConfig(orgId, "client_no_contact_urgent");
          const cfgNormal = getAlertConfig(orgId, "client_no_contact");

          if (cfgUrgent.is_active && cfgUrgent.days_threshold && daysSince >= cfgUrgent.days_threshold) {
            group.urgent.push(c.id);
          } else if (cfgNormal.is_active && cfgNormal.days_threshold && daysSince >= cfgNormal.days_threshold) {
            group.normal.push(c.id);
          }
        }

        const cfgNif = getAlertConfig(orgId, "client_missing_nif");
        if (cfgNif.is_active && c.entity_id && !entitiesWithFiscalDaily.has(c.entity_id)) {
          group.missingNif.push(c.id);
        }
      }

      for (const [compositeKey, group] of clientsByUser) {
        const userId = compositeKey.split("::")[0];
        if (group.urgent.length > 0) {
          const cfg = getAlertConfig(group.orgId, "client_no_contact_urgent");
          notifications.push({
            user_id: userId, organization_id: group.orgId, kind: "alert",
            type: "client_no_contact_urgent", entity_type: "client", entity_id: userId,
            title: `${pl(group.urgent.length, "cliente", "clientes")} sem contacto há +${cfg.days_threshold} dias`,
            message: `Tem ${pl(group.urgent.length, "cliente", "clientes")} que ${group.urgent.length === 1 ? "precisa" : "precisam"} de atenção urgente.`,
            priority: "high", action_type: "call_now", link: "/clients",
            action_config: { entity_ids: group.urgent, count: group.urgent.length },
          });
        }
        if (group.normal.length > 0) {
          const cfg = getAlertConfig(group.orgId, "client_no_contact");
          notifications.push({
            user_id: userId, organization_id: group.orgId, kind: "alert",
            type: "client_no_contact", entity_type: "client", entity_id: userId,
            title: `${pl(group.normal.length, "cliente", "clientes")} sem contacto há +${cfg.days_threshold} dias`,
            message: `Considere contactar ${group.normal.length === 1 ? "este cliente" : `estes ${group.normal.length} clientes`}.`,
            priority: "medium", link: "/clients",
            action_config: { entity_ids: group.normal, count: group.normal.length },
          });
        }
        if (group.missingNif.length > 0) {
          notifications.push({
            user_id: userId, organization_id: group.orgId, kind: "alert",
            type: "client_missing_nif", entity_type: "client", entity_id: userId,
            title: `${pl(group.missingNif.length, "cliente", "clientes")} sem NIF`,
            message: `Tem ${pl(group.missingNif.length, "cliente", "clientes")} sem informação fiscal.`,
            priority: "low", link: "/clients",
            action_config: { entity_ids: group.missingNif, count: group.missingNif.length },
          });
        }
      }
    }

    // ─── INSERT ALL (with dedup safety) ───
    if (notifications.length > 0) {
      const { error } = await supabase.from("notifications").insert(notifications, { onConflict: "type,entity_id,user_id", ignoreDuplicates: true } as any);
      if (error && !error.message?.includes('duplicate key')) throw error;
    }

    // ─── AUDIT LOG ───
    const { count: finalActiveCount } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("is_resolved", false)
      .eq("is_dismissed", false);

    console.log(`[notifications] Done: mode=${mode}, generated=${notifications.length}, skipped_batch_dups=${queuedNotificationKeys.size - notifications.length}, resolved=${resolvedCount}, cleanup={orphans:${cleanupOrphans},dups:${cleanupDuplicates},old:${cleanupOld}}, active_total=${finalActiveCount || 0}`);

    return new Response(
      JSON.stringify({ ok: true, mode, generated: notifications.length, resolved: resolvedCount, cleanup_orphans: cleanupOrphans, cleanup_duplicates: cleanupDuplicates, cleanup_old: cleanupOld }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[notifications] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
