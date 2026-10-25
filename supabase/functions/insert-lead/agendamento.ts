// insert-lead: pedido ao auto-schedule para a entidade acabada de captar.
// Liga-se por entity_id (lead = entidade sem client_since); nao ha lead_id.
// Sem imports remotos: testavel no vitest.

// deno-lint-ignore no-explicit-any
type AnyRecord = Record<string, any>;

export function montarPedidoAutoSchedule(p: {
  entityId: string;
  organizationId: string;
  fullLocation: string | undefined;
  lead: { first_name: string; last_name: string; notes?: string; postal_code?: string };
  options?: AnyRecord;
}): AnyRecord {
  const o = p.options ?? {};
  return {
    title: o.title || `Visita - ${p.lead.first_name} ${p.lead.last_name}`,
    description: o.description || p.lead.notes,
    entity_id: p.entityId,
    location: p.fullLocation,
    postal_code: p.lead.postal_code,
    duration_minutes: o.duration_minutes || 60,
    preferred_date: o.preferred_date,
    preferred_time_start: o.preferred_time_start,
    preferred_time_end: o.preferred_time_end,
    preferred_resource_ids: o.preferred_resource_ids,
    priority: o.priority,
    tags: o.tags,
    board_id: o.board_id,
    organization_id: p.organizationId,
    auto_assign: true,
    use_proximity: o.use_proximity !== false && !!p.lead.postal_code,
  };
}
