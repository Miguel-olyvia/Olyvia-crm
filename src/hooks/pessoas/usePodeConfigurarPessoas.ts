import { usePermissions } from "@/hooks/usePermissions";

/**
 * Quem pode mudar o Workflow de Pessoas: tem `pessoas.config` (a permissão própria dele, não a de Leads). Enquanto as permissões carregam, ninguém pode:
 * os controlos aparecem depois, nunca aparecem e desaparecem. O ecrã só esconde; a base volta a verificar a permissão em cada gravação.
 */
export function usePodeConfigurarPessoas(): boolean {
  const { hasPermission, loading } = usePermissions();
  return !loading && hasPermission("pessoas.config");
}
