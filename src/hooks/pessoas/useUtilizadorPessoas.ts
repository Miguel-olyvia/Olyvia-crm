import { usePermissionScope } from "@/hooks/usePermissionScope";

/**
 * O `anew_users.id` de quem está na sessão, na organização ativa (o mesmo que a página de Leads usa em «Só os meus»), ou `null` até a
 * leitura acabar. Vive aqui porque a Lista real só importa hooks de `@/hooks/pessoas/`.
 */
export function useUtilizadorPessoas(): string | null {
  return usePermissionScope().anewUserId ?? null;
}
