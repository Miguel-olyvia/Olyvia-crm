import type { LinhaCampo } from "../domain/campos/catalogo";
import { combinarFicha, type FichaCombinada } from "../domain/campos/definicoes";

/**
 * Configuração da ficha do local da empresa (cfg_campos do CRM, migração
 * 20261209100000): campos escondidos, rótulos e campos da empresa. Lê com a
 * sessão de quem está nas Operações (RLS: membros da empresa). Sem a tabela
 * ou sem configuração: a ficha de sempre. Uma leitura por empresa.
 */
const cache = new Map<string, Promise<FichaCombinada>>();

export function camposLocalDaEmpresa(org: string): Promise<FichaCombinada> {
  let p = cache.get(org);
  if (!p) {
    p = import("./supabase")
      .then(async ({ supabase }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from("cfg_campos")
          .select("*")
          .eq("organization_id", org)
          .eq("ficha", "local")
          .order("ordem");
        return combinarFicha("local", error ? [] : ((data ?? []) as LinhaCampo[]));
      })
      .catch(() => {
        cache.delete(org);
        return combinarFicha("local", []);
      });
    cache.set(org, p);
  }
  return p;
}
