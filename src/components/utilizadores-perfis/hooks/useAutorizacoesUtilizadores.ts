// Wrapper: liga as regras de autorização de utilizadores (autorizacoesUtilizadores.ts, puras) às permissões, ao âmbito
// (canActOnEntity) e à organização reais. Mesmas guardas de UsersNew.tsx.
import { useMemo } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { canActOnEntity, usePermissionScope } from "@/hooks/usePermissionScope";
import { criarAutorizacoes, type AutorizacoesUtilizadores } from "../autorizacoesUtilizadores";
import type { Utilizador } from "../tipos";

export function useAutorizacoesUtilizadores(todos: readonly Utilizador[]): AutorizacoesUtilizadores {
  const { activeCompany } = useCompany();
  const { hasPermission } = usePermissions();
  const escopo = usePermissionScope();
  const { getPermissionScope, anewUserId, authUserId, anewRoleCode, teamMemberIds } = escopo;
  return useMemo(() => criarAutorizacoes({
    authUserId, anewUserId, anewRoleCode, orgAtivaId: activeCompany?.id, todos,
    tem: hasPermission,
    podeAgir: (permissao, alvo) => canActOnEntity(getPermissionScope(permissao), { created_by: alvo.criadoPor }, anewUserId, authUserId, teamMemberIds),
  }), [authUserId, anewUserId, anewRoleCode, activeCompany?.id, todos, hasPermission, getPermissionScope, teamMemberIds]);
}
