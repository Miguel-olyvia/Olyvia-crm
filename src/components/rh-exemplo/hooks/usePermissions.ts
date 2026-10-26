/**
 * Permissoes do utilizador, delegando ao hook real do contexto de permissoes.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import { usePermissions as usePermissionsReal } from "@/hooks/usePermissions";

export function usePermissions(): {
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  permissions: string[];
  loading: boolean;
} {
  const real = usePermissionsReal();
  return {
    hasPermission: real.hasPermission,
    hasAnyPermission: real.hasAnyPermission,
    permissions: real.permissions,
    loading: real.loading,
  };
}
