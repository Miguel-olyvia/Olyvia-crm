// auto-schedule: ligacao da visita a ENTIDADE (schedule_items.entity_id).
// As colunas lead_id e client_id ja nao existem em schedule_items; lead =
// entidade sem client_since. Sem imports remotos: testavel no vitest.

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

/** Colunas de ligacao de uma visita criada pelo auto-schedule. */
export function ligacaoDaVisita(request: {
  entity_id?: string | null;
  contact_id?: string | null;
  deal_id?: string | null;
}): { entity_id: string | null; contact_id: string | null; deal_id: string | null } {
  return {
    entity_id: request.entity_id ?? null,
    contact_id: request.contact_id ?? null,
    deal_id: request.deal_id ?? null,
  };
}

/**
 * Chamada maquina (sem JWT): herda-se o criador da visita da entidade
 * (created_by), na organizacao e se nao apagada. Erro de leitura devolve
 * ok:false para nao ser confundido com "entidade sem criador".
 */
export async function criadorDaEntidade(
  supabase: SupabaseLike,
  entityId: string,
  organizationId: string,
): Promise<{ ok: true; userId: string | null } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('anew_entities')
    .select('created_by')
    .eq('id', entityId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) return { ok: false, error: `leitura da entidade falhou: ${error.message}` };
  return { ok: true, userId: data?.created_by ?? null };
}
