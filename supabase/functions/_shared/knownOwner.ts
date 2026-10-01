// Comercial dono de um contacto ja conhecido, para o calendario publico.
//
// Quem ja e lead/cliente da organizacao so deve ver os horarios do comercial a
// quem a ficha esta ligada. Este modulo so IDENTIFICA esse comercial (os seus
// recursos activos); nunca decide horarios -- as regras de disponibilidade,
// deslocacao, almoco, antecedencia, feriados, etc. continuam todas a aplicar-se
// ao recurso dele em public-availability. A restricao e uma intersecao.
//
// Mesma cadeia que o create-lead/book-slot usam: findLocalEntityForOrg (email
// tem prioridade sobre telefone) -> classifyEntityInOrg (cliente ganha a lead,
// dono = assigned_to ?? created_by) -> recursos activos desse utilizador.

import { classifyEntityInOrg, findLocalEntityForOrg } from "./entityScopedLookup.ts";

/** Recursos activos de um utilizador (anew_users.id) na organizacao. */
export async function resolveOwnerResourceIds(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  organizationId: string,
  anewUserId: string | null | undefined,
): Promise<string[]> {
  if (!organizationId || !anewUserId) return [];
  const { data } = await supabase
    .from("schedule_resources")
    .select("id")
    .eq("user_id", anewUserId)
    .eq("organization_id", organizationId)
    .eq("is_active", true);
  return (data ?? []).map((r: { id: string }) => r.id);
}

/**
 * Recursos do comercial dono do contacto (email/telefone), ou [] quando nao ha
 * entidade conhecida, quando a ficha nao tem dono, ou quando o dono nao tem
 * nenhum recurso activo -- em todos esses casos NAO ha restricao.
 */
export async function resolveKnownOwnerFromContact(params: {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  organizationId: string;
  email?: string | null;
  phone?: string | null;
}): Promise<string[]> {
  const { supabase, organizationId, email, phone } = params;
  if (!organizationId || (!email && !phone)) return [];

  const hit = await findLocalEntityForOrg({ supabase, organizationId, email, phone });
  if (!hit) return [];

  const summary = await classifyEntityInOrg({
    supabase,
    entityId: hit.entityId,
    organizationId,
  });
  if (!summary.targetType) return [];

  return resolveOwnerResourceIds(supabase, organizationId, summary.assigneeAnewUserId);
}

/**
 * Candidatos a que a marcacao publica pode atribuir a visita.
 *
 * Contacto SEM dono conhecido: todos (o menos ocupado/mais perto, como sempre).
 * Contacto COM dono: so os recursos do dono -- e se o dono nao tem nenhum
 * recurso activo a lista fica VAZIA (nunca "todos"): nao ha a quem marcar e o
 * pedido vai para a fila dele, em vez de a visita ser dada a outro tecnico.
 */
export function restrictCandidatesToOwner<T extends { id: string }>(
  candidates: readonly T[],
  hasKnownOwner: boolean,
  ownerResourceIds: readonly string[],
): T[] {
  if (!hasKnownOwner) return [...candidates];
  return candidates.filter((c) => ownerResourceIds.includes(c.id));
}
