import { usePermissions } from "@/hooks/usePermissions";

export interface PermissaoQuadro {
  pode: boolean;
  /** As permissões ainda carregam: «não pode» ainda não é uma resposta. */
  aCarregar: boolean;
}

/**
 * Tem `pessoas.view`? O Quadro real só se oferece a quem a tem (a rota já a exige; isto garante-o também ao nível do ecrã), e diz se a resposta
 * já é definitiva: a página não deve decidir (nem consultar a Lista no lugar do Quadro) enquanto as permissões carregam.
 * Vive aqui porque os ecrãs de Pessoas só importam hooks de `@/hooks/pessoas/`.
 */
export function usePermissaoQuadro(): PermissaoQuadro {
  const { hasPermission, loading } = usePermissions() as { hasPermission?: (codigo: string) => boolean; loading?: boolean };
  // Sem a função (a carregar, ou um simulado parcial) conta como sem permissão.
  return { pode: typeof hasPermission === "function" && hasPermission("pessoas.view"), aCarregar: loading === true };
}

/** Só a resposta («pode ver o Quadro?»), para quem não precisa de saber se ainda está a carregar. */
export function usePodeVerQuadro(): boolean {
  return usePermissaoQuadro().pode;
}
