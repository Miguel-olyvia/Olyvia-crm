import { supabase } from "./supabase";

export interface PublicShare {
  id: string;
  token: string;
  created_at: string;
  expires_at: string | null;
}

/** Token longo e imprevisível (dois UUID concatenados, sem hífens). */
function genToken(): string {
  const a = crypto.randomUUID().replace(/-/g, "");
  const b = crypto.randomUUID().replace(/-/g, "");
  return a + b;
}

/** Partilhas públicas ativas de um DUC. */
export async function fetchShares(ducId: string): Promise<PublicShare[]> {
  const { data } = await supabase
    .from("anew_client_duc_public_shares")
    .select("id, token, created_at, expires_at")
    .eq("duc_id", ducId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  return (data ?? []) as PublicShare[];
}

/** Cria um link público. Devolve o token ou uma mensagem de erro. */
export async function createShare(
  ducId: string,
  orgId: string,
  createdBy: string | null
): Promise<{ token: string } | { error: string }> {
  const token = genToken();
  const { error } = await supabase.from("anew_client_duc_public_shares").insert({
    duc_id: ducId,
    organization_id: orgId,
    token,
    created_by: createdBy,
  });
  return error ? { error: error.message } : { token };
}

/** Revoga (soft) um link público. */
export async function revokeShare(id: string): Promise<void> {
  await supabase
    .from("anew_client_duc_public_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);
}

/* -------------------------------------------------- Leitura pública (token) -- */

export interface PublicDucData {
  duc: {
    duc_number: string | null;
    title: string | null;
    variant: string;
    status: string;
    current_stage: number;
    blocks: Record<string, Record<string, unknown>>;
    tracking: Array<{ stage: number; state: string; date?: string | null; signed_by?: string | null }>;
    created_at: string;
    updated_at: string;
  };
  client_name: string | null;
  items: Array<{
    section: string;
    position: number;
    label: string | null;
    description: string | null;
    qty: number | null;
    unit: string | null;
    included: boolean | null;
    meta: Record<string, unknown>;
  }>;
}

/** Lê um DUC pela partilha pública (sem login, via RPC SECURITY DEFINER). */
export async function getPublicDuc(token: string): Promise<PublicDucData | null> {
  const { data, error } = await supabase.rpc("get_duc_public", { p_token: token });
  if (error || !data) return null;
  return data as PublicDucData;
}
