import { supabase } from "./supabase";

export interface OrgMember {
  /** anew_users.id — o "business user" do sistema Olyvia. */
  id: string;
  name: string;
}

/** Code do role de portal na Olyvia. Contas de cliente do portal recebem uma
 * membership ativa com este role (ver `create-client-portal-access`) — partilham
 * `anew_users`/`anew_memberships` com os business users, por isso só o code do
 * role as distingue. NÃO são utilizadores do sistema e nunca devem aparecer como
 * membros (responsáveis, destinatários, @menções, etc.). */
export const PORTAL_CLIENT_ROLE_CODE = "client";

/**
 * Dos `role_ids` dados, o subconjunto que corresponde a contas de PORTAL
 * (role code `client`). `anew_memberships` não tem FK (o PostgREST não resolve
 * embeds `anew_roles!inner(...)` — PGRST200), por isso resolvemos os codes num
 * lookup direto em `anew_roles`, o mesmo padrão do backend (`hasNonClientRole`).
 */
export async function fetchPortalClientRoleIds(roleIds: string[]): Promise<Set<string>> {
  const ids = Array.from(new Set(roleIds.filter(Boolean)));
  if (ids.length === 0) return new Set();
  const { data } = await supabase.from("anew_roles").select("id, code").in("id", ids);
  const portal = new Set<string>();
  (data ?? []).forEach((r) => {
    if ((r.code as string) === PORTAL_CLIENT_ROLE_CODE) portal.add(r.id as string);
  });
  return portal;
}

/**
 * Membros ATIVOS de uma organização (para atribuir responsáveis/destinatários de
 * notificações por etapa). Arranca de `anew_memberships` e resolve o nome em
 * `anew_users`. EXCLUI contas de portal (role `client`): apesar de terem
 * membership ativa na org, são clientes e não utilizadores do sistema.
 */
export async function fetchOrgMembers(orgId: string): Promise<OrgMember[]> {
  const { data: memberships } = await supabase
    .from("anew_memberships")
    .select("user_id, role_id")
    .eq("organization_id", orgId)
    .eq("status", "active");

  const rows = (memberships ?? []).filter((m) => m.user_id);
  if (rows.length === 0) return [];

  // Remove as memberships de portal antes de resolver os utilizadores. Um user
  // com pelo menos uma membership NÃO-cliente continua a ser membro (pode
  // acumular papéis); só é excluído quem tem apenas o role de cliente.
  const portalRoleIds = await fetchPortalClientRoleIds(
    rows.map((m) => m.role_id as string)
  );
  const ids = Array.from(
    new Set(
      rows
        .filter((m) => !(m.role_id && portalRoleIds.has(m.role_id as string)))
        .map((m) => m.user_id as string)
    )
  );
  if (ids.length === 0) return [];

  const { data: users } = await supabase.from("anew_users").select("id, name").in("id", ids);

  return (users ?? [])
    .map((u) => ({ id: u.id as string, name: (u.name as string) ?? "Utilizador" }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt"));
}
