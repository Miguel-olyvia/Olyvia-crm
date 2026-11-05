// Quem pode escolher o comercial de uma pessoa ou de um negócio: `leads.assign`, a mesma permissão do servidor. neg_atribuir_pessoa
// pede-a por has_anew_permission(uid, 'leads.assign') quando a pessoa ainda não é cliente (client_since IS NULL); o gatilho
// trg_00_negocios_comercial_leads_assign pede-a sempre que negocios.assigned_to muda. Lê-se das permissões do perfil (usePermissions,
// get_user_context), como has_anew_permission, e não por fn_cat_pode: o Papel no Negócio não conta para esta.
// Enquanto as permissões carregam, `pode` é false e `aLer` é true (o ecrã desativa sem dizer porquê).
import { usePermissions } from "@/hooks/usePermissions";

export const PERMISSAO_ATRIBUIR_COMERCIAL = "leads.assign";

export function usePodeAtribuirComercial(): { pode: boolean; aLer: boolean } {
  const { hasPermission, loading } = usePermissions();
  if (loading) return { pode: false, aLer: true };
  return { pode: hasPermission(PERMISSAO_ATRIBUIR_COMERCIAL), aLer: false };
}
