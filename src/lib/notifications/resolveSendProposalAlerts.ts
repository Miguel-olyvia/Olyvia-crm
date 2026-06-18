import { supabase } from "@/integrations/supabase/client";

export async function resolveSendProposalAlerts(entityId?: string | null, organizationId?: string | null) {
  if (!entityId) return;

  const resolvedAt = new Date().toISOString();

  let interactionsQuery = supabase
    .from("entity_interactions")
    .update({ next_action_type: null, next_action_date: null })
    .eq("entity_id", entityId)
    .eq("next_action_type", "send_proposal");

  if (organizationId) {
    interactionsQuery = interactionsQuery.eq("organization_id", organizationId);
  }

  const { error: interactionsError } = await interactionsQuery;
  if (interactionsError) {
    console.error("Error resolving send_proposal interactions:", interactionsError);
  }

  let notificationsQuery = (supabase.from("notifications") as any)
    .update({
      is_resolved: true,
      resolved_at: resolvedAt,
      resolved_reason: "proposal_created",
    })
    .eq("entity_id", entityId)
    .eq("is_resolved", false)
    .in("type", ["action_overdue", "action_due_today"])
    .contains("action_config", { next_action_type: "send_proposal" });

  if (organizationId) {
    notificationsQuery = notificationsQuery.eq("organization_id", organizationId);
  }

  const { error: notificationsError } = await notificationsQuery;
  if (notificationsError) {
    console.error("Error resolving send_proposal notifications:", notificationsError);
  }
}
