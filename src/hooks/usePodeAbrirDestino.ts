import { useCallback } from "react";
import { usePermissionsOpcional } from "@/contexts/PermissionsContext";
import { podeAbrirDestino } from "@/lib/rotasForaDoMenu";

/**
 * `(destino) => boolean`: se a sessão pode abrir o destino com a mesma guarda da rota (páginas fora do menu: Pedidos, Orçamentos,
 * Propostas, Contratos — ver lib/rotasForaDoMenu.ts). Enquanto as permissões carregam diz que não (nada se mostra às cegas); fora do
 * PermissionsProvider não restringe (a rota continua a guardar).
 */
export function usePodeAbrirDestino(): (destino: string) => boolean {
  const permissoes = usePermissionsOpcional();
  const loading = permissoes?.loading ?? false;
  const hasPermission = permissoes?.hasPermission;
  return useCallback(
    (destino: string): boolean => {
      if (!hasPermission) return true;
      if (loading) return podeAbrirDestino(destino, () => false);
      return podeAbrirDestino(destino, hasPermission);
    },
    [hasPermission, loading],
  );
}
