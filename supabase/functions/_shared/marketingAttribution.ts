// Marketing attribution for public leads. Fully fail-soft.
// Should only be called when embedKind === "utm" AND lead has campaign_id + id.

import { resolveChannel } from "./resolveChannel.ts";

const UTM_ALIAS_RE = /^[a-z0-9_-]+$/;

/**
 * Resolve source_id by matching utm_source against lead_sources.utm_aliases.
 * - Normalizes utm_source to lowercase + trim.
 * - Only allows [a-z0-9_-] (defence-in-depth; UI enforces same shape).
 * - Scope: org-local + globals (organization_id IS NULL).
 * - Tie-break: org-local wins over global; then created_at ASC, id ASC.
 * - Fully fail-soft: returns null on any error.
 */
async function resolveSourceDirect(
  supabase: any,
  organizationId: string,
  utmSourceRaw: unknown,
): Promise<string | null> {
  try {
    if (typeof utmSourceRaw !== "string") return null;
    const normalized = utmSourceRaw.toLowerCase().trim();
    if (!normalized || !UTM_ALIAS_RE.test(normalized)) return null;

    const { data, error } = await supabase
      .from("lead_sources")
      .select("id, organization_id, created_at")
      .eq("is_active", true)
      .contains("utm_aliases", [normalized])
      .or(`organization_id.eq.${organizationId},organization_id.is.null`)
      .limit(10);

    if (error) {
      console.warn("[attribution] resolveSourceDirect query error", error);
      return null;
    }
    const rows = (data as any[]) || [];
    if (rows.length === 0) return null;

    const sortKey = (r: any) =>
      `${String(r.created_at ?? "")}\u0000${String(r.id ?? "")}`;
    const local = rows
      .filter((r) => r.organization_id === organizationId)
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    const global = rows
      .filter((r) => r.organization_id == null)
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

    const chosen = local[0] ?? global[0] ?? null;
    if (!chosen) return null;

    if (local.length + global.length > 1) {
      console.warn("[attribution] resolveSourceDirect multiple matches; picking deterministic", {
        normalized,
        organizationId,
        chosenId: chosen.id,
        totalMatches: local.length + global.length,
      });
    }
    return chosen.id ?? null;
  } catch (e) {
    console.warn("[attribution] resolveSourceDirect failed", e);
    return null;
  }
}

interface RunArgs {
  supabase: any;
  anewLeadId: string;
  campaignId: string;
  tracking: Record<string, any> | null | undefined;
  contactName?: string | null;
  leadStatus?: string | null;
}

