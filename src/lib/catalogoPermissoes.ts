// 18/11/2026: a leitura do catálogo de permissões (anew_permissions), partilhada pelo editor de perfis (useCatalogoPermissoes) e
// pelo PermissionsProvider (nomes dos avisos de «sem permissão»). Mesma chave e mesma função → uma só cache no react-query.
import { supabase } from "@/integrations/supabase/client";
import type { LinhaPermissao } from "@/components/utilizadores-perfis/rolesReais";

export const CATALOGO_PERMISSOES_QUERY_KEY = ["anew_permissions"] as const;

export async function lerCatalogoPermissoes(): Promise<LinhaPermissao[]> {
  const { data, error } = await supabase.from("anew_permissions").select("*").order("display_order");
  if (error) throw error;
  return (data ?? []) as unknown as LinhaPermissao[];
}
