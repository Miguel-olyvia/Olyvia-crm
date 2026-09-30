/**
 * Resultado de rpc_update_schedule_item_assignees. Quando o recurso de uma visita
 * futura muda, a base pode mudar o dono da lead/cliente ligado (regra: dono e
 * recurso da visita futura nunca divergem) e alinhar as outras visitas futuras
 * dessa ficha; a RPC devolve o que mudou para o ecra poder avisar.
 */
export interface AssigneesUpdateResult {
  leadOwnerChanged: boolean;
  newOwnerId: string | null;
  otherVisitIds: string[];
}

export function parseAssigneesUpdateResult(data: unknown): AssigneesUpdateResult {
  const rec =
    data !== null && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  const newOwnerId = typeof rec.new_owner === 'string' ? rec.new_owner : null;
  const otherVisitIds = Array.isArray(rec.other_visit_ids)
    ? rec.other_visit_ids.filter((v): v is string => typeof v === 'string')
    : [];
  const changedEntity = typeof rec.lead_id === 'string' || typeof rec.client_id === 'string';
  return { leadOwnerChanged: changedEntity && newOwnerId !== null, newOwnerId, otherVisitIds };
}
