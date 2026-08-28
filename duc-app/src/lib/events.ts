import { supabase } from "./supabase";

export type DucEventType =
  | "created"
  | "stage_closed"
  | "stage_reopened"
  | "stage_skipped"
  | "stage_unskipped"
  | "status_changed"
  | "stage_moved"
  | "field_changed"
  | "note";

export interface DucEvent {
  id?: string;
  duc_id: string;
  organization_id: string;
  event_type: DucEventType;
  stage_no?: number | null;
  field_key?: string | null;
  detail?: string | null;
  actor_id?: string | null;
  actor_name?: string | null;
  created_at?: string;
}

/**
 * Regista um evento de auditoria do DUC. Best-effort: se a tabela ainda não
 * estiver aplicada (ver duc-app/db/schema.sql §8) ou a RLS recusar, apenas
 * regista no console — nunca bloqueia a UI.
 */
export async function logDucEvent(e: Omit<DucEvent, "id" | "created_at">): Promise<void> {
  const { error } = await supabase.from("anew_client_duc_events").insert(e);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[DUC] auditoria não gravada (tabela/RLS?):", error.message);
  }
}

/** Lê o histórico de eventos de um DUC (mais recente primeiro). */
export async function fetchDucEvents(ducId: string): Promise<DucEvent[]> {
  const { data, error } = await supabase
    .from("anew_client_duc_events")
    .select(
      "id, duc_id, organization_id, event_type, stage_no, field_key, detail, actor_name, created_at"
    )
    .eq("duc_id", ducId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return [];
  return (data ?? []) as DucEvent[];
}
