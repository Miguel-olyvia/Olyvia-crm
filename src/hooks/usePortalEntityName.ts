import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Nome atual da ficha do cliente no portal (anew_entities.display_name da
 * entidade da linha de client_portal_users ativa).
 *
 * Porquê: o `user_metadata.full_name` da conta fica congelado no momento em
 * que o acesso foi criado — se a conta nasceu com o nome de outra pessoa
 * (ex.: o cônjuge) e a ficha foi corrigida depois, o portal continuava a
 * cumprimentar o nome antigo. A RLS deixa o cliente ler a própria ficha
 * (portal_client_reads_portal_entities). Devolve null enquanto carrega, sem
 * entidade ou em erro — quem consome cai no nome dos metadados.
 */
export function usePortalEntityName(entityId: string | null | undefined): string | null {
  const { data } = useQuery({
    queryKey: ["portal-entity-name", entityId],
    enabled: !!entityId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: entity, error } = await supabase
        .from("anew_entities")
        .select("display_name")
        .eq("id", entityId as string)
        .maybeSingle();
      if (error) throw error;
      return entity?.display_name?.trim() || null;
    },
  });
  return data ?? null;
}
