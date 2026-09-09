import { supabase } from "./supabase";

/** Conjunto de client_ids dispensados de DUC ("não precisa de documento") numa org. */
export async function fetchDismissedClientIds(orgId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from("anew_client_duc_dismissed")
    .select("client_id")
    .eq("organization_id", orgId)
    .limit(5000);
  return new Set((data ?? []).map((r) => r.client_id as string));
}

/** Marca um cliente como dispensado. Devolve erro (ou null). */
export async function dismissClient(
  clientId: string,
  orgId: string,
  by: string | null,
  reason?: string
): Promise<string | null> {
  const { error } = await supabase.from("anew_client_duc_dismissed").insert({
    client_id: clientId,
    organization_id: orgId,
    dismissed_by: by,
    reason: reason ?? null,
  });
  return error ? error.message : null;
}

/** Repõe um cliente dispensado (volta a "Por documentar"). */
export async function restoreClient(clientId: string, orgId: string): Promise<void> {
  await supabase
    .from("anew_client_duc_dismissed")
    .delete()
    .eq("organization_id", orgId)
    .eq("client_id", clientId);
}
