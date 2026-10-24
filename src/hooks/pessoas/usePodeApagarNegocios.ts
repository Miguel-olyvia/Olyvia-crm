import { usePermissionScope } from "@/hooks/usePermissionScope";

/**
 * Tem `pessoas.delete` (com qualquer âmbito)? Serve para mostrar o lixo de negócios: quem não pode apagar nem restaurar não o vê. O âmbito
 * exato (todos, equipa, os seus) é a base que o decide, por negócio, ao apagar e ao restaurar: um «não» dela aparece traduzido (42501).
 * Vive aqui porque os ecrãs de Pessoas só importam hooks de `@/hooks/pessoas/`.
 */
export function usePodeApagarNegocios(): boolean {
  const { getPermissionScope } = usePermissionScope() as { getPermissionScope?: (codigo: string) => string };
  // Sem a função (a carregar, ou um simulado parcial) conta como sem permissão.
  return typeof getPermissionScope === "function" && getPermissionScope("pessoas.delete") !== "NONE";
}