export async function runMarketingAttribution(args: RunArgs): Promise<void> {
  const { supabase, anewLeadId, campaignId, tracking, contactName, leadStatus } = args;
  try {
    if (!campaignId || !anewLeadId) return;

    // 1. Existing campaign_leads row for (campaign_id, anew_lead_id)?
    const { data: existing, error: selErr } = await supabase
      .from("campaign_leads")
      .select("id, channel_id, source, medium, content, term, landing_page, referrer, status, notes")
      .eq("campaign_id", campaignId)
      .eq("anew_lead_id", anewLeadId)
      .maybeSingle();

    if (selErr) {
      console.error("[attribution] select existing failed", selErr);
      // continue — best effort
    }

    // 2. Resolve channel (never throws)
    const channelId = await resolveChannel({ supabase, campaignId, tracking });

    // 2b. Resolve organization id (needed for utm_aliases fallback scope).
    let organizationId: string | null = null;
    {
      const { data: campaignOrg } = await supabase
        .from("campaigns")
        .select("organization_id")
        .eq("id", campaignId)
        .maybeSingle();
      organizationId = (campaignOrg as any)?.organization_id ?? null;
    }

    // 2c. Lookup source via channel (UTM → channel → source). Also bring type/name
    //     to detect fallback channels (direct / *default*) for alias resolution below.
    let channelSourceId: string | null = null;
    let chType: string | null = null;
    let chName: string | null = null;
    if (channelId) {
      const { data: chData } = await supabase
        .from("channels")
        .select("source_id, type, name")
        .eq("id", channelId)
        .maybeSingle();
      channelSourceId = (chData as any)?.source_id ?? null;
      chType = (chData as any)?.type ?? null;
      chName = (chData as any)?.name ?? null;
    }

    // 2d. Fallback: if no source via channel AND channel is a fallback one (or none),
    //     try to resolve source by matching utm_source against lead_sources.utm_aliases.
    const isFallbackChannel =
      !channelId ||
      chType === "direct" ||
      String(chName ?? "").toLowerCase().includes("default");

    if (!channelSourceId && isFallbackChannel && tracking?.utm_source && organizationId) {
      channelSourceId = await resolveSourceDirect(supabase, organizationId, tracking.utm_source);
    }

    const applyLeadSource = async () => {
      if (!channelSourceId) return;
      const { error: leadSrcErr } = await supabase
        .from("anew_leads")
        .update({ source_id: channelSourceId })
        .eq("id", anewLeadId)
        .is("source_id", null); // só preenche se ainda não houver source manual
      if (leadSrcErr) console.error("[attribution] anew_leads source_id update failed", leadSrcErr);
    };

    const t = tracking ?? {};
    const newSource: string | null = t.utm_source ?? null;
    const newMedium: string | null = t.utm_medium ?? null;
    const newContent: string | null = t.utm_content ?? null;
    const newTerm: string | null = t.utm_term ?? null;
    const newLand: string | null = t.landing_page ?? null;
    const newRef: string | null = t.referrer ?? null;

    if (existing) {
      // AUDIT 03 #3: Update ONLY attribution fields. Never touches campaign_leads.status,
      // anew_leads.status or channel_metrics.leads. Preserves existing values when new is null.
      const { error: updErr } = await supabase
        .from("campaign_leads")
        .update({
          channel_id: channelId ?? existing.channel_id,
          source: newSource ?? existing.source,
          medium: newMedium ?? existing.medium,
          content: newContent ?? existing.content,
          term: newTerm ?? existing.term,
          landing_page: newLand ?? existing.landing_page,
          referrer: newRef ?? existing.referrer,
        })
        .eq("id", existing.id);
      if (updErr) console.error("[attribution] update failed", updErr);
      await applyLeadSource();
      return; // never increments on update
    }

    // 3. Insert new row
    const { error: insErr } = await supabase.from("campaign_leads").insert({
      campaign_id: campaignId,
      anew_lead_id: anewLeadId,
      channel_id: channelId,
      source: newSource,
      medium: newMedium,
      content: newContent,
      term: newTerm,
      landing_page: newLand,
      referrer: newRef,
      status: leadStatus === "incomplete" ? "incomplete" : "new",
      notes: contactName ? `Lead: ${contactName}` : null,
    });

    if (insErr) {
      // Distinguir race (unique violation) de erros reais.
      if ((insErr as any)?.code === "23505") {
        // Race real: outro pedido criou a linha entretanto. Fazer merge dos UTMs novos não-vazios.
        console.warn("[attribution] race detected, merging UTMs into existing row", {
          campaignId,
          anewLeadId,
        });
        const { data: winner, error: winSelErr } = await supabase
          .from("campaign_leads")
          .select("id, channel_id, source, medium, content, term, landing_page, referrer")
          .eq("campaign_id", campaignId)
          .eq("anew_lead_id", anewLeadId)
          .maybeSingle();
        if (winSelErr || !winner) {
          console.error("[attribution] post-race select failed", winSelErr);
          return;
        }
        const { error: mergeErr } = await supabase
          .from("campaign_leads")
          .update({
            channel_id: channelId ?? winner.channel_id,
            source: newSource ?? winner.source,
            medium: newMedium ?? winner.medium,
            content: newContent ?? winner.content,
            term: newTerm ?? winner.term,
            landing_page: newLand ?? winner.landing_page,
            referrer: newRef ?? winner.referrer,
          })
          .eq("id", winner.id);
        if (mergeErr) console.error("[attribution] post-race merge failed", mergeErr);
        await applyLeadSource().catch(() => {});
        return;
      }
      // Erro não-race: propagar para o try/catch externo fazer log com contexto.
      throw insErr;
    }

    // Insert bem-sucedido — atribuir source à lead (best-effort).
    await applyLeadSource();

    // 4. (Deprecated) channel_metrics.leads is no longer incremented.
    //    Leads/conversions são agora derivados de campaign_leads + anew_leads
    //    via v_channel_lead_facts e get_channel_dashboard.
  } catch (e) {
    console.error("[attribution] non-fatal", e);
  }
}
