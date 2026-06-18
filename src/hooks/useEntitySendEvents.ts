import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SendEvent {
  id: string;
  channel: "email" | "whatsapp" | "portal" | "manual";
  docType: "proposal" | "quote" | "contract" | "email" | null;
  docId: string | null;
  docTitle: string | null;
  subject: string | null;
  recipient: string | null;
  status: string;
  sentAt: string;
  openedCount: number;
  clickedCount: number;
  bodyHtml: string | null;
  actorId: string | null;
}

/**
 * Loads every "send" event linked to an entity:
 * - proposal_sends, quote_sends, contract_sends (email/whatsapp/portal)
 * - client_portal_users (portal access link sends)
 * - email_logs (free-form emails not tied to a document)
 *
 * Includes fallback resolution for legacy quotes/proposals with NULL entity_id
 * (via cliente_id → anew_clients.entity_id, and deal_id → deals.entity_id).
 *
 * Used by Emails tab and Timeline. Dedups email_logs against *_sends within ±60s
 * to avoid showing the same logical send twice.
 */
export function useEntitySendEvents(entityId: string | null | undefined) {
  const [events, setEvents] = useState<SendEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!entityId) {
      setEvents([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // 1) Direct doc lookup by entity_id
        const [propsRes, quotesRes, contractsRes, portalRes] = await Promise.all([
          (supabase as any).from("proposals").select("id, title, deal_id").eq("entity_id", entityId),
          (supabase as any).from("quotes").select("id, title, cliente_id").eq("entity_id", entityId),
          (supabase as any).from("client_contracts").select("id, contract_number").eq("entity_id", entityId),
          (supabase as any)
            .from("client_portal_users")
            .select("id, proposal_id, contract_id, quote_id, created_by, created_at")
            .eq("entity_id", entityId),
        ]);

        // 2) Fallback for legacy docs with NULL entity_id
        // quotes via cliente_id → anew_clients(entity_id)
        const { data: clientsForEntity } = await (supabase as any)
          .from("anew_clients")
          .select("id")
          .eq("entity_id", entityId);
        const clientIds: string[] = (clientsForEntity || []).map((c: any) => c.id);

        let quotesFallback: any[] = [];
        if (clientIds.length) {
          const { data } = await (supabase as any)
            .from("quotes")
            .select("id, title, cliente_id")
            .in("cliente_id", clientIds)
            .is("entity_id", null);
          quotesFallback = data || [];
        }

        // proposals via deal_id → deals.entity_id
        const { data: dealsForEntity } = await (supabase as any)
          .from("deals")
          .select("id")
          .eq("entity_id", entityId);
        const dealIds: string[] = (dealsForEntity || []).map((d: any) => d.id);

        let proposalsFallback: any[] = [];
        let quotesDealFallback: any[] = [];
        if (dealIds.length) {
          const [propsByDeal, quotesByDeal] = await Promise.all([
            (supabase as any)
              .from("proposals")
              .select("id, title, deal_id")
              .in("deal_id", dealIds)
              .is("entity_id", null),
            (supabase as any)
              .from("quotes")
              .select("id, title, cliente_id")
              .in("deal_id", dealIds)
              .is("entity_id", null),
          ]);
          proposalsFallback = propsByDeal.data || [];
          quotesDealFallback = quotesByDeal.data || [];
        }

        const allProps = [...(propsRes.data || []), ...proposalsFallback];
        const allQuotes = [...(quotesRes.data || []), ...quotesFallback, ...quotesDealFallback];
        const propIds: string[] = allProps.map((p: any) => p.id);
        const quoteIds: string[] = allQuotes.map((q: any) => q.id);
        const contractIds: string[] = (contractsRes.data || []).map((c: any) => c.id);

        const propTitles: Record<string, string> = {};
        allProps.forEach((p: any) => { propTitles[p.id] = p.title; });
        const quoteTitles: Record<string, string> = {};
        allQuotes.forEach((q: any) => { quoteTitles[q.id] = q.title; });
        const contractTitles: Record<string, string> = {};
        (contractsRes.data || []).forEach((c: any) => { contractTitles[c.id] = c.contract_number; });

        const [propSendsRes, quoteSendsRes, contractSendsRes, emailLogsRes] = await Promise.all([
          propIds.length
            ? (supabase as any).from("proposal_sends").select("*").in("proposal_id", propIds)
            : Promise.resolve({ data: [] }),
          quoteIds.length
            ? (supabase as any).from("quote_sends").select("*").in("quote_id", quoteIds)
            : Promise.resolve({ data: [] }),
          contractIds.length
            ? (supabase as any).from("contract_sends").select("*").in("contract_id", contractIds)
            : Promise.resolve({ data: [] }),
          (supabase as any).from("email_logs").select("*").eq("entity_id", entityId).eq("status", "sent"),
        ]);

        const out: SendEvent[] = [];

        (propSendsRes.data || []).forEach((s: any) => {
          out.push({
            id: "ps-" + s.id,
            channel: (s.channel as any) || "email",
            docType: "proposal",
            docId: s.proposal_id,
            docTitle: propTitles[s.proposal_id] || null,
            subject: s.subject || `Proposta: ${propTitles[s.proposal_id] || ""}`,
            recipient: s.recipient_name || s.recipient_email,
            status: s.status || "sent",
            sentAt: s.sent_at || s.created_at,
            openedCount: s.open_count || 0,
            clickedCount: s.first_link_clicked_at ? 1 : 0,
            bodyHtml: s.message || null,
            actorId: s.sent_by || null,
          });
        });

        (quoteSendsRes.data || []).forEach((s: any) => {
          out.push({
            id: "qs-" + s.id,
            channel: (s.channel as any) || "email",
            docType: "quote",
            docId: s.quote_id,
            docTitle: quoteTitles[s.quote_id] || null,
            subject: s.subject || `Orçamento: ${quoteTitles[s.quote_id] || ""}`,
            recipient: s.recipient_name || s.recipient_email,
            status: s.status || "sent",
            sentAt: s.sent_at || s.created_at,
            openedCount: s.open_count || 0,
            clickedCount: s.first_link_clicked_at ? 1 : 0,
            bodyHtml: s.message || null,
            actorId: s.sent_by || null,
          });
        });

        (contractSendsRes.data || []).forEach((s: any) => {
          out.push({
            id: "cs-" + s.id,
            channel: (s.channel as any) || "email",
            docType: "contract",
            docId: s.contract_id,
            docTitle: contractTitles[s.contract_id] || null,
            subject: s.subject || `Contrato: ${contractTitles[s.contract_id] || ""}`,
            recipient: s.recipient_name || s.recipient_email,
            status: s.status || "sent",
            sentAt: s.sent_at || s.created_at,
            openedCount: s.open_count || 0,
            clickedCount: s.first_link_clicked_at ? 1 : 0,
            bodyHtml: s.message || null,
            actorId: s.sent_by || null,
          });
        });

        (portalRes.data || []).forEach((pu: any) => {
          const docType: SendEvent["docType"] = pu.proposal_id
            ? "proposal"
            : pu.quote_id
            ? "quote"
            : pu.contract_id
            ? "contract"
            : null;
          const docId = pu.proposal_id || pu.quote_id || pu.contract_id || null;
          const docTitle = docType === "proposal"
            ? propTitles[docId!] || null
            : docType === "quote"
            ? quoteTitles[docId!] || null
            : docType === "contract"
            ? contractTitles[docId!] || null
            : null;
          const label = docType === "proposal" ? "proposta" : docType === "quote" ? "orçamento" : docType === "contract" ? "contrato" : "documento";
          out.push({
            id: "portal-" + pu.id,
            channel: "portal",
            docType,
            docId,
            docTitle,
            subject: `Link do Portal Cliente enviado (${label})${docTitle ? ` - ${docTitle}` : ""}`,
            recipient: null,
            status: "portal",
            sentAt: pu.created_at,
            openedCount: 0,
            clickedCount: 0,
            bodyHtml: null,
            actorId: pu.created_by || null,
          });
        });

        // email_logs with dedup ±60s vs existing email-channel sends
        const emailLogs = emailLogsRes.data || [];
        const existingEmailSends = out.filter(e => e.channel === "email");
        emailLogs.forEach((log: any) => {
          const sentAt = log.sent_at || log.created_at;
          const sentTs = new Date(sentAt).getTime();
          const dup = existingEmailSends.some(s =>
            (s.recipient || "") === (log.to_email || "") &&
            (s.subject || "") === (log.subject || "") &&
            Math.abs(new Date(s.sentAt).getTime() - sentTs) <= 60_000
          );
          if (dup) return;
          out.push({
            id: "el-" + log.id,
            channel: "email",
            docType: "email",
            docId: null,
            docTitle: null,
            subject: log.subject || null,
            recipient: log.to_email || null,
            status: log.status || "sent",
            sentAt,
            openedCount: 0,
            clickedCount: 0,
            bodyHtml: log.body_html || null,
            actorId: log.sent_by || null,
          });
        });

        out.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
        if (!cancelled) setEvents(out);
      } catch (e) {
        console.error("[useEntitySendEvents] error:", e);
        if (!cancelled) setEvents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [entityId]);

  return { events, loading };
}
