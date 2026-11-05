// 4/11: grava a morada principal da ficha do cliente (RPC sync_entity_primary_address) e DEVOLVE a decisão da RPC. O linkEntityAddress
// (src/utils/entityContactSync.ts) só olha para o erro: a RPC recusa lixo («n/a», «-», 0000-000) com skip_filler e skip_no_valid_source SEM
// erro, e aí nada ficou gravado. Quem usa este wrapper decide pela decisão, não pela ausência de erro.
import { supabase } from "@/integrations/supabase/client";

/** As únicas decisões em que a morada ficou mesmo ligada à ficha. */
export const DECISOES_GRAVADAS: ReadonlySet<string> = new Set(["inserted", "repointed", "noop_already_linked"]);

export interface MoradaParaGravar { rua: string; cp: string; localidade: string }

/** A decisão da RPC («inserted», «repointed», «noop_already_linked», «skip_filler», «skip_no_valid_source»...). Lança se a RPC der erro. */
export async function gravarMoradaPrincipal(entityId: string, organizationId: string, m: MoradaParaGravar): Promise<string> {
  const { data, error } = await supabase.rpc("sync_entity_primary_address", {
    p_entity_id: entityId,
    p_organization_id: organizationId,
    p_street: m.rua.trim(),
    p_postal_code: m.cp.trim(),
    p_city: m.localidade.trim() || null,
    p_district: null,
    p_created_by: null,
  });
  if (error) throw error;
  const linha = Array.isArray(data) ? data[0] : data;
  return String((linha as { decision?: unknown } | null | undefined)?.decision ?? "sem_resposta");
}
