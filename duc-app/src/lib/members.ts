import { supabase } from "./supabase";

export interface OrgMember {
  /** anew_users.id — o "business user" do sistema Olyvia. */
  id: string;
  name: string;
}

/**
 * Membros ATIVOS de uma organização (para atribuir destinatários de notificações
 * por etapa). Arranca de `anew_memberships` e resolve o nome em `anew_users`.
 */
export async function fetchOrgMembers(orgId: string): Promise<OrgMember[]> {
  const { data: memberships } = await supabase
    .from("anew_memberships")
    .select("user_id")
    .eq("organization_id", orgId)
    .eq("status", "active");

  const ids = Array.from(
    new Set((memberships ?? []).map((m) => m.user_id as string).filter(Boolean))
  );
  if (ids.length === 0) return [];

  const { data: users } = await supabase.from("anew_users").select("id, name").in("id", ids);

  return (users ?? [])
    .map((u) => ({ id: u.id as string, name: (u.name as string) ?? "Utilizador" }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt"));
}
