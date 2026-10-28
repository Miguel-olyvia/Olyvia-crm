// Wrapper: o que quem está ligado pode fazer às roles (roles.create / edit / delete e o âmbito de cada uma), com as regras
// de Roles.tsx. A lógica está em `rolesReais.autorizacoesRole` (pura e testada); aqui só se ligam as permissões reais.
import { useMemo } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { canActOnEntity, usePermissionScope } from "@/hooks/usePermissionScope";
import { autorizacoesRole, type AutorizacoesRole } from "../rolesReais";

export function useAutorizacoesRoles(): AutorizacoesRole {
  const { hasPermission } = usePermissions();
  const { getPermissionScope, anewUserId, authUserId } = usePermissionScope();
  const podeCriar = hasPermission("roles.create");
  const podeEditar = hasPermission("roles.edit");
  const podeEliminar = hasPermission("roles.delete");
  const ambitoEditar = getPermissionScope("roles.edit");
  const ambitoEliminar = getPermissionScope("roles.delete");
  return useMemo(
    () => autorizacoesRole(
      { podeCriar, podeEditar, podeEliminar, ambitoEditar, ambitoEliminar, anewUserId },
      (ambito, entidade, utilizador) => canActOnEntity(ambito, entidade, utilizador, authUserId),
    ),
    [podeCriar, podeEditar, podeEliminar, ambitoEditar, ambitoEliminar, anewUserId, authUserId],
  );
}
