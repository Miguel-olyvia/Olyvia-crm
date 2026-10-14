/**
 * Passagem livre: na apresentação toda a gente pode tudo, porque o objectivo é
 * mostrar cada ecrã por inteiro. Nunca altera o `usePermissions` real.
 */
export function usePermissions(): {
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  permissions: string[];
  loading: boolean;
} {
  return {
    hasPermission: () => true,
    hasAnyPermission: () => true,
    permissions: [],
    loading: false,
  };
}
