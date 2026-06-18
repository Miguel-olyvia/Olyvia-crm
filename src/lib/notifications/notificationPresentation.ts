import { supabase } from "@/integrations/supabase/client";

export type NotificationLike = {
  type: string;
  link: string | null;
  entity_type: string | null;
  entity_id: string | null;
  organization_id: string | null;
  priority: string | null;
  action_config: Record<string, any> | null;
};

export const notificationPriorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export const notificationPriorityDotColors: Record<string, string> = {
  urgent: "bg-destructive",
  high: "bg-destructive/80",
  medium: "bg-orange-500",
  low: "bg-amber-500",
};

export const notificationPriorityColors: Record<string, string> = {
  urgent: "bg-destructive text-destructive-foreground",
  high: "bg-destructive/80 text-destructive-foreground",
  medium: "bg-orange-500 text-white",
  low: "bg-amber-500 text-white",
};

export const sortNotificationsByPriority = <T extends { priority?: string | null }>(a: T, b: T) =>
  (notificationPriorityOrder[a.priority || "low"] ?? 3) - (notificationPriorityOrder[b.priority || "low"] ?? 3);

export const appendTimestamp = (route: string) => {
  const separator = route.includes("?") ? "&" : "?";
  return `${route}${separator}_t=${Date.now()}`;
};

export const getNotificationRoute = async (notification: NotificationLike): Promise<string | null> => {
  if (notification.link) return notification.link;

  const actionConfig = notification.action_config || {};
  const referenceId = actionConfig.proposal_id || actionConfig.contract_id || actionConfig.client_id || actionConfig.contact_id || actionConfig.entity_id || notification.entity_id;

  if (actionConfig.proposal_id) return `/proposals?open=${actionConfig.proposal_id}`;
  if (actionConfig.contract_id) return `/client-contracts?open=${actionConfig.contract_id}`;
  if (actionConfig.client_id) return `/clients?open=${actionConfig.client_id}`;
  if (actionConfig.contact_id && !actionConfig.entity_id) return `/contacts?open=${actionConfig.contact_id}`;

  if ((notification.type === "action_due_today" || notification.type === "action_overdue") && referenceId) {
    let clientQuery = supabase.from("anew_clients").select("id").or(`id.eq.${referenceId},entity_id.eq.${referenceId}`).neq("status", "inactive").limit(1);
    let contactQuery = supabase.from("anew_contacts").select("id").or(`id.eq.${referenceId},entity_id.eq.${referenceId}`).is("converted_to_client_id", null).neq("status", "inactive").limit(1);

    if (notification.organization_id) {
      clientQuery = clientQuery.eq("organization_id", notification.organization_id);
      contactQuery = contactQuery.eq("organization_id", notification.organization_id);
    }

    const [clientResult, contactResult] = await Promise.all([clientQuery, contactQuery]);
    const clientRecord = clientResult.data?.[0] ?? null;
    const contactRecord = contactResult.data?.[0] ?? null;

    if (clientRecord) return `/clients?open=${clientRecord.id}`;
    if (contactRecord) return `/contacts?open=${contactRecord.id}`;
  }

  if (notification.entity_type && referenceId) {
    switch (notification.entity_type) {
      case "proposal": return `/proposals?open=${referenceId}`;
      case "client": return `/clients?open=${referenceId}`;
      case "contact": return `/contacts?open=${referenceId}`;
      case "contract": return `/client-contracts?open=${referenceId}`;
      case "lead": return `/leads?open=${referenceId}`;
      case "quote": return `/quotes?open=${referenceId}`;
      case "email_tracking": return "/proposals";
      default: break;
    }
  }

  if (notification.entity_type) {
    switch (notification.entity_type) {
      case "proposal": return "/proposals";
      case "client": return "/clients";
      case "contact": return "/contacts";
      case "contract": return "/client-contracts";
      case "lead": return "/leads";
      case "quote": return "/quotes";
      default: break;
    }
  }

  return null;
};